from app import main as main_module
from app.live_coach import pipeline as live_coach_pipeline
from app.services import interview_core


def test_safe_json_loads_strips_code_fence():
    payload = '{"ok": true}'
    wrapped = f"```json\n{payload}\n```"
    data = main_module._safe_json_loads(wrapped)
    assert data == {"ok": True}


def test_safe_json_loads_extracts_embedded_object():
    text = "prefix {\"value\": 123} suffix"
    data = main_module._safe_json_loads(text)
    assert data == {"value": 123}


def test_normalize_eval_payload_accepts_alt_keys():
    raw = {
        "communication": 6,
        "technical": 7,
        "problem_solving": 5,
        "presence": 8,
        "strengths": "clareza;objetividade",
        "improvements": None,
        "transcricao": "Resposta em PT"
    }
    normalized = main_module._normalize_eval_payload(raw, transcript_fallback="fallback")
    assert normalized["scores"]["communication"] == 6
    assert normalized["scores"]["technical"] == 7
    assert normalized["scores"]["problemSolving"] == 5
    assert normalized["scores"]["presence"] == 8
    assert normalized["strengths"] == ["clareza", "objetividade"]
    assert normalized["improvements"] == []
    assert normalized["transcript"] == "Resposta em PT"


def test_normalize_eval_payload_uses_fallback_transcript():
    raw = {
        "scores": {"communication": 1, "technical": 2, "problemSolving": 3, "presence": 4}
    }
    normalized = main_module._normalize_eval_payload(raw, transcript_fallback="fallback transcript")
    assert normalized["transcript"] == "fallback transcript"


def test_audio_filename_for_mime_type_supports_mp4_variants():
    mime_type = "audio/mp4;codecs=mp4a.40.2"
    assert interview_core._audio_filename_for_mime_type(mime_type) == "audio.m4a"
    assert live_coach_pipeline._audio_filename_for_mime_type(mime_type) == "live_coach_audio.m4a"
