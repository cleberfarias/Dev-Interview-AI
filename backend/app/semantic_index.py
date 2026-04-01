from __future__ import annotations

import hashlib
import logging
import math
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import litellm

from .repositories import knowledge_index_repository
from .services import ai_observability_service

logger = logging.getLogger("uvicorn.error")

_STOPWORDS = {
    "a",
    "ao",
    "com",
    "como",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "ou",
    "para",
    "por",
    "que",
    "se",
    "sem",
    "um",
    "uma",
}

_PROVIDER_API_KEY_ENV = {
    "openai": "OPENAI_API_KEY",
}


@dataclass(frozen=True)
class EmbeddingStrategy:
    name: str
    backend: str
    provider: str | None = None
    model: str | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persistence_enabled() -> bool:
    raw = str(os.environ.get("KNOWLEDGE_INDEX_PERSISTENCE", "true")).strip().lower()
    if raw in {"0", "false", "no", "off"}:
        return False
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    return True


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _normalize_tag(value: Any) -> str:
    return str(value or "").strip().lower()[:72]


def _normalize_list(value: Any, limit: int = 24) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        normalized = _normalize_tag(item)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
        if len(out) >= limit:
            break
    return out


def _tokenize(value: Any, limit: int = 64) -> list[str]:
    text = _normalize_text(value).lower()
    if not text:
        return []
    raw = "".join(ch if ch.isalnum() or ch in {" ", "-", "_"} else " " for ch in text)
    out: list[str] = []
    seen: set[str] = set()
    for token in raw.replace("_", " ").replace("-", " ").split():
        token = token.strip()
        if len(token) <= 2 or token in _STOPWORDS or token in seen:
            continue
        seen.add(token)
        out.append(token)
        if len(out) >= limit:
            break
    return out


def _vector_dimensions() -> int:
    try:
        return max(48, int(os.environ.get("KNOWLEDGE_VECTOR_DIMENSIONS", "96")))
    except Exception:
        return 96


def _hash_terms(text: str, tags: list[str]) -> list[tuple[str, float]]:
    tag_terms = set(_normalize_list(tags, limit=24))
    weighted_terms: list[tuple[str, float]] = []
    for token in _tokenize(text, limit=96):
        base_weight = 1.35 if token in tag_terms else 1.0
        weighted_terms.append((token, base_weight))
        if len(token) >= 5:
            for index in range(0, len(token) - 2):
                weighted_terms.append((token[index : index + 3], 0.22))
    for tag in tag_terms:
        weighted_terms.append((tag, 1.8))
    return weighted_terms


def _normalize_vector(vector: list[float]) -> list[float]:
    magnitude = math.sqrt(sum(value * value for value in vector))
    if magnitude <= 0:
        return vector
    return [round(value / magnitude, 6) for value in vector]


def _local_hash_embedding(text: str, tags: list[str]) -> list[float]:
    dimensions = _vector_dimensions()
    vector = [0.0] * dimensions
    for term, weight in _hash_terms(text, tags):
        digest = hashlib.sha256(term.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:2], "big") % dimensions
        sign = 1.0 if digest[2] % 2 == 0 else -1.0
        vector[bucket] += sign * float(weight)
    return _normalize_vector(vector)


def _cosine_similarity(vector_a: list[float], vector_b: list[float]) -> float:
    if not vector_a or not vector_b or len(vector_a) != len(vector_b):
        return 0.0
    return sum(a * b for a, b in zip(vector_a, vector_b))


def _split_model_spec(raw_spec: str | None) -> tuple[str | None, str | None]:
    spec = str(raw_spec or "").strip()
    if not spec:
        return None, None
    if ":" in spec:
        provider, model = spec.split(":", 1)
        return provider.strip().lower() or None, model.strip() or None
    if "/" in spec:
        provider, model = spec.split("/", 1)
        return provider.strip().lower() or None, model.strip() or None
    return None, spec


def _has_real_api_key(api_key: str | None) -> bool:
    normalized = str(api_key or "").strip()
    if not normalized:
        return False
    lowered = normalized.lower()
    if any(token in lowered for token in ("api_key", "your_key", "placeholder")):
        return False
    return len(normalized) > 10


def _resolve_embedding_strategy() -> EmbeddingStrategy:
    enabled = str(os.environ.get("AI_EMBEDDINGS_ENABLED", "true")).strip().lower()
    if enabled in {"0", "false", "no", "off"}:
        return EmbeddingStrategy(name="local-hash-v1", backend="local", model="hash-v1")

    provider, model = _split_model_spec(os.environ.get("AI_MODEL_EMBEDDINGS", "openai:text-embedding-3-small"))
    api_key_env = _PROVIDER_API_KEY_ENV.get(str(provider or "").lower())
    api_key = os.environ.get(api_key_env or "", "") if api_key_env else ""
    if provider and model and api_key_env and _has_real_api_key(api_key):
        return EmbeddingStrategy(
            name=f"{provider}:{model}",
            backend="ai",
            provider=provider,
            model=model,
        )
    return EmbeddingStrategy(name="local-hash-v1", backend="local", model="hash-v1")


def _response_usage_tokens(response: Any) -> int | None:
    usage = getattr(response, "usage", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage")
    if usage is None:
        return None
    total_tokens = getattr(usage, "total_tokens", None)
    if total_tokens is None and isinstance(usage, dict):
        total_tokens = usage.get("total_tokens")
    if total_tokens is None:
        prompt_tokens = getattr(usage, "prompt_tokens", None)
        if prompt_tokens is None and isinstance(usage, dict):
            prompt_tokens = usage.get("prompt_tokens")
        try:
            return int(prompt_tokens) if prompt_tokens is not None else None
        except Exception:
            return None
    try:
        return int(total_tokens)
    except Exception:
        return None


def _extract_vectors(response: Any) -> list[list[float]]:
    data = getattr(response, "data", None)
    if data is None and isinstance(response, dict):
        data = response.get("data")
    if not isinstance(data, list):
        return []

    vectors: list[list[float]] = []
    for item in data:
        embedding = getattr(item, "embedding", None)
        if embedding is None and isinstance(item, dict):
            embedding = item.get("embedding")
        if not isinstance(embedding, list):
            return []
        try:
            vectors.append([float(value) for value in embedding])
        except Exception:
            return []
    return vectors


def _ai_embedding_metadata(
    *,
    user_id: str,
    task_name: str,
    strategy: EmbeddingStrategy,
    text_count: int,
) -> dict[str, Any]:
    return {
        "userId": user_id or None,
        "agent": "knowledge_retrieval",
        "promptVersion": "semantic_index_v1",
        "task": task_name,
        "textCount": text_count,
        "embeddingStrategy": strategy.name,
    }


def _embed_texts_with_ai(
    *,
    texts: list[str],
    user_id: str,
    strategy: EmbeddingStrategy,
    task_name: str,
) -> list[list[float]]:
    if not texts or strategy.backend != "ai" or not strategy.provider or not strategy.model:
        return []

    api_key_env = _PROVIDER_API_KEY_ENV.get(strategy.provider)
    api_key = os.environ.get(api_key_env or "", "") if api_key_env else ""
    started_at = time.time()
    metadata = _ai_embedding_metadata(
        user_id=user_id,
        task_name=task_name,
        strategy=strategy,
        text_count=len(texts),
    )
    prompt_summary = f"{len(texts)} retrieval text(s) embedded for semantic index."

    try:
        response = litellm.embedding(
            api_key=api_key,
            input=texts,
            model=f"{strategy.provider}/{strategy.model}",
            timeout=20,
        )
        vectors = _extract_vectors(response)
        if len(vectors) != len(texts):
            raise RuntimeError("Embedding provider returned an unexpected number of vectors")
        ai_observability_service.log_execution(
            task_name=task_name,
            provider=strategy.provider,
            model=strategy.model,
            latency_ms=int((time.time() - started_at) * 1000),
            tokens_used=_response_usage_tokens(response),
            status="success",
            prompt_text=prompt_summary,
            output_text=None,
            metadata=metadata,
        )
        return vectors
    except Exception as exc:
        ai_observability_service.log_execution(
            task_name=task_name,
            provider=strategy.provider,
            model=strategy.model,
            latency_ms=int((time.time() - started_at) * 1000),
            tokens_used=None,
            status="error",
            prompt_text=prompt_summary,
            output_text=None,
            metadata=metadata,
            error_message=str(exc),
        )
        raise


def _content_hash(text: str, tags: list[str]) -> str:
    joined = f"{text}\n::\n{','.join(_normalize_list(tags, limit=32))}"
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _lexical_score(query_terms: list[str], text: str, tags: list[str]) -> tuple[float, list[str]]:
    query_set = set(_normalize_list(query_terms, limit=24))
    source_terms = set(_tokenize(text, limit=96))
    source_terms.update(_normalize_list(tags, limit=24))
    overlap = sorted(query_set & source_terms)
    if not query_set:
        return 0.0, overlap[:4]
    return round(min(1.0, len(overlap) / max(1, min(6, len(query_set)))), 2), overlap[:4]


def _select_diverse_items(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    covered_types: set[str] = set()
    for item in items:
        source_type = str(item.get("sourceType") or "").strip()
        if not source_type or source_type in covered_types:
            continue
        selected.append(item)
        covered_types.add(source_type)
        if len(selected) >= limit:
            return selected

    selected_ids = {str(item.get("id") or "") for item in selected}
    for item in items:
        item_id = str(item.get("id") or "")
        if item_id in selected_ids:
            continue
        selected.append(item)
        selected_ids.add(item_id)
        if len(selected) >= limit:
            break
    return selected


def _embedded_documents_for_strategy(
    *,
    user_id: str,
    documents: list[dict[str, Any]],
    strategy: EmbeddingStrategy,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    existing_by_id: dict[str, dict[str, Any]] = {}
    persisted = False
    if _persistence_enabled() and user_id:
        try:
            existing_by_id = {
                str(item.get("id") or ""): item
                for item in knowledge_index_repository.list_documents(user_id, limit=max(20, len(documents) * 3))
                if isinstance(item, dict)
            }
            persisted = True
        except Exception:
            logger.exception("Failed to load knowledge index cache for uid=%s", user_id)
            existing_by_id = {}

    docs_to_embed: list[dict[str, Any]] = []
    embedded_documents: list[dict[str, Any]] = []
    reused_vectors = 0

    for item in documents:
        item_id = str(item.get("id") or "").strip()
        text = _normalize_text(item.get("text"))
        tags = _normalize_list(item.get("tags"), limit=24)
        content_hash = _content_hash(text, tags)
        current = dict(item)
        current["contentHash"] = content_hash

        cached = existing_by_id.get(item_id) or {}
        cached_vector = cached.get("vector")
        if (
            item_id
            and isinstance(cached_vector, list)
            and str(cached.get("contentHash") or "") == content_hash
            and str(cached.get("embeddingStrategy") or "") == strategy.name
        ):
            current["vector"] = [float(value) for value in cached_vector if isinstance(value, (int, float))]
            if current.get("vector"):
                reused_vectors += 1
                embedded_documents.append(current)
                continue

        docs_to_embed.append(current)

    if docs_to_embed:
        texts = [_normalize_text(item.get("text")) for item in docs_to_embed]
        tags_list = [_normalize_list(item.get("tags"), limit=24) for item in docs_to_embed]
        if strategy.backend == "ai":
            vectors = _embed_texts_with_ai(
                texts=texts,
                user_id=user_id,
                strategy=strategy,
                task_name="retrieval_index",
            )
        else:
            vectors = [_local_hash_embedding(text, tags) for text, tags in zip(texts, tags_list)]
        for item, vector in zip(docs_to_embed, vectors):
            item["vector"] = vector
            embedded_documents.append(item)

    embedded_documents.sort(key=lambda item: str(item.get("id") or ""))
    updated_vectors = len(docs_to_embed)

    if _persistence_enabled() and user_id:
        try:
            payloads: list[dict[str, Any]] = []
            keep_ids: list[str] = []
            for item in embedded_documents:
                item_id = str(item.get("id") or "").strip()
                if not item_id:
                    continue
                keep_ids.append(item_id)
                payload = {
                    "id": item_id,
                    "userId": user_id,
                    "sourceType": item.get("sourceType"),
                    "title": item.get("title"),
                    "text": _normalize_text(item.get("text")),
                    "snippet": _normalize_text(item.get("snippet")),
                    "tags": _normalize_list(item.get("tags"), limit=24),
                    "capturedAt": item.get("capturedAt"),
                    "baseScore": float(item.get("baseScore") or 0.0),
                    "contentHash": item.get("contentHash"),
                    "embeddingStrategy": strategy.name,
                    "embeddingProvider": strategy.provider,
                    "embeddingModel": strategy.model,
                    "vector": item.get("vector") or [],
                    "updatedAt": _now_iso(),
                }
                if not (existing_by_id.get(item_id) or {}).get("createdAt"):
                    payload["createdAt"] = _now_iso()
                payloads.append(payload)
            knowledge_index_repository.upsert_documents(user_id, payloads)
            knowledge_index_repository.delete_missing_documents(user_id, keep_ids)
            persisted = True
        except Exception:
            logger.exception("Failed to persist knowledge index for uid=%s", user_id)

    stats = {
        "backend": "firestore-cache" if persisted else "memory",
        "chunks": len(embedded_documents),
        "embeddingStrategy": strategy.name,
        "embeddingProvider": strategy.provider,
        "embeddingModel": strategy.model,
        "reusedVectors": reused_vectors,
        "updatedVectors": updated_vectors,
        "persisted": persisted,
    }
    return embedded_documents, stats


def _embed_query(query_text: str, query_terms: list[str], strategy: EmbeddingStrategy, user_id: str) -> list[float]:
    text = _normalize_text(query_text)
    tags = _normalize_list(query_terms, limit=24)
    if strategy.backend == "ai":
        vectors = _embed_texts_with_ai(
            texts=[text],
            user_id=user_id,
            strategy=strategy,
            task_name="retrieval_query",
        )
        if vectors:
            return vectors[0]
    return _local_hash_embedding(text, tags)


def rank_documents(
    *,
    user_id: str,
    documents: list[dict[str, Any]],
    query_text: str,
    query_terms: list[str],
    limit: int = 5,
) -> dict[str, Any]:
    clean_documents = [dict(item) for item in documents if isinstance(item, dict) and _normalize_text(item.get("text"))]
    if not clean_documents:
        return {
            "items": [],
            "retrievalMode": "semantic",
            "indexStats": {
                "backend": "memory",
                "chunks": 0,
                "embeddingStrategy": "local-hash-v1",
                "embeddingProvider": None,
                "embeddingModel": "hash-v1",
                "reusedVectors": 0,
                "updatedVectors": 0,
                "persisted": False,
            },
        }

    strategy = _resolve_embedding_strategy()
    try:
        embedded_documents, index_stats = _embedded_documents_for_strategy(
            user_id=user_id,
            documents=clean_documents,
            strategy=strategy,
        )
        query_vector = _embed_query(query_text, query_terms, strategy, user_id)
    except Exception:
        logger.exception("Semantic embedding failed for uid=%s; falling back to local hashing", user_id)
        strategy = EmbeddingStrategy(name="local-hash-v1", backend="local", model="hash-v1")
        embedded_documents, index_stats = _embedded_documents_for_strategy(
            user_id=user_id,
            documents=clean_documents,
            strategy=strategy,
        )
        query_vector = _embed_query(query_text, query_terms, strategy, user_id)

    ranked_items: list[dict[str, Any]] = []
    for item in embedded_documents:
        vector = item.get("vector") if isinstance(item.get("vector"), list) else []
        semantic_similarity = _cosine_similarity(
            [float(value) for value in query_vector if isinstance(value, (int, float))],
            [float(value) for value in vector if isinstance(value, (int, float))],
        )
        semantic_score = round(max(0.0, min(1.0, (semantic_similarity + 1.0) / 2.0)), 2)
        lexical_score, overlap = _lexical_score(query_terms, item.get("text"), item.get("tags"))
        base_score = max(0.0, min(1.0, float(item.get("baseScore") or 0.0)))
        hybrid_score = round(
            max(
                0.0,
                min(
                    0.99,
                    (semantic_score * 0.58) + (lexical_score * 0.24) + (base_score * 0.18),
                ),
            ),
            2,
        )
        ranked = dict(item)
        ranked["score"] = hybrid_score
        ranked["semanticScore"] = semantic_score
        ranked["lexicalScore"] = lexical_score
        ranked["overlap"] = overlap
        ranked_items.append(ranked)

    ranked_items.sort(
        key=lambda item: (
            float(item.get("score") or 0.0),
            float(item.get("semanticScore") or 0.0),
            float(item.get("baseScore") or 0.0),
        ),
        reverse=True,
    )
    selected = _select_diverse_items(ranked_items, max(1, int(limit)))
    selected.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)

    return {
        "items": selected,
        "retrievalMode": "semantic",
        "indexStats": index_stats,
    }
