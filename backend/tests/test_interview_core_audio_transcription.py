from app.services import interview_core


class _FakeOpenAIResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return b'{"text":"transcribed from audio"}'


def test_openai_transcribe_audio_builds_multipart_request_for_mp4(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key-1234567890")

    def fake_urlopen(req, timeout=0):
        assert timeout == 60
        assert req.full_url == "https://api.openai.com/v1/audio/transcriptions"
        assert req.get_header("Authorization") == "Bearer test-openai-key-1234567890"

        content_type = req.get_header("Content-type")
        assert content_type is not None
        assert content_type.startswith("multipart/form-data; boundary=----codexboundary")

        body = req.data
        assert body is not None
        assert b'filename="audio.m4a"' in body
        assert b"Content-Type: audio/mp4;codecs=mp4a.40.2" in body
        assert b'name="model"' in body
        return _FakeOpenAIResponse()

    monkeypatch.setattr(interview_core.urllib.request, "urlopen", fake_urlopen)

    transcript = interview_core._openai_transcribe_audio(
        b"fake-audio-bytes",
        "audio/mp4;codecs=mp4a.40.2",
    )

    assert transcript == "transcribed from audio"
