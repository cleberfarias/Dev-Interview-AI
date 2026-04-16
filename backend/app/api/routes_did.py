"""
D-ID Agents — endpoint de credencial para o frontend.

O clientKey é uma chave específica para uso no browser (diferente da API Key).
Nunca expô-la hardcoded no JS do frontend; sempre obter via backend autenticado.

Variáveis de ambiente necessárias:
  DID_CLIENT_KEY  — data-client-key obtido no Embed do Agent
  DID_AGENT_ID    — ID do agent criado no dashboard (ex: agt_xxxxxxxx)

Segurança:
  O endpoint exige Firebase ID token válido (mesmo padrão de todos os outros
  endpoints protegidos). Sem autenticação → 401 antes de chegar neste handler.
"""
import logging
import os
from base64 import b64decode, b64encode
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..firebase_admin import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/did", tags=["d-id"])


class DIDCredentialsResponse(BaseModel):
    client_key: str
    agent_id: str


def _env_first(*names: str) -> str | None:
    for name in names:
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return None


def _did_api_auth_header(api_key: str) -> str:
    clean = api_key.strip()
    if clean.lower().startswith("basic "):
        return clean
    if ":" in clean:
        clean = b64encode(clean.encode("utf-8")).decode("ascii")
    return f"Basic {clean}"


def _normalize_client_key(client_key: str | None) -> str | None:
    clean = (client_key or "").strip()
    if not clean:
        return None

    # O SDK espera o data-client-key exatamente como veio do Studio/API.
    # Se o usuario colar a URL de share/embed inteira, extraimos apenas o parametro key.
    if "://" in clean:
        key = parse_qs(urlparse(clean).query).get("key", [""])[0].strip()
        return _normalize_client_key(key) or clean
    if clean.startswith("key="):
        return _normalize_client_key(clean.removeprefix("key=").strip())
    if clean.startswith("ck_"):
        return clean

    try:
        padded = clean + ("=" * (-len(clean) % 4))
        decoded = b64decode(padded, validate=True).decode("utf-8").strip()
    except (ValueError, UnicodeDecodeError):
        decoded = ""

    if decoded.startswith("ck_"):
        return decoded

    return clean


def _did_response_description(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text
    if isinstance(data, dict):
        return str(data.get("description") or data.get("message") or data.get("detail") or "")
    return ""


def _did_allowed_domains() -> list[str]:
    raw = _env_first("DID_ALLOWED_DOMAINS", "DID_CLIENT_ALLOWED_DOMAINS")
    if not raw:
        return ["http://localhost:5000", "http://127.0.0.1:5000", "http://localhost"]
    domains = [item.strip() for item in raw.split(",") if item.strip()]
    return domains or ["http://localhost:5000"]


def _did_api_base_url() -> str:
    return (os.getenv("DID_API_BASE_URL") or "https://api.d-id.com").rstrip("/")


async def _did_request(method: str, path: str, api_key: str, **kwargs: Any) -> httpx.Response:
    headers = dict(kwargs.pop("headers", {}) or {})
    headers["Authorization"] = _did_api_auth_header(api_key)
    headers.setdefault("Content-Type", "application/json")
    async with httpx.AsyncClient(timeout=12) as client:
        return await client.request(method, f"{_did_api_base_url()}{path}", headers=headers, **kwargs)


async def _create_client_key_from_api(api_key: str) -> str:
    response = await _did_request(
        "POST",
        "/agents/client-key",
        api_key,
        json={"allowed_domains": _did_allowed_domains()},
    )
    if response.status_code in {401, 403}:
        raise HTTPException(status_code=503, detail="D-ID API key rejeitada pelo Studio.")
    if not response.is_success:
        description = _did_response_description(response)
        if "client key already exists" in description.lower():
            raise HTTPException(
                status_code=503,
                detail=(
                    "D-ID client key ja existe para este usuario. "
                    "Informe DID_CLIENT_KEY com o data-client-key do Embed no Studio "
                    "ou revogue/regere o client key na D-ID."
                ),
            )
        logger.error("D-ID client-key creation failed status=%s body=%s", response.status_code, response.text[:300])
        raise HTTPException(status_code=503, detail="Nao foi possivel gerar D-ID client key.")

    data = response.json()
    client_key = (data.get("client_key") or data.get("clientKey") or "").strip()
    if not client_key:
        logger.error("D-ID client-key response missing key: %s", data)
        raise HTTPException(status_code=503, detail="D-ID nao retornou client key.")
    return client_key


async def _resolve_agent_id(api_key: str | None) -> str | None:
    configured = _env_first("DID_AGENT_ID", "D_ID_AGENT_ID")
    if configured:
        return configured
    if not api_key:
        return None

    response = await _did_request("GET", "/agents", api_key)
    if not response.is_success:
        logger.warning("D-ID agents discovery failed status=%s", response.status_code)
        return None

    data = response.json()
    agents = data.get("agents") if isinstance(data, dict) else data
    if not isinstance(agents, list) or len(agents) != 1:
        if isinstance(agents, list):
            logger.warning("D-ID agents discovery found %s agent(s); DID_AGENT_ID must be set", len(agents))
        return None

    agent = agents[0] if isinstance(agents[0], dict) else {}
    return (agent.get("id") or agent.get("agent_id") or "").strip() or None


@router.get("/credentials", response_model=DIDCredentialsResponse)
async def get_did_credentials(user=Depends(get_current_user)):
    """
    Retorna as credenciais D-ID para o frontend inicializar o Agents SDK.
    Requer DID_CLIENT_KEY e DID_AGENT_ID no ambiente e Firebase ID token válido.

    O frontend usa:
      sdk.createAgentManager(agent_id, { auth: { type: 'key', clientKey } })

    Raises:
        HTTPException 401: se o token Firebase for inválido (via Depends)
        HTTPException 503: se as variáveis de ambiente não estiverem configuradas
    """
    api_key = _env_first("DID_API_KEY", "D_ID_API_KEY", "D_DI_API_KEY", "D-DI_API_KEY")
    client_key = _normalize_client_key(_env_first("DID_CLIENT_KEY", "D_ID_CLIENT_KEY"))
    agent_id = await _resolve_agent_id(api_key)

    if not client_key and api_key:
        client_key = await _create_client_key_from_api(api_key)

    missing = [
        name
        for name, val in [
            ("DID_CLIENT_KEY or DID_API_KEY", client_key),
            ("DID_AGENT_ID", agent_id),
        ]
        if not val
    ]
    if missing:
        logger.error("D-ID integration missing env vars: %s", ", ".join(missing))
        raise HTTPException(
            status_code=503,
            detail=f"D-ID integration not configured. Missing: {', '.join(missing)}",
        )

    # Log apenas o uid do usuário — nunca logar o client_key
    logger.info("D-ID credentials served (uid=%s, agent_id=%s)", getattr(user, "uid", "?"), agent_id)
    return DIDCredentialsResponse(client_key=client_key, agent_id=agent_id)
