from __future__ import annotations

import base64
import json
import os
import re
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, List, Optional, Tuple

_QUESTION_KEYWORDS: dict[str, set[str]] = {
    "technical": {
        "api",
        "cache",
        "database",
        "sql",
        "microservice",
        "architecture",
        "arquitetura",
        "backend",
        "frontend",
        "algorithm",
        "algoritmo",
        "complexidade",
        "latency",
        "latencia",
        "performance",
        "consistency",
        "consistencia",
        "redis",
        "kafka",
    },
    "behavioral": {
        "conflict",
        "conflito",
        "leadership",
        "lideranca",
        "team",
        "stakeholder",
        "challenge",
        "desafio",
        "mistake",
        "erro",
        "learned",
        "aprendeu",
        "feedback",
        "pressure",
        "pressao",
    },
    "system_design": {
        "scalability",
        "escalabilidade",
        "high-level",
        "system",
        "sistema",
        "throughput",
        "load balancer",
        "partition",
        "particionamento",
        "replication",
        "replicacao",
        "fault tolerance",
    },
    "coding": {
        "code",
        "codigo",
        "implementar",
        "implement",
        "leetcode",
        "funcao",
        "function",
        "array",
        "string",
        "loop",
    },
}

_STRUCTURES: dict[str, List[str]] = {
    "technical": [
        "Contexto rapido do problema",
        "Abordagem tecnica escolhida",
        "Trade-offs e riscos",
        "Exemplo real e resultado",
    ],
    "behavioral": [
        "Situacao e objetivo",
        "Acao tomada por voce",
        "Resultado mensuravel",
        "Licao aprendida",
    ],
    "system_design": [
        "Escopo e requisitos nao-funcionais",
        "Arquitetura de alto nivel",
        "Escalabilidade, resiliencia e dados",
        "Monitoramento e evolucao",
    ],
    "coding": [
        "Interpretacao do problema",
        "Estrategia e complexidade",
        "Implementacao com casos limite",
        "Validacao com testes rapidos",
    ],
    "general": [
        "Resumo objetivo",
        "Ponto tecnico principal",
        "Exemplo pratico",
        "Fechamento com impacto",
    ],
}


def _safe_decode_base64(audio_base64: str) -> bytes:
    if not audio_base64:
        return b""
    try:
        return base64.b64decode(audio_base64, validate=True)
    except Exception:
        try:
            return base64.b64decode(audio_base64 + "===")
        except Exception:
            return b""


def _looks_like_text(raw: bytes) -> bool:
    if not raw:
        return False
    printable = sum(1 for b in raw if b in b"\n\r\t" or 32 <= b <= 126)
    ratio = printable / max(1, len(raw))
    return ratio >= 0.85


def _extract_transcript(raw_audio: bytes, context: Dict[str, Any] | None) -> Tuple[str, Optional[str]]:
    if isinstance(context, dict):
        for key in ("transcript", "questionTranscript", "question_text", "questionText"):
            val = context.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip(), "context"

    if raw_audio and _looks_like_text(raw_audio):
        try:
            decoded = raw_audio.decode("utf-8", errors="ignore").strip()
            if decoded:
                return decoded, "payload_text"
            return "", None
        except Exception:
            return "", None
    return "", None


def _live_coach_stt_provider(context: Dict[str, Any] | None) -> str:
    allowed = {"auto", "openai", "disabled"}
    env_value = (os.environ.get("LIVE_COACH_STT_PROVIDER") or "auto").strip().lower()
    provider = env_value if env_value in allowed else "auto"
    if isinstance(context, dict):
        override = context.get("transcriptionProvider")
        if isinstance(override, str):
            parsed = override.strip().lower()
            if parsed in allowed:
                provider = parsed
    return provider


def _openai_transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY nao configurada")

    model = (os.environ.get("OPENAI_TRANSCRIBE_MODEL") or "gpt-4o-mini-transcribe").strip()
    timeout_s = int((os.environ.get("LIVE_COACH_STT_TIMEOUT") or "45").strip())
    boundary = f"----livecoach{uuid.uuid4().hex}"

    def _part(name: str, value: str) -> bytes:
        return (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")

    file_header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="live_coach_audio.webm"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8")
    file_footer = b"\r\n"

    body = b"".join(
        [
            _part("model", model),
            file_header,
            audio_bytes,
            file_footer,
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=max(5, timeout_s)) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI transcribe error: {e.code} {body}") from e

    try:
        data = json.loads(raw)
        return (data.get("text") or "").strip()
    except Exception:
        return raw.strip()


def _maybe_transcribe_audio(
    raw_audio: bytes,
    mime_type: str,
    context: Dict[str, Any] | None,
) -> Tuple[str, Optional[str], Optional[str]]:
    provider = _live_coach_stt_provider(context)
    if provider == "disabled":
        return "", None, None
    if len(raw_audio) < 32:
        return "", None, None
    if _looks_like_text(raw_audio):
        return "", None, None

    if provider in {"auto", "openai"}:
        if not (os.environ.get("OPENAI_API_KEY") or "").strip():
            if provider == "openai":
                return "", None, "OPENAI_API_KEY nao configurada"
            return "", None, None
        try:
            text = _openai_transcribe_audio(raw_audio, mime_type=mime_type).strip()
            return text, "openai", None
        except Exception as e:
            return "", "openai", str(e)

    return "", None, None


def _pick_detected_question(transcript: str, context: Dict[str, Any] | None) -> str:
    if isinstance(context, dict):
        for key in ("question", "detectedQuestion", "latestQuestion", "questionText", "question_text"):
            val = context.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()

    if not transcript:
        return ""

    parts = re.split(r"[\n\r]+", transcript)
    for item in parts:
        clean = item.strip()
        if clean.endswith("?"):
            return clean

    sentences = re.split(r"(?<=[.!?])\s+", transcript)
    for sentence in sentences:
        clean = sentence.strip()
        if clean.endswith("?"):
            return clean
    return sentences[0].strip() if sentences else transcript.strip()


def _detect_question_type(question: str, transcript: str) -> str:
    text = f"{question} {transcript}".lower()
    matched = {k: 0 for k in _QUESTION_KEYWORDS.keys()}
    for category, words in _QUESTION_KEYWORDS.items():
        for word in words:
            if word in text:
                matched[category] += 1

    best = max(matched.items(), key=lambda kv: kv[1])
    if best[1] == 0:
        return "general"
    return best[0]


def _history_focus_point(context: Dict[str, Any] | None) -> Optional[str]:
    if not isinstance(context, dict):
        return None
    history = context.get("interviewHistory")
    if not isinstance(history, list) or not history:
        return None

    latest = None
    for item in reversed(history):
        if isinstance(item, dict):
            latest = item
            break
    if not isinstance(latest, dict):
        return None

    raw_scores = latest.get("scores") if isinstance(latest.get("scores"), dict) else {}
    if not isinstance(raw_scores, dict) or not raw_scores:
        return None

    mapped = {
        "clarity": raw_scores.get("clarity", raw_scores.get("communication")),
        "structure": raw_scores.get("structure", raw_scores.get("problemSolving")),
        "relevance": raw_scores.get("relevance", raw_scores.get("problemSolving")),
        "technicalPrecision": raw_scores.get("technicalPrecision", raw_scores.get("technical")),
        "communication": raw_scores.get("communication"),
    }

    numeric: Dict[str, float] = {}
    for key, value in mapped.items():
        try:
            numeric[key] = float(value)
        except Exception:
            continue
    if not numeric:
        return None

    weakest = min(numeric.items(), key=lambda kv: kv[1])[0]
    hints = {
        "clarity": "Deixar a explicacao mais clara e objetiva do que na resposta anterior.",
        "structure": "Estruturar em passos claros para evoluir sobre a ultima resposta.",
        "relevance": "Conectar melhor os pontos ao que a pergunta pede diretamente.",
        "technicalPrecision": "Aprofundar precisao tecnica em relacao ao ultimo feedback.",
        "communication": "Manter ritmo e confianca para melhorar comunicacao.",
    }
    return hints.get(weakest)


def _build_key_points(question_type: str, context: Dict[str, Any] | None) -> List[str]:
    points: List[str] = []
    if isinstance(context, dict):
        profile = context.get("candidateProfile") if isinstance(context.get("candidateProfile"), dict) else {}
        primary = profile.get("primarySkills") if isinstance(profile.get("primarySkills"), list) else []
        weak = profile.get("weakSkills") if isinstance(profile.get("weakSkills"), list) else []
        role = profile.get("targetRole") if isinstance(profile.get("targetRole"), str) else None
        if role:
            points.append(f"Conectar resposta ao objetivo de cargo: {role}.")
        if primary:
            points.append(f"Citar experiencia em: {', '.join(str(x) for x in primary[:3])}.")
        if weak:
            points.append(f"Mostrar evolucao pratica em: {', '.join(str(x) for x in weak[:2])}.")
        if isinstance(context.get("jobDescription"), str) and context.get("jobDescription").strip():
            points.append("Alinhar resposta com requisitos da vaga.")
        history_focus = _history_focus_point(context)
        if history_focus:
            points.append(history_focus)

    if question_type == "system_design":
        points.append("Incluir latencia, throughput e estrategia de escalabilidade.")
    elif question_type == "technical":
        points.append("Explicar trade-offs tecnicos e decisao final.")
    elif question_type == "behavioral":
        points.append("Usar exemplo real com impacto mensuravel.")
    elif question_type == "coding":
        points.append("Comentar complexidade de tempo e espaco.")
    else:
        points.append("Resposta objetiva com exemplo pratico.")

    dedup: List[str] = []
    for p in points:
        if p not in dedup:
            dedup.append(p)
    return dedup[:4]


def _build_suggestion(question: str, structure: List[str], key_points: List[str]) -> str:
    prompt = question or "pergunta recebida"
    steps = "; ".join(structure[:3])
    tips = " ".join(key_points[:2])
    return f"Para responder '{prompt}', siga: {steps}. Encerre com resultado concreto e metrica. {tips}".strip()


def process_live_audio_chunk(
    audio_base64: str,
    context: Dict[str, Any] | None = None,
    mime_type: str = "audio/webm",
) -> Dict[str, Any]:
    raw = _safe_decode_base64(audio_base64)
    transcript, transcript_source = _extract_transcript(raw, context)
    provider_used = transcript_source
    transcription_error: Optional[str] = None

    if not transcript and raw:
        auto_transcript, auto_provider, auto_error = _maybe_transcribe_audio(raw, mime_type, context)
        if auto_transcript:
            transcript = auto_transcript
            provider_used = auto_provider
        if auto_error:
            transcription_error = auto_error
            provider_used = auto_provider or provider_used

    detected_question = _pick_detected_question(transcript, context)
    question_type = _detect_question_type(detected_question, transcript) if (detected_question or transcript) else "general"
    structure = _STRUCTURES.get(question_type, _STRUCTURES["general"])
    key_points = _build_key_points(question_type, context)
    suggestion = _build_suggestion(detected_question, structure, key_points) if detected_question else None

    if transcript or detected_question:
        status = "ok"
    elif not raw:
        status = "insufficient_audio"
    elif transcription_error:
        status = "transcription_failed"
    else:
        status = "insufficient_context"

    return {
        "status": status,
        "transcript": transcript,
        "detectedQuestion": detected_question or None,
        "questionType": question_type,
        "suggestion": suggestion,
        "recommendedStructure": structure,
        "keyPoints": key_points,
        "transcriptionProvider": provider_used,
        "transcriptionError": transcription_error,
        "contextUsed": bool(context),
        "audioReceived": bool(raw),
    }
