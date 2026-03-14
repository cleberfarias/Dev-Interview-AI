from __future__ import annotations


_EMOTION_KEYWORDS: dict[str, tuple[str, ...]] = {
    "happy": (
        "great",
        "excellent",
        "parabens",
        "otimo",
        "bom trabalho",
        "awesome",
    ),
    "curious": (
        "interesting",
        "curioso",
        "fale mais",
        "aprofunde",
        "detalhe",
    ),
    "encouraging": (
        "continue",
        "vamos",
        "boa",
        "proxima",
        "next",
        "keep going",
    ),
}


def detect_emotion(text: str | None) -> str:
    content = str(text or "").strip().lower()
    if not content:
        return "neutral"

    for emotion, keywords in _EMOTION_KEYWORDS.items():
        if any(keyword in content for keyword in keywords):
            return emotion
    return "neutral"
