from __future__ import annotations

from ...schemas import InterviewConfig


def build_report_prompt(config: InterviewConfig, history: list, context: str = "") -> str:
    return f"""
Analise o historico completo da entrevista e gere um relatorio final.

Config: {config.model_dump()}
Historico: {history}
{context}

Retorne somente JSON, sem markdown e sem texto extra. Campos:
- overallScore (0-10)
- levelEstimate (string)
- jobMatch: {{ covered: [..], gaps: [..] }}
- feedback: {{ posture: [..], communication: [..], technical: [..], language: [..] }}
- plan7Days: lista de 7 itens (day: 1-7, task: string)
"""
