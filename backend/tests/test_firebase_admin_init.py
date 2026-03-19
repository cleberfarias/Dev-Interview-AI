from types import SimpleNamespace

from app import firebase_admin as firebase_module


def test_init_firebase_falls_back_to_application_default(monkeypatch):
    monkeypatch.setattr(firebase_module, "_app", None)
    monkeypatch.setattr(firebase_module, "_db", None)
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_PATH", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "dev-interview-ai")
    monkeypatch.delenv("FIREBASE_STORAGE_BUCKET", raising=False)
    monkeypatch.delenv("VITE_FIREBASE_STORAGE_BUCKET", raising=False)

    monkeypatch.setattr(firebase_module.os.path, "exists", lambda _path: False)

    cred_calls = []
    init_calls = []

    fake_cred = SimpleNamespace(name="adc")
    fake_app = object()
    fake_db = object()

    monkeypatch.setattr(
        firebase_module.credentials,
        "ApplicationDefault",
        lambda: cred_calls.append("adc") or fake_cred,
    )
    monkeypatch.setattr(
        firebase_module.firebase_admin,
        "initialize_app",
        lambda cred, options=None: init_calls.append((cred, options)) or fake_app,
    )
    monkeypatch.setattr(firebase_module.firestore, "client", lambda: fake_db)

    app, db = firebase_module.init_firebase()

    assert app is fake_app
    assert db is fake_db
    assert cred_calls == ["adc"]
    assert init_calls == [
        (
            fake_cred,
            {
                "projectId": "dev-interview-ai",
            },
        )
    ]
