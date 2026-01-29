import json
import os
import time
import uuid
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

from google import genai
from google.genai import types


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


class IAIProvider:
    name: str

    def is_configured(self) -> bool:
        raise NotImplementedError

    def generate(
        self,
        prompt: str,
        model: str,
        max_tokens: int,
        temperature: float,
        response_mime_type: Optional[str] = None,
        media: Optional[List[Dict[str, Any]]] = None,
    ) -> AIResult:
        raise NotImplementedError


class OpenAIProvider(IAIProvider):
    name = "openai"

    def __init__(self, api_key: Optional[str]):
        self.api_key = (api_key or "").strip() if api_key else ""

    def is_configured(self) -> bool:
        # Detectar placeholders óbvios
        if not self.api_key:
            return False
        if any(x in self.api_key.lower() for x in ['api_key', 'your_key', 'placeholder', 'openai_api_key']):
            return False
        return len(self.api_key) > 10

    def generate(self, prompt: str, model: str, max_tokens: int, temperature: float, response_mime_type: Optional[str] = None, media: Optional[List[Dict[str, Any]]] = None) -> AIResult:
        if media:
            raise AIProviderError("OpenAI provider does not support media inputs", status_code=415, retryable=True)

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_mime_type == "application/json":
            # Ask OpenAI to return strict JSON
            payload["response_format"] = {"type": "json_object"}

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
            obj = json.loads(body)
            text = obj["choices"][0]["message"]["content"]
            tokens = obj.get("usage", {}).get("total_tokens")
            return AIResult(
                output_text=text,
                provider_used=self.name,
                model_used=model,
                latency_ms=int((time.time() - start) * 1000),
                tokens_used=tokens,
            )
        except urllib.error.HTTPError as e:
            retry_after = None
            if e.headers:
                retry_after = e.headers.get("retry-after")
                if retry_after:
                    try:
                        retry_after = int(retry_after)
                    except Exception:
                        retry_after = None
            status = e.code or 503
            body = e.read().decode("utf-8", errors="ignore")
            raise AIProviderError(body or "OpenAI error", status_code=status, retry_after=retry_after, retryable=status in (429, 500, 502, 503, 504))
        except Exception as e:
            raise AIProviderError(str(e), status_code=503, retryable=True)


class GeminiProvider(IAIProvider):
    name = "gemini"

    def __init__(self, api_key: Optional[str]):
        self.api_key = (api_key or "").strip() if api_key else ""
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None

    def is_configured(self) -> bool:
        # Detectar placeholders óbvios
        if not self.api_key:
            return False
        if any(x in self.api_key.lower() for x in ['api_key', 'your_key', 'placeholder', 'gemini_api_key']):
            return False
        return len(self.api_key) > 10

    def generate(self, prompt: str, model: str, max_tokens: int, temperature: float, response_mime_type: Optional[str] = None, media: Optional[List[Dict[str, Any]]] = None) -> AIResult:
        if not self.client:
            raise AIProviderError("Gemini provider not configured", status_code=503, retryable=False)

        parts = [types.Part.from_text(text=prompt)]
        if media:
            for item in media:
                data = item.get("data")
                mime_type = item.get("mime_type")
                if data and mime_type:
                    parts.append(types.Part.from_bytes(data=data, mime_type=mime_type))

        cfg = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type=response_mime_type,
        )
        start = time.time()
        try:
            resp = self.client.models.generate_content(
                model=model,
                contents=parts if len(parts) > 1 else prompt,
                config=cfg,
            )
            text = resp.text or ""
            return AIResult(
                output_text=text,
                provider_used=self.name,
                model_used=model,
                latency_ms=int((time.time() - start) * 1000),
                tokens_used=getattr(resp.usage_metadata, "total_token_count", None) if getattr(resp, "usage_metadata", None) else None,
            )
        except Exception as e:
            msg = str(e)
            retry_after = None
            if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
                raise AIProviderError(msg, status_code=429, retry_after=25, retryable=True)
            raise AIProviderError(msg, status_code=503, retryable=True)


class GroqProvider(IAIProvider):
    name = "groq"

    def __init__(self, api_key: Optional[str]):
        self.api_key = (api_key or "").strip() if api_key else ""

    def is_configured(self) -> bool:
        # Detectar placeholders óbvios
        if not self.api_key:
            return False
        if any(x in self.api_key.lower() for x in ['api_key', 'your_key', 'placeholder', 'groq_api_key']):
            return False
        return len(self.api_key) > 10

    def generate(self, prompt: str, model: str, max_tokens: int, temperature: float, response_mime_type: Optional[str] = None, media: Optional[List[Dict[str, Any]]] = None) -> AIResult:
        if media:
            raise AIProviderError("Groq provider does not support media inputs", status_code=415, retryable=True)

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
            obj = json.loads(body)
            text = obj["choices"][0]["message"]["content"]
            tokens = obj.get("usage", {}).get("total_tokens")
            return AIResult(
                output_text=text,
                provider_used=self.name,
                model_used=model,
                latency_ms=int((time.time() - start) * 1000),
                tokens_used=tokens,
            )
        except urllib.error.HTTPError as e:
            retry_after = None
            if e.headers:
                retry_after = e.headers.get("retry-after")
                if retry_after:
                    try:
                        retry_after = int(retry_after)
                    except Exception:
                        retry_after = None
            status = e.code or 503
            body = e.read().decode("utf-8", errors="ignore")
            raise AIProviderError(body or "Groq error", status_code=status, retry_after=retry_after, retryable=status in (429, 500, 502, 503, 504))
        except Exception as e:
            raise AIProviderError(str(e), status_code=503, retryable=True)


class AIRouter:
    def __init__(self):
        self.providers = {
            "openai": OpenAIProvider(os.environ.get("OPENAI_API_KEY")),
            "gemini": GeminiProvider(os.environ.get("GEMINI_API_KEY")),
            "groq": GroqProvider(os.environ.get("GROQ_API_KEY")),
        }
        # Log startup configuration for debugging
        self._log_startup_config()

    def _provider_order(self) -> List[str]:
        raw = os.environ.get("AI_PROVIDER_ORDER", "openai,groq,gemini")
        return [p.strip() for p in raw.split(",") if p.strip()]

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

        raw = task_map.get(task_name) or ""
        if raw and ":" in raw:
            prov, model = raw.split(":", 1)
            if prov.strip().lower() == provider:
                return model.strip()
        # fallback for provider
        raw_fb = fallback_map.get(provider) or ""
        if raw_fb and ":" in raw_fb:
            prov, model = raw_fb.split(":", 1)
            if prov.strip().lower() == provider:
                return model.strip()
        return None

    def generate(
        self,
        task_name: str,
        prompt: str,
        max_tokens: int,
        temperature: float,
        model_override: Optional[str] = None,
        response_mime_type: Optional[str] = None,
        media: Optional[List[Dict[str, Any]]] = None,
    ) -> AIResult:
        if not any(p.is_configured() for p in self.providers.values()):
            raise AIProviderError("AI not configured", status_code=503, retryable=False)

        request_id = str(uuid.uuid4())
        last_retry_after = None
        tried = []

        for provider_name in self._provider_order():
            provider = self.providers.get(provider_name)
            if not provider or not provider.is_configured():
                continue

            model = None
            if model_override:
                if ":" in model_override:
                    prov, model_name = model_override.split(":", 1)
                    if prov.strip().lower() == provider_name:
                        model = model_name.strip()
                else:
                    model = model_override
            if not model:
                model = self._model_for_task(task_name, provider_name)
            if not model:
                continue

            try:
                result = provider.generate(
                    prompt=prompt,
                    model=model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    response_mime_type=response_mime_type,
                    media=media,
                )
                return result
            except AIProviderError as e:
                tried.append(f"{provider_name}:{model}")
                if e.retry_after:
                    last_retry_after = e.retry_after
                if e.retryable:
                    continue
                raise

        raise AIProviderError(
            f"All AI providers failed (tried: {', '.join(tried)})",
            status_code=503,
            retry_after=last_retry_after,
            retryable=False,
        )

    def _log_startup_config(self):
        """Log AI configuration for debugging startup issues"""
        try:
            import logging
            logger = logging.getLogger("uvicorn.error")
            configured = [name for name, p in self.providers.items() if p.is_configured()]
            order = self._provider_order()
            logger.info(f"AI Router initialized: providers={configured} order={order}")
            if not configured:
                logger.warning("No AI providers configured! Check environment variables.")
        except Exception:
            pass  # Don't fail startup if logging fails
