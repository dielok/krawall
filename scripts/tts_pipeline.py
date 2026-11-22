#!/usr/bin/env python3
"""Generate missing WAV masters on Athene and make local MP3 app assets."""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from generate import (  # noqa: E402
    BASE_VOICE,
    DEFAULT_INPUT,
    EMOTION_CUES,
    MODEL_ID,
    build_jobs,
    max_new_tokens_for_text,
    stable_seed,
    validate_input,
)


DEFAULT_REMOTE_DIR = ".local/lib/tts-service"
DEFAULT_REMOTE_PYTHON = "services/quiz-krawall-tts/.venv/bin/python"
MP3_BITRATE = "64k"
MP3_SAMPLE_RATE = "24000"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=ROOT / "output")
    parser.add_argument("--host", default=os.environ.get("KRAWALL_TTS_HOST", "athene"))
    parser.add_argument(
        "--remote-python",
        default=os.environ.get("KRAWALL_TTS_REMOTE_PYTHON", DEFAULT_REMOTE_PYTHON),
    )
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--dry-run", action="store_true", help="Show conversion/generation counts without changing files or contacting Athene")
    parser.add_argument("--convert-only", action="store_true", help="Convert available WAV masters, but do not contact Athene or generate audio")
    return parser.parse_args()


def as_home_path(path: str) -> str:
    if path.startswith("~/"):
        return f"$HOME/{path[2:]}"
    if path.startswith("./"):
        path = path[2:]
    return f"$HOME/{path}" if not path.startswith("/") else path


def relpath(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def build_plan(
    data: dict[str, Any], output_dir: Path, seed: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, dict[str, Any]]]:
    requests: list[dict[str, Any]] = []
    conversions: list[dict[str, Any]] = []
    existing_mp3s: list[dict[str, Any]] = []
    targets: dict[str, dict[str, Any]] = {}
    destination_ids: dict[Path, str] = {}
    profile = data.get("tts_profile", {})
    shared_voice = " ".join(
        part.strip()
        for part in (BASE_VOICE, str(profile.get("voice_direction", "")))
        if part and part.strip()
    )

    for item in validate_input(data):
        emotion = str(item.get("emotion", "")).lower()
        jobs = build_jobs(item, data)
        expected_keys = [job["key"] for job in jobs]
        for job in jobs:
            wav_path = output_dir / job["filename"]
            mp3_path = wav_path.with_suffix(".mp3")
            request_id = f"{item['id']}::{job['key']}"
            if request_id in targets:
                raise ValueError(f"Duplicate generated request ID: {request_id}")
            if mp3_path in destination_ids:
                raise ValueError(
                    f"IDs {destination_ids[mp3_path]!r} and {item['id']!r} map to the same MP3: {mp3_path}"
                )
            destination_ids[mp3_path] = item["id"]

            request = {
                "request_id": request_id,
                "text": job["text"],
                "language": "German",
                "voice": shared_voice,
                "emotion": EMOTION_CUES.get(emotion, ""),
                "direction": str(item.get("direction", "")),
                "seed": stable_seed(seed, item["id"], job["key"]),
            }
            target = {
                "request_id": request_id,
                "wav_path": wav_path,
                "mp3_path": mp3_path,
                "item": item,
                "job": job,
                "expected_keys": expected_keys,
                "instruction": " ".join(
                    part for part in (shared_voice, request["emotion"], request["direction"]) if part
                ),
            }
            targets[request_id] = target

            # Existing delivery or master files are immutable; only missing MP3s are filled.
            if mp3_path.exists():
                existing_mp3s.append(target)
            elif wav_path.exists():
                conversions.append(target)
            else:
                requests.append(request)
    return requests, conversions, existing_mp3s, targets


def install_server(host: str, remote_dir: str) -> None:
    remote_dir_expr = as_home_path(remote_dir)
    subprocess.run(["ssh", host, f'mkdir -p "{remote_dir_expr}"'], check=True)
    remote_file = f"{remote_dir.rstrip('/')}/tts_server.py"
    subprocess.run(
        ["scp", "-q", str(SCRIPTS / "tts_server.py"), f"{host}:{remote_file}"],
        check=True,
    )


def safe_save_wav(path: Path, wav_bytes: bytes) -> bool:
    if len(wav_bytes) <= 44 or wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
        raise ValueError(f"Server returned invalid WAV data for {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=path.parent, prefix=f".{path.name}.", suffix=".tmp.wav", delete=False
        ) as handle:
            temporary_path = handle.name
            handle.write(wav_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary_path, path)
            return True
        except FileExistsError:
            return False
    finally:
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass


def probe_mp3(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
            "stream=codec_name,channels,sample_rate", "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(result.stdout).get("streams", [])
    if not streams or streams[0].get("codec_name") != "mp3" or streams[0].get("channels") != 1:
        raise ValueError(f"Encoded file is not mono MP3: {path}")
    return streams[0]


def convert_wav_to_mp3(source: Path, destination: Path) -> bool:
    """Encode to a temporary file, then link without ever replacing an existing MP3."""
    if destination.exists():
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=destination.parent, prefix=f".{destination.name}.", suffix=".tmp.mp3", delete=False
        ) as handle:
            temporary_path = handle.name
        subprocess.run(
            [
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(source), "-vn", "-map_metadata", "-1", "-ac", "1",
                "-ar", MP3_SAMPLE_RATE, "-c:a", "libmp3lame", "-b:a", MP3_BITRATE,
                temporary_path,
            ],
            check=True,
        )
        encoded_path = Path(temporary_path)
        if not encoded_path.is_file() or encoded_path.stat().st_size == 0:
            raise ValueError(f"Encoder returned an empty MP3 for {source}")
        probe_mp3(encoded_path)
        try:
            os.link(encoded_path, destination)
            return True
        except FileExistsError:
            return False
    finally:
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass


def wav_info(path: Path) -> tuple[int, float]:
    with wave.open(str(path), "rb") as source:
        return source.getframerate(), source.getnframes() / source.getframerate()


def save_manifest(
    path: Path,
    target: dict[str, Any],
    *,
    generated: bool,
    request: dict[str, Any] | None = None,
    response: dict[str, Any] | None = None,
) -> None:
    if path.exists():
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or not isinstance(manifest.get("entries"), dict):
            raise ValueError(f"Invalid manifest structure: {path}")
    else:
        manifest = {"schema_version": 1, "entries": {}}

    item = target["item"]
    job = target["job"]
    entries = manifest["entries"]
    row = entries.get(item["id"], {})
    if not generated and isinstance(row, dict) and isinstance(row.get("variants"), list):
        current = next(
            (value for value in row["variants"] if isinstance(value, dict) and value.get("key") == job["key"]),
            None,
        )
        if current and all((
            current.get("path") == relpath(target["wav_path"]),
            current.get("master_path") == relpath(target["wav_path"]),
            current.get("app_path") == relpath(target["mp3_path"]),
            current.get("delivery_format") == "mp3",
            current.get("delivery_bitrate_kbps") == 64,
            current.get("status") == "success",
        )):
            return
    if not isinstance(row, dict):
        row = {}
    if not isinstance(row.get("variants"), list):
        row = {**row, "id": item["id"], "variants": []}
    variants = row["variants"]
    variant = next((value for value in variants if isinstance(value, dict) and value.get("key") == job["key"]), None)
    if variant is None:
        variant = {"key": job["key"]}
        variants.append(variant)

    wav_path = target["wav_path"]
    mp3_path = target["mp3_path"]
    rate, duration = wav_info(wav_path)
    variant.update({
        "key": job["key"],
        "values": job["values"],
        "path": relpath(wav_path),
        "master_path": relpath(wav_path),
        "app_path": relpath(mp3_path),
        "delivery_format": "mp3",
        "delivery_bitrate_kbps": 64,
        "sample_rate": response.get("sample_rate", rate) if response else rate,
        "duration_seconds": response.get("duration_seconds", duration) if response else duration,
        "status": "success",
    })

    # Only an actual TTS request establishes new source metadata. Converting an old
    # master updates delivery paths but never rewrites its recorded spoken text.
    if generated and request:
        row.update({"id": item["id"], "source_text": item["text"], "text": item["text"]})
        variant.update({
            "text": job["text"],
            "source_text": item["text"],
            "model": MODEL_ID,
            "voice_design": {
                "language": request["language"],
                "instruction": target["instruction"],
                "dtype": "float16",
                "device": "cuda:0",
            },
            "generation_parameters": {
                "max_new_tokens": max_new_tokens_for_text(job["text"]),
                "seed": request["seed"],
            },
            "error": None,
        })
        row["voice_design"] = {"language": request["language"], "instruction": target["instruction"]}
    elif "id" not in row:
        row["id"] = item["id"]

    indexed_variants = {value.get("key"): value for value in variants if isinstance(value, dict)}
    row["status"] = "success" if all(
        indexed_variants.get(key, {}).get("status") == "success"
        and indexed_variants.get(key, {}).get("app_path")
        for key in target["expected_keys"]
    ) else "pending"
    entries[item["id"]] = row
    manifest["model"] = MODEL_ID
    manifest["app_audio_format"] = {"codec": "mp3", "channels": 1, "bitrate_kbps": 64}
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as handle:
            temporary = handle.name
            json.dump(manifest, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def drain_stderr(pipe: Any) -> None:
    for line in pipe:
        print(line, end="", file=sys.stderr)


def save_delivery(
    target: dict[str, Any],
    *,
    wav_bytes: bytes | None = None,
    request: dict[str, Any] | None = None,
    response: dict[str, Any] | None = None,
) -> str:
    wav_path = target["wav_path"]
    mp3_path = target["mp3_path"]
    if mp3_path.exists():
        return "existing"
    generated = False
    if wav_bytes is not None and not wav_path.exists():
        generated = safe_save_wav(wav_path, wav_bytes)
    if not wav_path.exists():
        raise FileNotFoundError(f"No WAV master available for {target['request_id']}")
    converted = convert_wav_to_mp3(wav_path, mp3_path)
    if not mp3_path.exists():
        raise RuntimeError(f"MP3 was not created for {target['request_id']}")
    save_manifest(
        ROOT / "manifest.json",
        target,
        generated=generated,
        request=request if generated else None,
        response=response if generated else None,
    )
    return "created" if converted else "existing"


def main() -> int:
    args = parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    requests, conversions, existing_mp3s, targets = build_plan(data, args.output, args.seed)
    print(
        f"Clips: {len(targets)} total; {len(existing_mp3s)} MP3 already present; "
        f"{len(conversions)} WAV→MP3 conversions; {len(requests)} Athene TTS requests."
    )
    if args.dry_run:
        print("Dry run: no files, manifest, or server state changed; no SSH connection made.")
        return 0

    if not conversions and not requests:
        print("All app MP3 files already exist; nothing to do.")
        return 0
    missing_tools = [name for name in ("ffmpeg", "ffprobe") if not shutil.which(name)]
    if missing_tools:
        print(f"Missing local tool(s): {', '.join(missing_tools)}. Install FFmpeg first.", file=sys.stderr)
        return 2

    failures = 0
    for target in conversions:
        try:
            save_delivery(target)
            print(f"CONVERTED {relpath(target['wav_path'])} → {relpath(target['mp3_path'])}")
        except Exception as exc:
            failures += 1
            print(f"FAILED conversion {target['request_id']}: {type(exc).__name__}: {exc}", file=sys.stderr)

    for target in existing_mp3s:
        try:
            if target["wav_path"].exists():
                save_manifest(ROOT / "manifest.json", target, generated=False)
        except Exception as exc:
            failures += 1
            print(f"FAILED manifest update {target['request_id']}: {type(exc).__name__}: {exc}", file=sys.stderr)

    if requests:
        if args.convert_only:
            print(f"Conversion-only mode: {len(requests)} clip(s) still need a WAV master; no TTS request sent.")
            requests = []

    if requests:
        host = args.host
        remote_dir = os.environ.get("KRAWALL_TTS_REMOTE_DIR", DEFAULT_REMOTE_DIR)
        remote_python = as_home_path(args.remote_python)
        remote_server = as_home_path(f"{remote_dir.rstrip('/')}/tts_server.py")
        print(f"Deploying generic WAV-only TTS service to {host}:{remote_dir} …")
        try:
            install_server(host, remote_dir)
            remote_command = f"exec \"{remote_python}\" \"{remote_server}\""
            process = subprocess.Popen(
                ["ssh", host, remote_command],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                bufsize=1,
            )
        except (OSError, subprocess.CalledProcessError) as exc:
            print(f"Could not start Athene TTS service: {exc}", file=sys.stderr)
            return 1

        assert process.stdin is not None and process.stdout is not None and process.stderr is not None
        stderr_thread = threading.Thread(target=drain_stderr, args=(process.stderr,), daemon=True)
        stderr_thread.start()

        def send_requests() -> None:
            assert process.stdin is not None
            try:
                for request in requests:
                    process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
                    process.stdin.flush()
            except BrokenPipeError:
                pass
            finally:
                process.stdin.close()

        writer = threading.Thread(target=send_requests, daemon=True)
        writer.start()

        received: set[str] = set()
        request_by_id = {request["request_id"]: request for request in requests}
        for line in process.stdout:
            try:
                response = json.loads(line)
                request_id = response.get("request_id")
                if request_id not in request_by_id:
                    raise ValueError(f"Unknown request ID in server response: {request_id!r}")
                if request_id in received:
                    raise ValueError(f"Duplicate response from server: {request_id}")
                received.add(request_id)
                if response.get("error"):
                    failures += 1
                    print(f"FAILED {request_id}: {response['error']}", file=sys.stderr)
                    continue
                wav = base64.b64decode(response["wav_base64"], validate=True)
                target = targets[request_id]
                save_delivery(target, wav_bytes=wav, request=request_by_id[request_id], response=response)
                print(f"GENERATED {relpath(target['wav_path'])} and {relpath(target['mp3_path'])}")
            except Exception as exc:
                failures += 1
                print(f"FAILED server response: {type(exc).__name__}: {exc}", file=sys.stderr)

        writer.join()
        stderr_thread.join()
        return_code = process.wait()
        missing = set(request_by_id) - received
        if missing:
            failures += len(missing)
            print(f"FAILED: server returned no response for {len(missing)} clip(s)", file=sys.stderr)
        if return_code:
            failures += 1
            print(f"SSH TTS process exited with status {return_code}", file=sys.stderr)

    if failures:
        print(f"TTS pipeline finished with {failures} error(s).", file=sys.stderr)
        return 1
    if args.convert_only:
        print("WAV-to-MP3 conversion finished; existing WAV masters were preserved.")
    else:
        print("TTS pipeline finished: WAV masters preserved; MP3 app assets are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
