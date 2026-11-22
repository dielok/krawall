#!/usr/bin/env python3
"""Speak one free-form German text with the Quiz-Krawall VoiceDesign setup."""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from generate import (
    DEFAULT_INPUT,
    EMOTION_CUES,
    MODEL_ID,
    max_new_tokens_for_text,
    stable_seed,
    voice_instruction,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--text", required=True, help="Text to speak in German")
    parser.add_argument("--output", type=Path, required=True, help="Destination WAV path")
    parser.add_argument("--emotion", choices=sorted(EMOTION_CUES), default="excited")
    parser.add_argument("--direction", help="Optional delivery direction; this is not spoken")
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    if not args.text.strip():
        parser.error("--text must not be empty")

    try:
        import soundfile as sf
        import torch
        from qwen_tts import Qwen3TTSModel
    except ImportError as exc:
        print(f"Missing runtime dependency: {exc}. See README.md.", file=sys.stderr)
        return 2

    profile = json.loads(DEFAULT_INPUT.read_text(encoding="utf-8")).get("tts_profile", {})
    instruction = voice_instruction(
        {"emotion": args.emotion, "direction": args.direction},
        profile,
    )
    output = args.output.expanduser()
    if output.exists() or output.is_symlink():
        print(f"Refusing to overwrite existing file: {output}", file=sys.stderr)
        return 2
    output.parent.mkdir(parents=True, exist_ok=True)

    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID,
        device_map="cuda:0",
        dtype=torch.float16,
        attn_implementation="sdpa",
    )
    seed = stable_seed(args.seed, "manual-text", args.text)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    with torch.inference_mode():
        wavs, sample_rate = model.generate_voice_design(
            text=args.text,
            language="German",
            instruct=instruction,
            max_new_tokens=max_new_tokens_for_text(args.text),
        )
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=output.parent,
            prefix=f".{output.name}.",
            suffix=".tmp.wav",
            delete=False,
        ) as temporary:
            temporary_path = temporary.name
        sf.write(temporary_path, wavs[0], sample_rate, subtype="PCM_16")
        try:
            os.link(temporary_path, output)
        except FileExistsError:
            print(f"Refusing to overwrite existing file: {output}", file=sys.stderr)
            return 2
    finally:
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
    info = sf.info(str(output))
    print(f"Created {output} ({info.duration:.2f}s, mono, {sample_rate} Hz)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
