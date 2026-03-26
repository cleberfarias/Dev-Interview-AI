import base64
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import litellm

from ..services import ai_observability_service


RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}
SUPPORTED_PROVIDERS = {"openai", "gemini", "groq"}


@dataclass
class AIResult:
    output_text: str
    provider_used: str
    model_used: str
    latency_ms: int
    tokens_used: Optional[int] = None


class AIProviderError(Exception):
    def __init__(self, message: str, status_code: int = 503, retry_after: Optional[int] = None, retryable: bool = True):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after
        self.retryable = retryable


def _has_real_api_key(api_key: str) -> bool:
    normalized = (api_key or "").strip()
    if not normalized:
        return False
    lowered = normalized.lower()
    if any(token in lowered for token in ("api_key", "your_key", "placeholder")):
        return False
    return len(normalized) > 10


def _value_for(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


@dataclass
class LiteLLMProviderConfig:
    name: str
    api_key_env: str

    @property
    def api_key(self) -> str:
        return (os.environ.get(self.api_key_env) or "").strip()

    def is_configured(self) -> bool:
        return _has_real_api_key(self.api_key)


class AIRouter:
    def __init__(self):
        self.providers = {
            "openai": LiteLLMProviderConfig(name="openai", api_key_env="OPENAI_API_KEY"),
            "gemini": LiteLLMProviderConfig(name="gemini", api_key_env="GEMINI_API_KEY"),
            "groq": LiteLLMProviderConfig(name="groq", api_key_env="GROQ_API_KEY"),
        }
        self._log_startup_config()

    def _provider_order(self, media: Optional[List[Dict[str, Any]]] = None) -> List[str]:
        if media:
            raw = os.environ.get("AI_PROVIDER_ORDER_MEDIA", "gemini,openai,groq")
        else:
            raw = os.environ.get("AI_PROVIDER_ORDER", "openai,groq,gemini")
        return [provider.strip().lower() for provider in raw.split(",") if provider.strip()]

    def _model_for_task(self, task_name: str, provider: str) -> Optional[str]:
        task_map = {
            "plan": os.environ.get("AI_MODEL_PLAN", "openai:gpt-4o-mini"),
            "evaluate": os.environ.get("AI_MODEL_FAST", "openai:gpt-4.1-nano"),
            "report": os.environ.get("AI_MODEL_REPORT", "openai:gpt-4o-mini"),
        }
        fallback_map = {
            "gemini": os.environ.get("AI_MODEL_FALLBACK_GEMINI", "gemini:gemini-1.5-mini"),
            "groq": os.environ.get("AI_MODEL_FALLBACK_GROQ", "groq:llama-3.1-8b-instant"),
            "openai": os.environ.get("AI_MODEL_FALLBACK_OPENAI", "openai:gpt-4o-mini"),
        }

        task_provider, task_model = self._split_model_spec(task_map.get(task_name))
        if task_provider == provider and task_model:
            return task_model

        fallback_provider, fallback_model = self._split_model_spec(fallback_map.get(provider))
        if fallback_provider == provider and fallback_model:
            return fallback_model
        return None

    def _resolve_model(self, provider_name: str, task_name: str, model_override: Optional[str]) -> Optional[str]:
        override_provider, override_model = self._split_model_spec(model_override)
        if override_provider:
            return override_model if override_provider == provider_name else None
        if override_model:
            return override_model
        return self._model_for_task(task_name, provider_name)

    def _split_model_spec(self, raw_spec: Optional[str]) -> tuple[Optional[str], Optional[str]]:
        spec = (raw_spec or "").strip()
        if not spec:
            return None, None

        if ":" in spec:
            provider, model = spec.split(":", 1)
            normalized_provider = provider.strip().lower()
            if normalized_provider in SUPPORTED_PROVIDERS:
                return normalized_provider, model.strip() or None

        if "/" in spec:
            provider, model = spec.split("/", 1)
            normalized_provider = provider.strip().lower()
            if normalized_provider in SUPPORTED_PROVIDERS:
                return normalized_provider, model.strip() or None

        return None, spec

    def _litellm_model_name(self, provider_name: str, model_name: str) -> str:
        return f"{provider_name}/{model_name}"

    def _request_retry_count(self) -> int:
        raw = (os.environ.get("AI_PROVIDER_RETRIES") or "").strip()
        if not raw:
            return 1
        try:
            return max(0, int(raw))
        except Exception:
            return 1

    def _build_messages(self, prompt: str, media: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        if not media:
            return [{"role": "user", "content": prompt}]

        content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
        for item in media:
            block = self._build_media_block(item)
            if block:
                content.append(block)
        return [{"role": "user", "content": content}]

    def _build_media_block(self, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        data = item.get("data")
        mime_type = (item.get("mime_type") or "").split(";", 1)[0].strip().lower()
        if not data or not mime_type:
            return None

        encoded = base64.b64encode(data).decode("ascii")

        if mime_type.startswith("audio/"):
            return {
                "type": "input_audio",
                "input_audio": {
                    "data": encoded,
                    "format": self._audio_format_for(mime_type),
                },
            }

        if mime_type.startswith("image/"):
            return {
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{encoded}"},
            }

        raise AIProviderError(
            f"Unsupported media type for AI router: {mime_type}",
            status_code=415,
            retryable=True,
        )

    def _audio_format_for(self, mime_type: str) -> str:
        if mime_type in {"audio/wav", "audio/x-wav", "audio/wave"}:
            return "wav"
        if mime_type in {"audio/mpeg", "audio/mp3", "audio/mpga"}:
            return "mp3"
        if mime_type in {"audio/ogg", "audio/opus"}:
            return "ogg"
        return mime_type.split("/", 1)[-1]

    def _completion_kwargs(
        self,
        prompt: str,
        model_name: str,
        provider: LiteLLMProviderConfig,
        max_tokens: int,
        temperature: float,
        response_mime_type: Optional[str],
        media: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = {
            "api_key": provider.api_key,
            "max_tokens": max_tokens,
            "messages": self._build_messages(prompt, media),
            "model": self._litellm_model_name(provider.name, model_name),
            "num_retries": self._request_retry_count(),
            "temperature": temperature,
            "timeout": 30,
        }

        if response_mime_type == "application/json":
            kwargs["response_format"] = {"type": "json_object"}

        return kwargs

    def _extract_output_text(self, response: Any) -> str:
        choices = _value_for(response, "choices", []) or []
        if not choices:
            return ""

        first_choice = choices[0]
        message = _value_for(first_choice, "message")
        if not message:
            return ""

        content = _value_for(message, "content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: List[str] = []
            for block in content:
                text = _value_for(block, "text")
                if text:
                    parts.append(str(text))
            return "\n".join(parts).strip()
        if content is None:
            return ""
        return str(content)

    def _extract_total_tokens(self, response: Any) -> Optional[int]:
        usage = _value_for(response, "usage")
        total_tokens = _value_for(usage, "total_tokens")
        if total_tokens is None:
            prompt_tokens = _value_for(usage, "prompt_tokens")
            completion_tokens = _value_for(usage, "completion_tokens")
            if prompt_tokens is not None or completion_tokens is not None:
                total_tokens = int(prompt_tokens or 0) + int(completion_tokens or 0)
        try:
            return int(total_tokens) if total_tokens is not None else None
        except Exception:
            return None

    def _retry_after_from_exception(self, exc: Exception) -> Optional[int]:
        response = getattr(exc, "response", None)
        headers = getattr(response, "headers", None) or getattr(exc, "headers", None)
        if not headers:
            return None

        retry_after = headers.get("retry-after")
        if retry_after is None:
            return None

        try:
            return int(float(retry_after))
        except Exception:
            return None

    def _message_from_exception(self, exc: Exception) -> str:
        message = getattr(exc, "message", None)
        if isinstance(message, str) and message.strip():
            return message
        return str(exc)

    def _to_ai_provider_error(self, exc: Exception, media_present: bool) -> AIProviderError:
        retry_after = self._retry_after_from_exception(exc)
        status_code = getattr(exc, "status_code", None)
        if status_code is None:
            if isinstance(exc, litellm.RateLimitError):
                status_code = 429
            elif isinstance(exc, litellm.Timeout):
                status_code = 408
            elif isinstance(exc, litellm.AuthenticationError):
                status_code = 401
            elif isinstance(exc, litellm.PermissionDeniedError):
                status_code = 403
            elif isinstance(exc, litellm.NotFoundError):
                status_code = 404
            elif isinstance(exc, (litellm.BadRequestError, litellm.ContextWindowExceededError, litellm.UnsupportedParamsError)):
                status_code = 400
            elif isinstance(exc, litellm.UnprocessableEntityError):
                status_code = 422
            elif isinstance(exc, litellm.BadGatewayError):
                status_code = 502
            elif isinstance(exc, (litellm.ServiceUnavailableError, litellm.APIConnectionError)):
                status_code = 503
            elif isinstance(exc, litellm.InternalServerError):
                status_code = 500
            else:
                status_code = 503

        retryable = status_code in RETRYABLE_STATUS_CODES or (media_present and status_code in {400, 415, 422})
        return AIProviderError(
            self._message_from_exception(exc),
            status_code=int(status_code or 503),
            retry_after=retry_after,
            retryable=retryable,
        )

    def generate(
        self,
        task_name: str,
        prompt: str,
        max_tokens: int,
        temperature: float,
        model_override: Optional[str] = None,
        response_mime_type: Optional[str] = None,
        media: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AIResult:
        meta = dict(metadata or {})
        configured_providers = [provider for provider in self.providers.values() if provider.is_configured()]
        if not configured_providers:
            ai_observability_service.log_execution(
                task_name=task_name,
                provider=None,
                model=model_override,
                latency_ms=0,
                tokens_used=None,
                status="error",
                prompt_text=prompt,
                output_text=None,
                metadata=meta,
                error_message="AI not configured",
            )
            raise AIProviderError("AI not configured", status_code=503, retryable=False)

        last_retry_after = None
        tried: List[str] = []

        for provider_name in self._provider_order(media):
            provider = self.providers.get(provider_name)
            if not provider or not provider.is_configured():
                continue

            model_name = self._resolve_model(provider_name, task_name, model_override)
            if not model_name:
                continue

            started_at = time.time()
            try:
                response = litellm.completion(
                    **self._completion_kwargs(
                        prompt=prompt,
                        model_name=model_name,
                        provider=provider,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        response_mime_type=response_mime_type,
                        media=media,
                    )
                )

                result = AIResult(
                    output_text=self._extract_output_text(response),
                    provider_used=provider_name,
                    model_used=model_name,
                    latency_ms=int((time.time() - started_at) * 1000),
                    tokens_used=self._extract_total_tokens(response),
                )
                ai_observability_service.log_execution(
                    task_name=task_name,
                    provider=result.provider_used,
                    model=result.model_used,
                    latency_ms=result.latency_ms,
                    tokens_used=result.tokens_used,
                    status="success",
                    prompt_text=prompt,
                    output_text=result.output_text,
                    metadata=meta,
                )
                return result
            except AIProviderError as exc:
                error = exc
            except Exception as exc:  # LiteLLM maps provider failures to unified exceptions.
                error = self._to_ai_provider_error(
                    exc,
                    media_present=bool(media),
                )

            ai_observability_service.log_execution(
                task_name=task_name,
                provider=provider_name,
                model=model_name,
                latency_ms=int((time.time() - started_at) * 1000),
                tokens_used=None,
                status="error",
                prompt_text=prompt,
                output_text=None,
                metadata=meta,
                error_message=str(error),
            )
            tried.append(f"{provider_name}:{model_name}")
            if error.retry_after:
                last_retry_after = error.retry_after
            if error.retryable:
                continue
            raise error

        raise AIProviderError(
            f"All AI providers failed (tried: {', '.join(tried)})",
            status_code=503,
            retry_after=last_retry_after,
            retryable=False,
        )

    def _log_startup_config(self):
        try:
            import logging

            logger = logging.getLogger("uvicorn.error")
            configured = [name for name, provider in self.providers.items() if provider.is_configured()]
            logger.info("AI Router initialized: providers=%s order=%s", configured, self._provider_order())
            if not configured:
                logger.warning("No AI providers configured! Check environment variables.")
        except Exception:
            pass
