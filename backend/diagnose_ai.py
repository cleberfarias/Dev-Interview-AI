#!/usr/bin/env python3

"""
Script de diagnóstico para verificar configuração de AI em produção
Execute este script no ambiente de produção para diagnosticar problemas
"""

import os
import sys
import json
from typing import Dict, Any

# Load .env if available
try:
    from dotenv import load_dotenv
    load_dotenv('.env')
    load_dotenv(os.path.join('..', '.env'))  # also try parent dir
except ImportError:
    pass  # dotenv not available

def check_environment() -> Dict[str, Any]:
    """Verificar variáveis de ambiente"""
    result = {
        "environment_vars": {},
        "issues": []
    }
    
    # Verificar chaves de API
    keys = ["OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "AI_PROVIDER_ORDER"]
    for key in keys:
        value = os.environ.get(key, "")
        if value:
            # Mascarar chave para segurança
            if "API_KEY" in key and len(value) > 8:
                masked = "***" + value[-4:]
            else:
                masked = value[:20] + "..." if len(value) > 20 else value
            result["environment_vars"][key] = {"present": True, "masked_value": masked}
            
            # Detectar placeholders
            if any(x in value.lower() for x in ['api_key', 'your_key', 'placeholder']):
                result["issues"].append(f"{key} appears to be a placeholder: {masked}")
        else:
            result["environment_vars"][key] = {"present": False, "masked_value": ""}
    
    return result

def check_dependencies() -> Dict[str, Any]:
    """Verificar dependências Python"""
    result = {
        "dependencies": {},
        "issues": []
    }
    
    required_packages = [
        "fastapi", "uvicorn", "firebase_admin", 
        "google.genai", "google.cloud.texttospeech", "pydantic"
    ]
    
    for package in required_packages:
        try:
            if package == "google.genai":
                import google.genai as genai
            elif package == "google.cloud.texttospeech":
                from google.cloud import texttospeech
            else:
                __import__(package)
            result["dependencies"][package] = {"available": True}
        except ImportError as e:
            result["dependencies"][package] = {"available": False, "error": str(e)}
            result["issues"].append(f"Missing dependency: {package} - {e}")
    
    return result

def check_ai_providers() -> Dict[str, Any]:
    """Testar providers de AI"""
    result = {
        "providers": {},
        "issues": []
    }
    
    try:
        sys.path.append(os.path.dirname(__file__))
        from app.ai.router import AIRouter
        
        router = AIRouter()
        
        for name, provider in router.providers.items():
            configured = provider.is_configured()
            result["providers"][name] = {
                "configured": configured,
                "class": provider.__class__.__name__
            }
            
            if not configured:
                result["issues"].append(f"Provider {name} not configured")
        
        # Testar geração simples se algum provider estiver configurado
        if any(p.is_configured() for p in router.providers.values()):
            try:
                test_result = router.generate(
                    task_name="plan",
                    prompt="Test: respond OK",
                    max_tokens=5,
                    temperature=0.0
                )
                result["test_generation"] = {
                    "success": True,
                    "provider_used": test_result.provider_used,
                    "model_used": test_result.model_used,
                    "latency_ms": test_result.latency_ms
                }
            except Exception as e:
                result["test_generation"] = {
                    "success": False,
                    "error": str(e)
                }
                result["issues"].append(f"AI generation test failed: {e}")
        
    except Exception as e:
        result["issues"].append(f"Failed to initialize AIRouter: {e}")
    
    return result

def main():
    """Executar diagnóstico completo"""
    print("=== DIAGNÓSTICO AI - PRODUÇÃO ===\n")
    
    # Verificar ambiente
    print("1. Verificando variáveis de ambiente...")
    env_check = check_environment()
    for key, info in env_check["environment_vars"].items():
        status = "✓" if info["present"] else "✗"
        print(f"  {status} {key}: {info['masked_value'] or 'não definida'}")
    
    # Verificar dependências
    print("\n2. Verificando dependências Python...")
    deps_check = check_dependencies()
    for package, info in deps_check["dependencies"].items():
        status = "✓" if info["available"] else "✗"
        error = f" - {info.get('error', '')}" if not info["available"] else ""
        print(f"  {status} {package}{error}")
    
    # Verificar AI providers
    print("\n3. Verificando providers de AI...")
    ai_check = check_ai_providers()
    if "providers" in ai_check:
        for name, info in ai_check["providers"].items():
            status = "✓" if info["configured"] else "✗"
            print(f"  {status} {name}: {info['class']}")
    
    if "test_generation" in ai_check:
        if ai_check["test_generation"]["success"]:
            test = ai_check["test_generation"]
            print(f"  ✓ Teste de geração: {test['provider_used']} | {test['model_used']} ({test['latency_ms']}ms)")
        else:
            print(f"  ✗ Teste de geração falhou: {ai_check['test_generation']['error']}")
    
    # Resumir problemas
    all_issues = env_check["issues"] + deps_check["issues"] + ai_check["issues"]
    if all_issues:
        print(f"\n🚨 PROBLEMAS ENCONTRADOS ({len(all_issues)}):")
        for i, issue in enumerate(all_issues, 1):
            print(f"  {i}. {issue}")
    else:
        print("\n✅ NENHUM PROBLEMA ENCONTRADO")
    
    # Salvar relatório JSON
    report = {
        "environment": env_check,
        "dependencies": deps_check, 
        "ai_providers": ai_check,
        "summary": {
            "total_issues": len(all_issues),
            "issues": all_issues
        }
    }
    
    with open("ai_diagnostic_report.json", "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Relatório salvo em: ai_diagnostic_report.json")
    
    return len(all_issues) == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)