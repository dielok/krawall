#!/usr/bin/env python3
"""Generic JSONL-to-WAV Qwen3-TTS service. WAV data is returned as base64 JSONL."""

from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import sys
from typing import Any

MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
model: Any = None
torch: Any = None
sf: Any = None


def load_model() -> None:
    global model, torch, sf
    import soundfile as soundfile
    import torch as torch_module
    from qwen_tts import Qwen3TTSModel

    torch = torch_module
    sf = soundfile
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID,
        device_map="cuda:0",
        dtype=torch.float16,
        attn_implementation="sdpa",
    )
    print(f"Loaded {MODEL_ID}", file=sys.stderr, flush=True)


def max_new_tokens(text: str) -> int:
    import re

    words = max(1, len(re.findall(r"\w+", text, flags=re.UNICODE)))
    return min(2048, max(32, words * 9 + 12))


def generate(request: dict[str, Any]) -> dict[str, Any]:
    request_id = request.get("request_id")
    text = request.get("text")
    language = request.get("language", "German")
    if not isinstance(request_id, str) or not request_id:
        raise ValueError("request_id must be a non-empty string")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("text must be a non-empty string")
    if not isinstance(language, str) or not language.strip():
        raise ValueError("language must be a non-empty string")

    instruction_parts = []
    for field in ("voice", "emotion", "direction"):
        value = request.get(field, "")
        if value:
            if not isinstance(value, str):
                raise ValueError(f"{field} must be a string")
            instruction_parts.append(value.strip())
    if not instruction_parts:
        raise ValueError("at least one of voice, emotion, or direction is required")
    instruction = " ".join(part for part in instruction_parts if part)

    seed = request.get("seed", 2026)
    if not isinstance(seed, int) or isinstance(seed, bool):
        raise ValueError("seed must be an integer")
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    with torch.inference_mode():
        wavs, sample_rate = model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruction,
            max_new_tokens=max_new_tokens(text),
        )

    buffer = io.BytesIO()
    audio = wavs[0]
    if getattr(audio, "ndim", 1) > 1:
        audio = audio.squeeze()
    sf.write(buffer, audio, sample_rate, format="WAV", subtype="PCM_16")
    buffer.seek(0)
    info = sf.info(buffer)
    return {
        "request_id": request_id,
        "sample_rate": int(sample_rate),
        "duration_seconds": float(info.duration),
        "wav_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
    }


def main() -> int:
    global model
    startup_error: str | None = None
    for line_number, line in enumerate(sys.stdin, start=1):
        if not line.strip():
            continue
        request: Any = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("each request must be a JSON object")
            with contextlib.redirect_stdout(sys.stderr):
                if model is None:
                    if startup_error:
                        raise RuntimeError(startup_error)
                    load_model()
                response = generate(request)
        except Exception as exc:
            if model is None and startup_error is None and isinstance(request, dict):
                startup_error = f"{type(exc).__name__}: {exc}"
            request_id = request.get("request_id") if isinstance(request, dict) else None
            response = {
                "request_id": request_id,
                "error": f"{type(exc).__name__}: {exc}",
            }
            print(f"Request on line {line_number} failed: {response['error']}", file=sys.stderr, flush=True)
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
