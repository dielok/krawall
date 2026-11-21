#!/usr/bin/env python3
"""Generate resumable Qwen3-TTS audio clips from quiz-krawall-tts.json."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "input" / "quiz-krawall-tts.json"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
BASE_VOICE = (
    "A German male game show host with an extremely energetic, theatrical and "
    "playful personality. Fast-paced, highly expressive delivery, dramatic "
    "pauses, exaggerated excitement, sudden whispers and explosive celebrations. "
    "Warm, funny, slightly chaotic, never aggressive or intimidating. Perfect "
    "for a humorous children's quiz show. Speak natural standard German (Hochdeutsch), "
    "with clear pronunciation suitable for very young children."
)
EMOTION_CUES = {
    "excited": "Very excited and energetic.",
    "cheerful": "Cheerful and bright.",
    "jubilant": "Exuberant, celebratory, and warmly delighted.",
    "curious": "Curious, playful, and inviting, with a dramatic pause before the question.",
    "friendly": "Warm, friendly, and playful.",
    "clear": "Clear, measured, and easy for a young child to understand.",
    "kind": "Kind and reassuring; encourage the child without sounding disappointed.",
    "gentle": "Gentle and calm, while staying warm and playful.",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=ROOT / "output")
    parser.add_argument("--manifest", type=Path, default=ROOT / "manifest.json")
    parser.add_argument("--id", action="append", dest="ids", help="Generate only this ID; repeatable")
    parser.add_argument("--force", action="store_true", help="Regenerate existing selected clips")
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--dtype", choices=("float16", "bfloat16"), default="float16")
    parser.add_argument("--seed", type=int, default=2026, help="Base seed; each ID/variant gets a stable derived seed")
    parser.add_argument("--test", action="store_true", help="Generate the three source-backed test clips")
    for name in ("question_number", "points", "total"):
        parser.add_argument(f"--{name.replace('_', '-')}", type=int, help=f"Explicit value for {{{name}}} template")
    return parser.parse_args()


def safe_filename(entry_id: str) -> str:
    name = re.sub(r"[^A-Za-z0-9_.-]+", "_", entry_id).strip("._")
    if not name:
        raise ValueError(f"ID cannot form a safe filename: {entry_id!r}")
    return f"{name}.wav"


def voice_instruction(item: dict[str, Any], profile: dict[str, Any]) -> str:
    cues = [BASE_VOICE, profile.get("voice_direction", "")]
    emotion = EMOTION_CUES.get(str(item.get("emotion", "")).lower())
    if emotion:
        cues.append(emotion)
    if item.get("direction"):
        cues.append(str(item["direction"]))
    return " ".join(cue.strip() for cue in cues if cue and cue.strip())


def max_new_tokens_for_text(text: str) -> int:
    """Give longer lines more room while bounding runaway short-phrase generations."""
    word_count = max(1, len(re.findall(r"\w+", text, flags=re.UNICODE)))
    return min(2048, max(32, word_count * 9 + 12))


def stable_seed(base_seed: int, entry_id: str, variant_key: str) -> int:
    digest = hashlib.sha256(f"{base_seed}:{entry_id}:{variant_key}".encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def load_manifest(path: Path) -> dict[str, Any]:
    if path.exists():
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(value, dict) and isinstance(value.get("entries"), dict):
                return value
        except (OSError, json.JSONDecodeError):
            pass
    return {"schema_version": 1, "entries": {}}


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def has_valid_completed_wav(path: Path, row: dict[str, Any], sf: Any, source_text: str, model_id: str) -> bool:
    if (row.get("status") != "success" or row.get("source_text") != source_text
            or row.get("model") != model_id or not path.is_file() or path.stat().st_size <= 44):
        return False
    try:
        info = sf.info(str(path))
        return info.frames > 0 and info.channels == 1
    except (RuntimeError, OSError):
        return False


def validate_input(data: dict[str, Any]) -> list[dict[str, Any]]:
    items = data.get("items")
    if not isinstance(items, list):
        raise ValueError("Input JSON must contain an items array")
    ids = [item.get("id") for item in items]
    if any(not isinstance(entry_id, str) or not entry_id for entry_id in ids):
        raise ValueError("Every item must have a non-empty string id")
    if len(ids) != len(set(ids)):
        raise ValueError("Item IDs must be unique")
    if any(not isinstance(item.get("text"), str) for item in items):
        raise ValueError("Every item must have a string text")
    return items


def build_jobs(item: dict[str, Any], data: dict[str, Any], overrides: dict[str, int | None] | None = None) -> list[dict[str, Any]]:
    """Expand supported runtime placeholders into source-backed spoken variants."""
    overrides = overrides or {}
    variables = item.get("variables", [])
    placeholders = re.findall(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", item["text"])
    if set(placeholders) != set(variables):
        raise ValueError(f"Template variables do not match placeholders for {item['id']}: {variables} vs {placeholders}")
    if not variables:
        return [{"key": "default", "text": item["text"], "values": {}, "filename": safe_filename(item["id"])}]

    settings_text = " ".join(
        str(row.get("text", "")) for row in data.get("items", []) if row.get("id") == "settings.title"
    ).casefold()
    number_words = {"fünf": 5, "fuenf": 5, "zehn": 10, "zwanzig": 20}
    available_totals = [value for word, value in number_words.items() if word in settings_text]
    if not available_totals:
        available_totals = [int(data.get("question_count", 0))]

    candidates: list[dict[str, int]] = [{}]
    if variables == ["question_number"]:
        values = [overrides["question_number"]] if overrides.get("question_number") is not None else list(range(1, int(data["question_count"]) + 1))
        if any(value < 1 or value > int(data["question_count"]) for value in values):
            raise ValueError(f"question_number values must be between 1 and {data['question_count']}")
        candidates = [{"question_number": value} for value in values]
    elif variables == ["points", "total"]:
        if overrides.get("points") is not None and overrides.get("total") is not None:
            totals = [overrides["total"]]
            point_values = [overrides["points"]]
        elif overrides.get("total") is not None:
            totals = [overrides["total"]]
            point_values = None
        elif overrides.get("points") is not None:
            totals = [total for total in available_totals if total >= overrides["points"]]
            point_values = [overrides["points"]]
        else:
            totals = available_totals
            point_values = None
        candidates = [
            {"points": points, "total": total}
            for total in totals
            for points in (point_values if point_values is not None else range(total + 1))
        ]
        if not candidates or any(row["total"] < 1 or row["points"] < 0 or row["points"] > row["total"] for row in candidates):
            raise ValueError(f"Invalid points/total values for {item['id']}")
    else:
        raise ValueError(f"Unsupported runtime template variables for {item['id']}: {variables}")

    jobs = []
    for values in candidates:
        if any("{" + key + "}" not in item["text"] for key in values):
            raise ValueError(f"Template {item['id']} is missing a declared placeholder")
        spoken_text = item["text"]
        for key, value in values.items():
            spoken_text = spoken_text.replace("{" + key + "}", str(value))
        key = ".".join(f"{name}-{value:02d}" for name, value in values.items())
        filename = safe_filename(item["id"])[:-4] + "." + key + ".wav"
        jobs.append({"key": key, "text": spoken_text, "values": values, "filename": filename})
    return jobs


def main() -> int:
    args = parse_args()
    try:
        import soundfile as sf
        import torch
        from qwen_tts import Qwen3TTSModel
    except ImportError as exc:
        print(f"Missing runtime dependency: {exc}. Install requirements from README.md.", file=sys.stderr)
        return 2

    data = json.loads(args.input.read_text(encoding="utf-8"))
    items = validate_input(data)
    profile = data.get("tts_profile", {})
    vars_map = {
        key: value for key, value in {
            "question_number": args.question_number,
            "points": args.points,
            "total": args.total,
        }.items() if value is not None
    }
    selected_ids = set(args.ids or [])
    if args.test:
        selected_ids = {"welcome.title", "q01.question", "feedback.correct"}
        if args.output == ROOT / "output":
            args.output = ROOT / "tests"
        if args.manifest == ROOT / "manifest.json":
            args.manifest = ROOT / "tests" / "manifest.json"
    if selected_ids:
        unknown = selected_ids - {item["id"] for item in items}
        if unknown:
            print(f"Unknown ID(s): {', '.join(sorted(unknown))}", file=sys.stderr)
            return 2
        items = [item for item in items if item["id"] in selected_ids]

    args.output.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest(args.manifest)
    rows = manifest["entries"]
    dtype = getattr(torch, args.dtype)
    model = None
    failures = 0
    job_count = 0
    for item in items:
        entry_id = item["id"]
        jobs = build_jobs(item, data, vars_map)
        if args.test:
            test_names = {"welcome.title": "welcome.wav", "q01.question": "question.wav", "feedback.correct": "correct.wav"}
            if entry_id in test_names:
                jobs[0]["filename"] = test_names[entry_id]
        row = rows.get(entry_id, {})
        if row.get("source_text") != item["text"] or not isinstance(row.get("variants"), list):
            row = {"id": entry_id, "source_text": item["text"], "text": item["text"], "variants": []}
            rows[entry_id] = row
        variants = row["variants"]
        instruction = voice_instruction(item, profile)
        for job in jobs:
            job_count += 1
            wav_path = args.output / job["filename"]
            variant = next((v for v in variants if v.get("key") == job["key"]), None)
            if variant is None:
                variant = {"key": job["key"]}
                variants.append(variant)
            if not args.force and has_valid_completed_wav(wav_path, variant, sf, job["text"], MODEL_ID):
                info = sf.info(str(wav_path))
                variant.update({"path": str(wav_path.relative_to(ROOT)) if wav_path.is_relative_to(ROOT) else str(wav_path), "duration_seconds": info.duration})
                continue

            variant.update({
                "values": job["values"],
                "text": job["text"],
                "source_text": item["text"],
                "path": str(wav_path.relative_to(ROOT)) if wav_path.is_relative_to(ROOT) else str(wav_path),
                "duration_seconds": None,
                "status": "running",
                "model": MODEL_ID,
                "voice_design": {"language": "German", "instruction": instruction, "dtype": args.dtype, "device": args.device},
                "generation_parameters": {
                    "max_new_tokens": max_new_tokens_for_text(job["text"]),
                    "seed": stable_seed(args.seed, entry_id, job["key"]),
                },
                "error": None,
            })
            row["status"] = "running"
            manifest["model"] = MODEL_ID
            manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
            save_manifest(args.manifest, manifest)
            started = time.monotonic()
            generation_started = started
            try:
                if model is None:
                    model_load_started = time.monotonic()
                    model = Qwen3TTSModel.from_pretrained(
                        MODEL_ID,
                        device_map=args.device,
                        dtype=dtype,
                        attn_implementation="sdpa",
                    )
                    manifest["model_load_seconds"] = round(time.monotonic() - model_load_started, 3)
                    save_manifest(args.manifest, manifest)
                generation_started = time.monotonic()
                if torch.cuda.is_available() and str(args.device).startswith("cuda"):
                    torch.cuda.reset_peak_memory_stats()
                seed = variant["generation_parameters"]["seed"]
                torch.manual_seed(seed)
                if torch.cuda.is_available() and str(args.device).startswith("cuda"):
                    torch.cuda.manual_seed_all(seed)
                with torch.inference_mode():
                    wavs, sample_rate = model.generate_voice_design(
                        text=job["text"],
                        language="German",
                        instruct=instruction,
                        max_new_tokens=variant["generation_parameters"]["max_new_tokens"],
                    )
                audio = wavs[0]
                if getattr(audio, "ndim", 1) > 1:
                    audio = audio.squeeze()
                sf.write(str(wav_path), audio, sample_rate, subtype="PCM_16")
                info = sf.info(str(wav_path))
                if info.frames < 1 or info.channels != 1 or info.samplerate != sample_rate:
                    raise RuntimeError(f"Unexpected WAV properties: {info}")
                variant.update({"duration_seconds": info.duration, "sample_rate": sample_rate, "status": "success"})
            except Exception as exc:  # Keep batch progress even if one entry fails.
                failures += 1
                variant.update({"status": "failed", "error": f"{type(exc).__name__}: {exc}"})
                if wav_path.exists() and wav_path.stat().st_size == 0:
                    wav_path.unlink()
                print(f"FAILED {entry_id}[{job['key']}]: {variant['error']}", file=sys.stderr)
            finally:
                variant["generation_seconds"] = round(time.monotonic() - generation_started, 3)
                manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
                save_manifest(args.manifest, manifest)
                if torch.cuda.is_available() and str(args.device).startswith("cuda"):
                    variant["peak_gpu_memory_mb"] = round(torch.cuda.max_memory_allocated() / 1024**2, 1)
                    save_manifest(args.manifest, manifest)
                print(f"{variant['status'].upper()} {entry_id}[{job['key']}]: {variant['path']} ({variant['duration_seconds']})")
        expected_keys = {job["key"] for job in build_jobs(item, data)}
        indexed_variants = {variant.get("key"): variant for variant in variants}
        states = [indexed_variants.get(key, {}).get("status") for key in expected_keys]
        row["status"] = (
            "failed" if "failed" in states
            else "success" if states and all(state == "success" for state in states)
            else "running" if "running" in states
            else "pending"
        )
        row["voice_design"] = {"language": "German", "instruction": instruction}
        save_manifest(args.manifest, manifest)

    print(f"Processed {job_count} audio jobs from {len(items)} selected entries; failures: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
