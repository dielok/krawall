#!/usr/bin/env python3
"""Validate generated WAVs and all source-backed runtime template variants."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.generate import build_jobs, validate_input


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "input" / "quiz-krawall-tts.json")
    parser.add_argument("--output", type=Path, default=ROOT / "output")
    parser.add_argument("--manifest", type=Path, default=ROOT / "manifest.json")
    args = parser.parse_args()
    try:
        import soundfile as sf
        import numpy as np
    except ImportError as exc:
        print(f"Missing validation dependency: {exc}", file=sys.stderr)
        return 2

    args.input = args.input.resolve()
    args.output = args.output.resolve()
    args.manifest = args.manifest.resolve()
    source = json.loads(args.input.read_text(encoding="utf-8"))
    source_items = validate_input(source)
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    entries = manifest.get("entries", {})
    errors = []
    seen_paths = set()
    sample_rates = set()
    expected_count = 0

    for item in source_items:
        entry_id = item["id"]
        row = entries.get(entry_id)
        if not row:
            errors.append(f"{entry_id}: missing manifest entry")
            continue
        if row.get("source_text") != item["text"]:
            errors.append(f"{entry_id}: manifest source text differs from source JSON")
        try:
            jobs = build_jobs(item, source)
        except (KeyError, TypeError, ValueError) as exc:
            errors.append(f"{entry_id}: cannot resolve template variants: {exc}")
            continue
        expected_count += len(jobs)
        variants = row.get("variants", [])
        variants_by_key = {variant.get("key"): variant for variant in variants if isinstance(variant, dict)}
        if len(variants_by_key) != len(variants):
            errors.append(f"{entry_id}: duplicate or malformed manifest variant keys")
        if row.get("status") != "success":
            errors.append(f"{entry_id}: entry status is {row.get('status')!r}")
        expected_keys = {job["key"] for job in jobs}
        actual_keys = set(variants_by_key)
        for key in sorted(expected_keys - actual_keys):
            errors.append(f"{entry_id}[{key}]: missing manifest variant")
        for key in sorted(actual_keys - expected_keys):
            errors.append(f"{entry_id}[{key}]: unexpected manifest variant")

        for job in jobs:
            variant = variants_by_key.get(job["key"])
            if variant is None:
                continue
            if variant.get("text") != job["text"]:
                errors.append(f"{entry_id}[{job['key']}]: spoken text differs from source template expansion")
            if variant.get("source_text") != item["text"]:
                errors.append(f"{entry_id}[{job['key']}]: source text differs from source JSON")
            if variant.get("status") != "success":
                errors.append(f"{entry_id}[{job['key']}]: status is {variant.get('status')!r}")
                continue
            path = Path(variant.get("path", ""))
            if not path.is_absolute():
                path = ROOT / path
            path = path.resolve()
            expected_path = (args.output / job["filename"]).resolve()
            if path != expected_path:
                errors.append(f"{entry_id}[{job['key']}]: manifest path {path} does not match expected {expected_path}")
            if path in seen_paths:
                errors.append(f"{entry_id}[{job['key']}]: duplicate WAV path {path}")
            seen_paths.add(path)
            if not path.is_file() or path.stat().st_size <= 44:
                errors.append(f"{entry_id}[{job['key']}]: WAV missing or empty ({path})")
                continue
            try:
                info = sf.info(str(path))
                if info.frames <= 0 or info.channels != 1:
                    errors.append(f"{entry_id}[{job['key']}]: invalid frames/channels ({info.frames}/{info.channels})")
                if variant.get("sample_rate") != info.samplerate:
                    errors.append(f"{entry_id}[{job['key']}]: manifest sample rate does not match WAV")
                sample_rates.add(info.samplerate)
                if info.duration < 0.15:
                    errors.append(f"{entry_id}[{job['key']}]: suspiciously short ({info.duration:.2f}s)")
                if info.duration > 120:
                    errors.append(f"{entry_id}[{job['key']}]: suspiciously long ({info.duration:.2f}s)")
                word_count = max(1, len(job["text"].split()))
                if info.duration > max(8.0, word_count * 1.5):
                    errors.append(f"{entry_id}[{job['key']}]: long for {word_count} words ({info.duration:.2f}s)")
                if abs(float(variant.get("duration_seconds") or 0) - info.duration) > 0.02:
                    errors.append(f"{entry_id}[{job['key']}]: manifest duration does not match WAV")
                audio, _ = sf.read(str(path), dtype="float32", always_2d=True)
                peak = float(np.max(np.abs(audio)))
                if peak >= 0.999:
                    errors.append(f"{entry_id}[{job['key']}]: clipped samples (peak {peak:.4f})")
            except (RuntimeError, OSError) as exc:
                errors.append(f"{entry_id}[{job['key']}]: cannot read WAV: {exc}")

    extra_ids = set(entries) - {item["id"] for item in source_items}
    if extra_ids:
        errors.append(f"Unexpected manifest IDs: {', '.join(sorted(extra_ids))}")
    if len(sample_rates) > 1:
        errors.append(f"Mixed WAV sample rates: {', '.join(str(rate) for rate in sorted(sample_rates))}")
    print(f"Expected audio files: {expected_count}; manifest entries: {len(entries)}; checked WAVs: {len(seen_paths)}; errors: {len(errors)}")
    for error in errors:
        print(error, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
