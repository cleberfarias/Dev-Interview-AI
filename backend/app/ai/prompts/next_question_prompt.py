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
    interview_mode = getattr(config, "interviewMode", "candidate_coaching_mode")
    mode_guidance = (
        "- candidate_coaching_mode: voce pode escolher perguntas que aprofundem gaps de comunicacao/comportamento de forma construtiva, mas sem dar a resposta.\n"
        "- hiring_assessment_mode: faca perguntas para coletar evidencia objetiva. Nao ofereca coaching, alivio ou dica embutida no texto."
    )
    return f"""
Voce e um entrevistador de engenharia de software.
Gere a PROXIMA pergunta com base na configuracao e no historico.

Config: {config.model_dump()}
interviewMode: {interview_mode}
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
- Nao repita nenhuma pergunta ja feita nesta sessao, nem reformule o mesmo tema/subtema com palavras parecidas.
- Se houver empate entre varias boas opcoes, prefira a que explora outro foco tecnico ou comportamental ainda nao coberto.
- Balanceie secoes (hr, technical, design, behavioral) conforme gaps.
- Considere sinais de communicationAnalysis, behaviorProfile e cultureFitSignals quando estiverem no historico.
- Use o modo abaixo como regra de conduta:
{mode_guidance}
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
        "- A pergunta precisa ser nova em relacao a toda a sessao, nao apenas a ultima pergunta.\n"
    )
