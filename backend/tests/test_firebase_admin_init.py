import threading
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


def test_init_firebase_reuses_existing_default_app_when_already_initialized(monkeypatch):
    monkeypatch.setattr(firebase_module, "_app", None)
    monkeypatch.setattr(firebase_module, "_db", None)
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_PATH", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "dev-interview-ai")
    monkeypatch.delenv("FIREBASE_STORAGE_BUCKET", raising=False)
    monkeypatch.delenv("VITE_FIREBASE_STORAGE_BUCKET", raising=False)

    monkeypatch.setattr(firebase_module.os.path, "exists", lambda _path: False)

    fake_cred = SimpleNamespace(name="adc")
    fake_app = object()
    fake_db = object()

    monkeypatch.setattr(firebase_module.credentials, "ApplicationDefault", lambda: fake_cred)

    def _raise_duplicate(_cred, options=None):
        raise ValueError("The default Firebase app already exists.")

    monkeypatch.setattr(firebase_module.firebase_admin, "initialize_app", _raise_duplicate)
    monkeypatch.setattr(firebase_module.firebase_admin, "get_app", lambda: fake_app)
    monkeypatch.setattr(firebase_module.firestore, "client", lambda: fake_db)

    app, db = firebase_module.init_firebase()

    assert app is fake_app
    assert db is fake_db


def test_init_firebase_is_thread_safe(monkeypatch):
    monkeypatch.setattr(firebase_module, "_app", None)
    monkeypatch.setattr(firebase_module, "_db", None)
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_PATH", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "dev-interview-ai")
    monkeypatch.delenv("FIREBASE_STORAGE_BUCKET", raising=False)
    monkeypatch.delenv("VITE_FIREBASE_STORAGE_BUCKET", raising=False)

    monkeypatch.setattr(firebase_module.os.path, "exists", lambda _path: False)

    fake_cred = SimpleNamespace(name="adc")
    fake_app = object()
    fake_db = object()
    started = threading.Event()
    release = threading.Event()
    init_calls = []
    results = []

    monkeypatch.setattr(firebase_module.credentials, "ApplicationDefault", lambda: fake_cred)

    def _initialize(_cred, options=None):
        init_calls.append((options or {}).get("projectId"))
        started.set()
        release.wait(timeout=2)
        return fake_app

    monkeypatch.setattr(firebase_module.firebase_admin, "initialize_app", _initialize)
    monkeypatch.setattr(firebase_module.firestore, "client", lambda: fake_db)

    def _worker():
        results.append(firebase_module.init_firebase())

    thread_one = threading.Thread(target=_worker)
    thread_two = threading.Thread(target=_worker)
    thread_one.start()
    started.wait(timeout=2)
    thread_two.start()
    release.set()
    thread_one.join(timeout=2)
    thread_two.join(timeout=2)

    assert init_calls == ["dev-interview-ai"]
    assert results == [(fake_app, fake_db), (fake_app, fake_db)]
