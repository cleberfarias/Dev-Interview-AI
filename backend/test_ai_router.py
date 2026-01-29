#!/usr/bin/env python3

"""
Teste simples do AIRouter para detectar problemas nas chaves de API
"""

import os
import sys
sys.path.append('.')

from dotenv import load_dotenv
load_dotenv('.env')

from app.ai.router import AIRouter, AIProviderError

def test_ai_router():
    print("=== Teste AIRouter ===")
    
    # Verificar variáveis de ambiente
    openai_key = os.environ.get('OPENAI_API_KEY', '')
    gemini_key = os.environ.get('GEMINI_API_KEY', '')
    groq_key = os.environ.get('GROQ_API_KEY', '')
    
    print(f"OPENAI_API_KEY: {'***' + openai_key[-4:] if len(openai_key) > 4 else repr(openai_key)}")
    print(f"GEMINI_API_KEY: {'***' + gemini_key[-4:] if len(gemini_key) > 4 else repr(gemini_key)}")
    print(f"GROQ_API_KEY: {'***' + groq_key[-4:] if len(groq_key) > 4 else repr(groq_key)}")
    print(f"AI_PROVIDER_ORDER: {os.environ.get('AI_PROVIDER_ORDER', 'not set')}")
    
    router = AIRouter()
    
    # Verificar quais providers estão configurados
    print("\n=== Providers configurados ===")
    for name, provider in router.providers.items():
        configured = provider.is_configured()
        print(f"{name}: {configured}")
    
    # Tentar gerar algo simples
    print("\n=== Teste de geração ===")
    try:
        result = router.generate(
            task_name="plan",
            prompt="Responda apenas: 'OK'",
            max_tokens=10,
            temperature=0.0,
            response_mime_type="text/plain"
        )
        print(f"SUCCESS: {result.provider_used} | {result.model_used} | {result.output_text}")
    except AIProviderError as e:
        print(f"AIProviderError: {e}")
        print(f"  status_code: {e.status_code}")
        print(f"  retry_after: {e.retry_after}")
        print(f"  retryable: {e.retryable}")
    except Exception as e:
        print(f"Other error: {e}")

if __name__ == '__main__':
    test_ai_router()