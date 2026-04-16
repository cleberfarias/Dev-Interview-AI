from base64 import b64encode

from app.api.routes_did import _normalize_client_key


def test_normalize_client_key_accepts_raw_key():
    assert _normalize_client_key("ck_p2xot0yqDhfeJ1R5b7ble") == "ck_p2xot0yqDhfeJ1R5b7ble"


def test_normalize_client_key_decodes_base64_encoded_key():
    raw = "ck_p2xot0yqDhfeJ1R5b7ble"
    encoded = b64encode(raw.encode("utf-8")).decode("ascii")

    assert _normalize_client_key(encoded) == raw


def test_normalize_client_key_extracts_key_param_from_embed_url():
    assert (
        _normalize_client_key("https://studio.d-id.com/agents/share?id=x&key=ck_p2xot0yqDhfeJ1R5b7ble")
        == "ck_p2xot0yqDhfeJ1R5b7ble"
    )


def test_normalize_client_key_keeps_unrecognized_value():
    assert _normalize_client_key("unexpected") == "unexpected"
