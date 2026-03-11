from __future__ import annotations

from typing import Optional

from ...schemas import InterviewConfig


def build_eval_prompt(
    config: InterviewConfig,
    question: str,
    candidate_name: str,
    rubric_block: str = "",
    transcript: Optional[str] = None,
) -> str:
    tasks = """
Tarefas:
1) Transcreva a resposta do audio.
2) Avalie a resposta do {name} em 5 criterios (0-10): clarity, structure, relevance, technicalPrecision, communication.
3) Preencha tambem os campos legados em scores: communication, technical, problemSolving, presence (0-10), coerentes com os criterios.
4) Liste 2-5 strengths e 2-5 improvements.
5) Se a resposta foi rasa, indique followUpNeeded=true e proponha followUpQuestion (1 pergunta objetiva).
""".format(name=candidate_name)

    transcript_block = ""
    if transcript:
        tasks = """
Tarefas:
1) Use a transcricao fornecida (nao transcreva novamente).
2) Avalie a resposta do {name} em 5 criterios (0-10): clarity, structure, relevance, technicalPrecision, communication.
3) Preencha tambem os campos legados em scores: communication, technical, problemSolving, presence (0-10), coerentes com os criterios.
4) Liste 2-5 strengths e 2-5 improvements.
5) Se a resposta foi rasa, indique followUpNeeded=true e proponha followUpQuestion (1 pergunta objetiva).
""".format(name=candidate_name)
        transcript_block = f"""
Transcricao fornecida (copie exatamente para o campo transcript):
\"\"\"{transcript}\"\"\"
"""

    return f"""
Voce e um entrevistador tecnico.
Pergunta: {question}
Senioridade alvo: {config.seniority}
Trilha: {config.track}
Stacks: {", ".join(config.stacks)}
Idioma da entrevista: {config.interviewLanguage}

{rubric_block}
{tasks}
{transcript_block}

Formato EXATO:
{{
  "transcript": "string",
  "criteriaScores": {{"clarity": 0, "structure": 0, "relevance": 0, "technicalPrecision": 0, "communication": 0}},
  "scores": {{"communication": 0, "technical": 0, "problemSolving": 0, "presence": 0}},
  "strengths": ["..."],
  "improvements": ["..."],
  "followUpNeeded": false,
  "followUpQuestion": null
}}

Regras:
- Retorne somente JSON valido, sem markdown e sem texto extra.
- Sempre inclua o campo transcript (use \\n para quebras de linha).
- Se followUpNeeded=false, followUpQuestion deve ser null.
"""
