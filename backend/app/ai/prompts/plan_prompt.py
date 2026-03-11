from __future__ import annotations

from ...schemas import InterviewConfig


def build_plan_prompt_strict(
    config: InterviewConfig,
    duration_minutes: int,
    min_questions: int,
    max_questions: int,
    context: str = "",
) -> str:
    return f"""
Voce e um entrevistador de engenharia de software.
Retorne SOMENTE um JSON valido, sem markdown e sem texto extra.

Formato EXATO:
{{
  "roleTitleGuess": "string",
  "seniorityGuess": "string",
  "mustHaveSkills": ["skill1","skill2"],
  "blueprint": {{"hr": 20, "technical": 45, "design": 20, "behavioral": 15}},
  "questions": [
    {{"id":"q1","section":"technical","difficulty":3,"prompt":"..."}}
  ]
}}

Config: {config.model_dump()}
{context}

Regras:
- Idioma das perguntas: {config.interviewLanguage}
- Se existir jobDescription, adapte perguntas para ela
- Dificuldade deve refletir {config.seniority}
- Duracao alvo: {duration_minutes} minutos
- questions: {min_questions} a {max_questions} perguntas
"""


def build_plan_prompt(
    config: InterviewConfig,
    duration_minutes: int,
    min_questions: int,
    max_questions: int,
    context: str = "",
) -> str:
    return f"""
Voce e um entrevistador de engenharia de software.
Gere um plano de entrevista (estruturado) a partir da configuracao:

Config: {config.model_dump()}
{context}

Regras:
- Idioma das perguntas: {config.interviewLanguage}
- Se existir jobDescription, adapte perguntas para ela
- Dificuldade deve refletir {config.seniority}
- blueprint: percentuais 0-100 para secoes (hr, technical, design, behavioral) somando ~100
- Duracao alvo: {duration_minutes} minutos
- questions: {min_questions} a {max_questions} perguntas, cada uma com id, section, difficulty (1-5), prompt
Retorne somente JSON, sem markdown e sem texto extra.
"""
