import json
import os
import time
import tempfile
from typing import Any, Dict, List, Optional

from pydantic import BaseModel
from google import genai
from google.genai import types
from .schemas import (
    AnswerEvaluation,
    AnswerScores,
    FinalReport,
    InterviewConfig,
    InterviewPlan,
    InterviewQuestion,
)

class GeminiClient:
    """
    Wrapper bem simples para Gemini (Google GenAI SDK).
    - Usa GEMINI_API_KEY (Gemini Developer API)
    """
    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
            api_key = api_key.strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY nao configurada no backend")
        self.client = genai.Client(api_key=api_key)
        self.model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-exp")

    def _json_config(self, schema: Any):
        return types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )

    def generate_plan(self, config: InterviewConfig) -> InterviewPlan:
        class PlanOut(BaseModel):
            roleTitleGuess: str
            seniorityGuess: str
            mustHaveSkills: List[str]
            blueprint: Dict[str, float]
            questions: List[Dict[str, Any]]

        prompt = f"""
Voce e um entrevistador de engenharia de software.
Gere um plano de entrevista (estruturado) a partir da configuracao:

Config: {config.model_dump()}

Regras:
- Idioma das perguntas: {config.interviewLanguage}
- Se existir jobDescription, adapte perguntas para ela
- Dificuldade deve refletir {config.seniority}
- blueprint: percentuais 0-100 para secoes (hr, technical, design, behavioral) somando ~100
- questions: 10 a 14 perguntas, cada uma com id, section, difficulty (1-5), prompt
"""

        resp = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=self._json_config(PlanOut),
        )
        data = json.loads(resp.text or "{}")
        questions = [InterviewQuestion(**q) for q in data["questions"]]
        return InterviewPlan(
            roleTitleGuess=data["roleTitleGuess"],
            seniorityGuess=data["seniorityGuess"],
            mustHaveSkills=data["mustHaveSkills"],
            blueprint=data["blueprint"],
            questions=questions,
        )

    def extract_first_name(self, audio_bytes: bytes, mime_type: str, ui_language: str) -> str:
        prompt = f"Extraia apenas o primeiro nome da pessoa do audio. Responda somente o nome (1 palavra). Idioma: {ui_language}"

        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            audio_file = self.client.files.upload(
                path=tmp_path,
                config=types.UploadFileConfig(mime_type=mime_type),
            )

            while audio_file.state == types.FileState.PROCESSING:
                time.sleep(1)
                audio_file = self.client.files.get(name=audio_file.name)

            resp = self.client.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_text(text=prompt),
                    types.Part.from_uri(file_uri=audio_file.uri, mime_type=mime_type),
                ],
                config=types.GenerateContentConfig(temperature=0.0),
            )
            name = (resp.text or "").strip().split()
            return name[0] if name else "Candidato"
        finally:
            os.unlink(tmp_path)

    def evaluate_answer_audio(
        self,
        config: InterviewConfig,
        question: str,
        audio_bytes: bytes,
        mime_type: str,
        confirmed_name: Optional[str] = None,
    ) -> AnswerEvaluation:
        class EvalOut(BaseModel):
            scores: AnswerScores
            strengths: List[str] = []
            improvements: List[str] = []
            followUpNeeded: bool = False
            followUpQuestion: Optional[str] = None
            transcript: str

        who = confirmed_name or "o candidato"
        prompt = f"""
Voce e um entrevistador tecnico. 
Pergunta: {question}
Senioridade alvo: {config.seniority}
Trilha: {config.track}
Stacks: {", ".join(config.stacks)}
Idioma da entrevista: {config.interviewLanguage}

Tarefas:
1) Transcreva a resposta do audio.
2) Avalie a resposta do {who} em: communication, technical, problemSolving, presence (0-10).
3) Liste 2-5 strengths e 2-5 improvements.
4) Se a resposta foi rasa, indique followUpNeeded=true e proponha followUpQuestion (1 pergunta objetiva).
Retorne JSON.
"""

        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            audio_file = self.client.files.upload(
                path=tmp_path,
                config=types.UploadFileConfig(mime_type=mime_type),
            )

            while audio_file.state == types.FileState.PROCESSING:
                time.sleep(1)
                audio_file = self.client.files.get(name=audio_file.name)

            resp = self.client.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_text(text=prompt),
                    types.Part.from_uri(file_uri=audio_file.uri, mime_type=mime_type),
                ],
                config=self._json_config(EvalOut),
            )
            data = json.loads(resp.text or "{}")
            return AnswerEvaluation(**data)
        finally:
            os.unlink(tmp_path)

    def generate_final_report(self, config: InterviewConfig, history: List[Dict[str, Any]]) -> FinalReport:
        class FinalOut(BaseModel):
            overallScore: float
            levelEstimate: str
            jobMatch: Dict[str, List[str]]
            feedback: Dict[str, List[str]]
            plan7Days: List[Dict[str, Any]]

        prompt = f"""
Analise o historico completo da entrevista e gere um relatorio final.

Config: {config.model_dump()}
Historico: {history}

Retorne JSON com:
- overallScore (0-10)
- levelEstimate (string)
- jobMatch: {{ covered: [..], gaps: [..] }}
- feedback: {{ posture: [..], communication: [..], technical: [..], language: [..] }}
- plan7Days: lista de 7 itens (day: 1-7, task: string)
"""
        resp = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=self._json_config(FinalOut),
        )
        data = json.loads(resp.text or "{}")
        return FinalReport(**data)
