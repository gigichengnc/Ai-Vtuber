"""Free, offline British voices for 朝暮 using Kokoro (runs on the CPU).

Reads one line of text on stdin and writes a WAV file to stdout, so it plugs
into TTS_PROVIDER=command:

    pip install kokoro-onnx
    # put kokoro-v1.0.int8.onnx and voices-v1.0.bin in models/kokoro/
    TTS_PROVIDER=command
    TTS_COMMAND=python scripts/kokoro-tts.py

Settings (all optional, from .env or the environment):
    KOKORO_VOICE           her voice, default bf_emma (also bf_isabella, bf_lily, bf_alice)
    KOKORO_NARRATOR_VOICE  narrator voice, default bm_george (also bm_fable, bm_lewis, bm_daniel)
    KOKORO_SPEED           1.0 is normal
    KOKORO_DIR             folder with the model files, default models/kokoro
"""

import io
import os
import sys
import wave
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = Path(os.environ.get("KOKORO_DIR") or ROOT / "models" / "kokoro")

# Kokoro can't act, but pace helps: slower when sleepy or sad, a bit quicker when excited.
PACE = {"sleepy": 0.88, "sad": 0.92, "shy": 0.96, "happy": 1.04, "laugh": 1.05, "surprised": 1.06, "angry": 1.05}


def main() -> None:
    text = sys.stdin.read().strip()
    if not text:
        sys.exit("kokoro-tts: no text on stdin")

    model = MODEL_DIR / "kokoro-v1.0.int8.onnx"
    if not model.exists():
        model = MODEL_DIR / "kokoro-v1.0.onnx"
    voices = MODEL_DIR / "voices-v1.0.bin"
    if not model.exists() or not voices.exists():
        sys.exit(
            f"kokoro-tts: put kokoro-v1.0.int8.onnx and voices-v1.0.bin in {MODEL_DIR}\n"
            "(download them from https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)"
        )

    narrator = os.environ.get("TTS_SPEAKER") == "narrator"
    voice = os.environ.get("KOKORO_NARRATOR_VOICE", "bm_george") if narrator else os.environ.get("KOKORO_VOICE", "bf_emma")
    speed = float(os.environ.get("KOKORO_SPEED", "1.0"))
    if not narrator:
        speed *= PACE.get(os.environ.get("TTS_EMOTION", ""), 1.0)

    kokoro = Kokoro(str(model), str(voices))
    samples, rate = kokoro.create(text, voice=voice, speed=speed, lang="en-gb")

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    sys.stdout.buffer.write(out.getvalue())


if __name__ == "__main__":
    main()
