from __future__ import annotations

import base64
import math
import re
from typing import Any


_VOWEL_TO_VISEME = {
    "a": "A",
    "e": "E",
    "i": "I",
    "o": "O",
    "u": "U",
}

_CONSONANT_GROUPS = {
    "MBP": {"m", "b", "p"},
    "FV": {"f", "v"},
    "L": {"l"},
    "R": {"r"},
    "S": {"s", "z", "x", "c"},
    "T": {"t", "d", "n"},
    "K": {"k", "q", "g"},
}


def _safe_decode_audio_size(audio_base64: str) -> int:
    if not audio_base64:
        return 0
    try:
        return len(base64.b64decode(audio_base64 + "==="))
    except Exception:
        return 0


def _estimate_duration_ms(audio_base64: str, text: str) -> int:
    audio_size = _safe_decode_audio_size(audio_base64)
    if audio_size > 0:
        # Approximation for compressed speech audio payload.
        approx_from_audio = int(max(800, min(25000, (audio_size / 48.0) * 1000)))
    else:
        approx_from_audio = 0

    text_len = max(1, len(text))
    approx_from_text = int(max(900, min(26000, text_len * 70)))
    if approx_from_audio <= 0:
        return approx_from_text
    return int((approx_from_audio * 0.6) + (approx_from_text * 0.4))


def _char_to_viseme(ch: str) -> str:
    if ch in _VOWEL_TO_VISEME:
        return _VOWEL_TO_VISEME[ch]
    for viseme, chars in _CONSONANT_GROUPS.items():
        if ch in chars:
            return viseme
    return "REST"


def generate(audio_base64: str, text: str | None = None) -> dict[str, Any]:
    transcript = str(text or "").strip().lower()
    if not transcript:
        return {"frames": [], "durationMs": 0}

    chars = re.findall(r"[a-zA-Z]", transcript)
    if not chars:
        return {"frames": [], "durationMs": 0}

    duration_ms = _estimate_duration_ms(audio_base64, transcript)
    step = max(1, int(math.ceil(len(chars) / 36)))
    selected = chars[::step][:36]
    frame_count = max(1, len(selected))
    interval = max(0.04, (duration_ms / 1000.0) / frame_count)

    frames = []
    current_time = 0.0
    for ch in selected:
        frames.append({"time": round(current_time, 3), "viseme": _char_to_viseme(ch)})
        current_time += interval

    return {"frames": frames, "durationMs": int(duration_ms)}
