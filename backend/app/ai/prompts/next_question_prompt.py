from __future__ import annotations

from ...schemas import InterviewConfig


def build_next_question_prompt(
    config: InterviewConfig,
    history_summary: list,
    average_scores: dict,
    remaining_seconds: int,
    asked_count: int,
    min_questions: int,
    max_questions: int,
    difficulty_hint: str,
    context: str = "",
) -> str:
    return f"""
Voce e um entrevistador de engenharia de software.
Gere a PROXIMA pergunta com base na configuracao e no historico.

Config: {config.model_dump()}
Historico (resumo): {history_summary}
Medias de scores: {average_scores}
remainingSeconds: {remaining_seconds}
askedCount: {asked_count}
minQuestions: {min_questions}
maxQuestions: {max_questions}
{context}

Retorne SOMENTE JSON valido:
{{
  "shouldFinish": false,
  "reason": null,
  "question": {{
    "id": "q{asked_count + 1}",
    "section": "technical",
    "difficulty": 3,
    "prompt": "..."
  }}
}}

Regras:
- Idioma da pergunta: {config.interviewLanguage}
- Se remainingSeconds <= 60 ou askedCount >= maxQuestions, defina shouldFinish=true e question=null.
- Nao repita a mesma pergunta ou tema imediatamente.
- Balanceie secoes (hr, technical, design, behavioral) conforme gaps.
- difficulty deve ficar no range {difficulty_hint}.
- Pergunta deve ser objetiva (1-2 frases).
"""


def build_next_question_prompt_strict(
    config: InterviewConfig,
    history_summary: list,
    average_scores: dict,
    remaining_seconds: int,
    asked_count: int,
    min_questions: int,
    max_questions: int,
    difficulty_hint: str,
    context: str = "",
) -> str:
    base = build_next_question_prompt(
        config=config,
        history_summary=history_summary,
        average_scores=average_scores,
        remaining_seconds=remaining_seconds,
        asked_count=asked_count,
        min_questions=min_questions,
        max_questions=max_questions,
        difficulty_hint=difficulty_hint,
        context=context,
    )
    return (
        f"{base}\n"
        "MODO ESTRITO:\n"
        "- Retorne exatamente um objeto JSON raiz.\n"
        "- Sem markdown, sem comentarios, sem texto fora do JSON.\n"
        "- Campo question deve ser objeto ou null.\n"
    )
