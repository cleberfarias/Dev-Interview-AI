import json
import os
from typing import Optional, Dict, Any

import firebase_admin
from firebase_admin import auth, credentials, firestore
from fastapi import Depends, Header, HTTPException

_app = None
_db = None

def init_firebase():
    global _app, _db
    if _app and _db:
        return _app, _db

    # Option A: point to a service account json file
    sa_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if sa_path and not os.path.isabs(sa_path):
        sa_path = os.path.abspath(os.path.join(base_dir, sa_path))

    # Option B: service account JSON string in env
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")

    cred = None
    if sa_json:
        try:
            info = json.loads(sa_json)
            cred = credentials.Certificate(info)
        except Exception as e:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON inválido") from e
    elif sa_path and os.path.exists(sa_path):
        cred = credentials.Certificate(sa_path)
    else:
        # Fallback: look for a service-account.json file in the backend folder
        default_path = os.path.join(base_dir, "service-account.json")
        if os.path.exists(default_path):
            cred = credentials.Certificate(default_path)
        else:
            raise RuntimeError(
                "Credenciais do Firebase Admin não configuradas. "
                "Defina FIREBASE_SERVICE_ACCOUNT_PATH (ou GOOGLE_APPLICATION_CREDENTIALS) "
                "ou FIREBASE_SERVICE_ACCOUNT_JSON."
            )

    _app = firebase_admin.initialize_app(cred)
    _db = firestore.client()
    return _app, _db

def get_firestore_client():
    global _db
    if _db is None:
        init_firebase()
    return _db

def verify_bearer_token(authorization: Optional[str]) -> Dict[str, Any]:
    # Ensure Firebase Admin app is initialized before verifying tokens
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
    except Exception as e:
        # Log exception for debugging in dev
        print(f"verify_bearer_token error: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")

def get_current_user(authorization: Optional[str] = Header(default=None)):
    decoded = verify_bearer_token(authorization)
    # best-effort extra fields (frontend can send as claims or we can enrich from Firebase)
    uid = decoded.get("uid") or decoded.get("user_id") or decoded.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing uid")
    email = decoded.get("email", "")
    name = decoded.get("name") or decoded.get("firebase", {}).get("sign_in_provider")
    picture = decoded.get("picture")
    # Provide common web sdk field names too
    return {
        "uid": uid,
        "email": email,
        "name": decoded.get("name"),
        "picture": picture,
        "displayName": decoded.get("name"),
        "photoURL": picture,
    }
