import os

import httpx
import pytest

BASE_URL = os.environ.get('SMOKE_API_BASE_URL')
if not BASE_URL:
    pytest.skip('SMOKE_API_BASE_URL not set', allow_module_level=True)

AUTH_TOKEN = os.environ.get('SMOKE_AUTH_TOKEN', '').strip()
HEADERS = {'Authorization': f'Bearer {AUTH_TOKEN}'} if AUTH_TOKEN else {}


def test_health_smoke():
    resp = httpx.get(f"{BASE_URL}/health", timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get('ok') is True


def test_me_smoke_optional():
    if not AUTH_TOKEN:
        pytest.skip('SMOKE_AUTH_TOKEN not set')
    resp = httpx.get(f"{BASE_URL}/me", headers=HEADERS, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get('uid')
