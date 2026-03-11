from fastapi.testclient import TestClient

from app.main import app
from app import kiwify_webhook as kiwify_module
from google.api_core.exceptions import AlreadyExists


def test_kiwify_test_route_disabled_by_default(monkeypatch):
    monkeypatch.delenv("ALLOW_KIWIFY_TEST_WEBHOOK", raising=False)
    monkeypatch.delenv("KIWIFY_WEBHOOK_TOKEN", raising=False)

    client = TestClient(app)
    resp = client.post("/webhooks/kiwify/test", json={})
    assert resp.status_code == 404


def test_kiwify_requires_auth_config_when_missing_token(monkeypatch):
    monkeypatch.delenv("KIWIFY_WEBHOOK_TOKEN", raising=False)
    monkeypatch.setenv("ALLOW_UNSECURED_KIWIFY_WEBHOOK", "false")

    client = TestClient(app)
    resp = client.post("/webhooks/kiwify", json={})
    assert resp.status_code == 503


def test_kiwify_rejects_invalid_token_and_accepts_valid_token(monkeypatch):
    monkeypatch.setenv("KIWIFY_WEBHOOK_TOKEN", "secret")

    async def _fake_handler(payload):
        return {"ok": True, "payload": payload}

    monkeypatch.setattr(kiwify_module, "_handle_kiwify_payload", _fake_handler)

    client = TestClient(app)
    bad = client.post("/webhooks/kiwify", json={"event": "approved"}, headers={"x-kiwify-token": "wrong"})
    assert bad.status_code == 401

    good = client.post("/webhooks/kiwify", json={"event": "approved"}, headers={"x-kiwify-token": "secret"})
    assert good.status_code == 200
    assert good.json()["ok"] is True


def test_reserve_event_is_idempotent():
    class FakeLedgerRef:
        def __init__(self):
            self.count = 0

        def create(self, data):
            if self.count > 0:
                raise AlreadyExists("duplicate")
            self.count += 1

    ref = FakeLedgerRef()
    first = kiwify_module._reserve_event(ref, {}, "test@example.com", "pack", 3)
    second = kiwify_module._reserve_event(ref, {}, "test@example.com", "pack", 3)
    assert first is True
    assert second is False
