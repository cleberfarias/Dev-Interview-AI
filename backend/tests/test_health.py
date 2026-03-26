from fastapi.testclient import TestClient

from app.main import app
from app.services import profile_service


def test_health_ok():
    client = TestClient(app)
    resp = client.get('/health')
    assert resp.status_code == 200
    data = resp.json()
    assert data['ok'] is True
    assert 'time' in data and isinstance(data['time'], str)


def test_health_can_check_firestore(monkeypatch):
    class _FakeQuery:
        def limit(self, _value):
            return self

        def get(self):
            return []

    class _FakeDb:
        def collection(self, name):
            assert name == "_healthcheck"
            return _FakeQuery()

    monkeypatch.setattr(profile_service, "get_firestore_client", lambda: _FakeDb())

    client = TestClient(app)
    resp = client.get('/health?checkDb=true')
    assert resp.status_code == 200
    data = resp.json()
    assert data['ok'] is True
    assert data['firestore'] == {'checked': True, 'ok': True}


def test_health_reports_firestore_failure(monkeypatch):
    monkeypatch.setattr(
        profile_service,
        "get_firestore_client",
        lambda: (_ for _ in ()).throw(RuntimeError("firestore offline")),
    )

    client = TestClient(app)
    resp = client.get('/health?checkDb=true')
    assert resp.status_code == 200
    data = resp.json()
    assert data['ok'] is False
    assert data['firestore'] == {'checked': True, 'ok': False, 'error': 'firestore_unavailable'}
