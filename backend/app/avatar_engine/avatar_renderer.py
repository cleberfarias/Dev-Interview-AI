from __future__ import annotations

from typing import Any


_EMOTION_TO_FACE = {
    "happy": ("smile", 0.85),
    "curious": ("curious", 0.72),
    "encouraging": ("supportive", 0.7),
    "neutral": ("neutral", 0.55),
}


def build_render_payload(*, emotion: str, lipsync: dict[str, Any]) -> dict[str, Any]:
    facial_preset, intensity = _EMOTION_TO_FACE.get(emotion, _EMOTION_TO_FACE["neutral"])
    frame_count = len(lipsync.get("frames") or [])
    return {
        "state": "speaking" if frame_count > 0 else "idle",
        "facialPreset": facial_preset,
        "intensity": round(float(intensity), 2),
        "meta": {
            "frameCount": frame_count,
            "durationMs": int(lipsync.get("durationMs") or 0),
        },
    }
