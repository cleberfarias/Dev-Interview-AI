import json
import logging
import os
import threading
from typing import Any, Dict, Optional

import firebase_admin
from fastapi import Header, HTTPException, Request
from firebase_admin import auth, credentials, firestore, storage

from .request_context import set_context

_app = None
_db = None
_init_lock = threading.Lock()
logger = logging.getLogger("uvicorn.error")


def _resolve_storage_bucket_name() -> Optional[str]:
    value = (
        os.environ.get("FIREBASE_STORAGE_BUCKET")
        or os.environ.get("VITE_FIREBASE_STORAGE_BUCKET")
        or ""
    ).strip()
    return value or None


def _resolve_project_id() -> Optional[str]:
    value = (
        os.environ.get("FIREBASE_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
        or ""
    ).strip()
    return value or None


def init_firebase():
    global _app, _db
    if _app and _db:
        return _app, _db

    with _init_lock:
        if _app and _db:
            return _app, _db

        sa_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if sa_path and not os.path.isabs(sa_path):
            sa_path = os.path.abspath(os.path.join(base_dir, sa_path))

        sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")

        cred = None
        credential_source = None
        if sa_json:
            try:
                info = json.loads(sa_json)
                cred = credentials.Certificate(info)
                credential_source = "env_json"
            except Exception as exc:
                raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON invalido") from exc
        elif sa_path and os.path.exists(sa_path):
            cred = credentials.Certificate(sa_path)
            credential_source = "env_path"
        else:
            default_path = os.path.join(base_dir, "service-account.json")
            if os.path.exists(default_path):
                cred = credentials.Certificate(default_path)
                credential_source = "local_file"
            else:
                try:
                    # Cloud Run and other GCP runtimes expose ADC for the attached service account.
                    cred = credentials.ApplicationDefault()
                    credential_source = "application_default"
                except Exception as exc:
                    raise RuntimeError(
                        "Credenciais do Firebase Admin nao configuradas. "
                        "Defina FIREBASE_SERVICE_ACCOUNT_PATH (ou GOOGLE_APPLICATION_CREDENTIALS) "
                        "ou FIREBASE_SERVICE_ACCOUNT_JSON, ou execute em um runtime com ADC habilitado."
                    ) from exc

        options = {}
        project_id = _resolve_project_id()
        if project_id:
            options["projectId"] = project_id
        storage_bucket = _resolve_storage_bucket_name()
        if storage_bucket:
            options["storageBucket"] = storage_bucket

        try:
            _app = firebase_admin.initialize_app(cred, options or None)
        except ValueError as exc:
            # Concurrent cold-start requests can race while the default app is still being created.
            if "already exists" not in str(exc):
                raise
            _app = firebase_admin.get_app()
            credential_source = "existing_default_app"

        _db = firestore.client()
        logger.info(
            "Firebase Admin initialized",
            extra={
                "firebase_credential_source": credential_source,
                "firebase_project_id": project_id,
                "firebase_storage_bucket": storage_bucket,
            },
        )
        return _app, _db


def get_firestore_client():
    global _db
    if _db is None:
        init_firebase()
    return _db


def get_storage_bucket():
    init_firebase()
    if not _resolve_storage_bucket_name():
        return None
    return storage.bucket()


def verify_bearer_token(authorization: Optional[str]) -> Dict[str, Any]:
    init_firebase()
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(request: Request, authorization: Optional[str] = Header(default=None)):
    decoded = verify_bearer_token(authorization)
    uid = decoded.get("uid") or decoded.get("user_id") or decoded.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing uid")
    email = decoded.get("email", "")
    picture = decoded.get("picture")
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip() or None

    request.state.user_id = uid
    set_context(user_id=uid)

    return {
        "uid": uid,
        "email": email,
        "name": decoded.get("name"),
        "picture": picture,
        "displayName": decoded.get("name"),
        "photoURL": picture,
        "token": token,
    }
