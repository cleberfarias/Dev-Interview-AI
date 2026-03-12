TASK — Evolução do Dev Interview AI
Visão do Produto

O Dev Interview AI é uma plataforma de simulação de entrevistas técnicas com inteligência artificial.

O sistema deve permitir que um candidato participe de uma entrevista simulada por vídeo, conduzida por uma IA entrevistadora em tempo real, que:

faz perguntas por voz

escuta a resposta do candidato

analisa a resposta

adapta a próxima pergunta

gera relatório detalhado

cria plano de estudo personalizado

A experiência deve simular uma entrevista técnica real, com presença audiovisual da IA entrevistadora.

Objetivos desta tarefa

Finalizar a persistência de contexto do candidato (Item 5).

Organizar o uso correto de IA no backend.

Implementar entrevistas conduzidas por LLMs.

Implementar arquitetura multiagente.

Criar simulação de entrevista por vídeo em tempo real.

Criar orquestrador de entrevista.

Parte 1 — Persistência de contexto do candidato
Situação atual

O projeto já possui:

candidate_profiles

candidate_profile_repository.py

candidate_profile_service.py

analysisAudit

lastResumeAnalysisTrace

lastJobAnalysisTrace

Isso atende parcialmente o item 5, mas ainda faltam:

histórico completo de análises

proteção contra sobrescrita acidental

persistência de análises completas

referências para análises recentes

Tarefa 1.1 — Ajustar merge seletivo no CandidateProfile
Problema

upsert_candidate_profile pode sobrescrever dados válidos com:

listas vazias

campos nulos

campos ausentes

Objetivo

Evitar perda de contexto anterior.

Arquivo
backend/app/services/candidate_profile_service.py
Regra

se campo vier None → manter valor atual

se lista vier vazia → preservar valor existente

atualizar apenas com dados novos válidos

Tarefa 1.2 — Persistir análise completa de currículo
Criar repositório
backend/app/repositories/resume_analysis_repository.py
Coleção
resume_analyses
Estrutura esperada
{
  "userId": "uid",
  "fileName": "resume.pdf",
  "aiProvider": "openai",
  "aiModel": "gpt",
  "source": "ai|hybrid|heuristic",
  "promptVersion": "resume_v1",
  "parsingMode": "hybrid",
  "extraction": {
    "technologies": [],
    "experienceLevel": "junior",
    "projects": [],
    "companies": [],
    "responsibilities": [],
    "resumeSummary": "..."
  },
  "match": {
    "matchScore": 74,
    "strongSkills": [],
    "weakSkills": [],
    "missingSkills": [],
    "interviewSuggestions": []
  },
  "confidence": 0.85,
  "createdAt": "..."
}
Onde chamar

Dentro de:

resume_service.analyze_resume()
Tarefa 1.3 — Persistir análise completa de vaga
Criar repositório
backend/app/repositories/job_analysis_repository.py
Coleção
job_analyses
Estrutura
{
  "userId": "uid",
  "jobDescription": "...",
  "aiProvider": "gemini",
  "aiModel": "gemini-pro",
  "analysis": {
    "roleTitleGuess": "Frontend Developer",
    "seniorityGuess": "junior",
    "requiredSkills": [],
    "softSkills": [],
    "interviewFocus": []
  },
  "gap": {
    "matchScore": 68,
    "strongSkills": [],
    "weakSkills": [],
    "missingSkills": []
  },
  "createdAt": "..."
}
Tarefa 1.4 — Enriquecer CandidateProfile

Adicionar campos:

lastResumeAnalysisId
lastJobAnalysisId
lastMatchScore
recentJobAnalysisIds
recentResumeAnalysisIds

Atualizar:

backend/app/schemas/
frontend/src/shared/types/
Tarefa 1.5 — Enriquecer analysisAudit

Arquivo:

candidate_profile_repository.py

Adicionar campo summary.

Exemplo:

{
  "kind": "resume",
  "aiProvider": "openai",
  "aiModel": "gpt",
  "summary": {
    "experienceLevel": "junior",
    "topSkills": ["react", "typescript"],
    "matchScore": 72
  }
}
Tarefa 1.6 — Atualizar perfil automaticamente

Após:

resume_service.analyze_resume()
jobs_service.analyze_job()

O backend deve atualizar automaticamente:

candidate_profiles

Frontend não deve consolidar estado crítico.

Tarefa 1.7 — Criar endpoints de histórico

Criar endpoints:

GET /profile/candidate/resume-analyses
GET /profile/candidate/job-analyses
Parte 2 — Diretrizes de uso de IA
Regra principal

IA deve:

interpretar e enriquecer dados

Backend deve:

validar

persistir

controlar estado

Regra geral:

IA interpreta
Backend valida
Banco persiste
Tarefa 2.1 — Padronizar saídas da IA

Todas respostas devem ser JSON estruturado.

Exemplo
{
  "experienceLevel": "junior",
  "primarySkills": ["React", "JavaScript"],
  "weakSkills": ["Testing"],
  "resumeSummary": "Frontend developer..."
}
Tarefa 2.2 — Salvar metadados de IA

Salvar sempre:

aiProvider
aiModel
promptVersion
source
confidence
createdAt
Tarefa 2.3 — Separar parsing de IA

Fluxo correto:

arquivo
↓
parser determinístico
↓
limpeza
↓
IA
↓
validação
↓
persistência
Tarefa 2.4 — Validar resposta da IA

Usar schema forte com:

Pydantic

Se resposta inválida:

tentar corrigir

fallback

ou rejeitar

Parte 3 — Entrevista por vídeo com IA
Objetivo

Criar simulação de entrevista por vídeo com IA em tempo real.

A IA atua como entrevistadora.

O candidato aparece pela câmera.

Fluxo da entrevista
Usuário entra na entrevista
↓
câmera e microfone ativam
↓
IA se apresenta por voz
↓
IA faz pergunta
↓
usuário responde olhando para câmera
↓
resposta é transcrita
↓
IA avalia resposta
↓
IA faz próxima pergunta
↓
repete até finalizar
↓
relatório final
Componentes necessários
Frontend

preview da câmera

player de voz da IA

indicador de escuta

indicador de fala

layout da sala de entrevista

Backend

orquestrador da entrevista

agentes da entrevista

STT

TTS

LLM

Pipeline de resposta
audio usuário
↓
speech-to-text
↓
texto
↓
avaliador LLM
↓
score + feedback
Parte 4 — Arquitetura multiagente

Criar diretório:

backend/app/agents/

Arquivos:

candidate_agent.py
job_agent.py
match_agent.py
interviewer_agent.py
evaluator_agent.py
coach_agent.py
report_agent.py
study_plan_agent.py
Responsabilidade dos agentes
candidate_agent

Analisa o candidato.

Entrada:

currículo

perfil

Saída:

skills

senioridade

resumo

job_agent

Analisa a vaga.

Saída:

skills exigidas

senioridade

foco da entrevista

match_agent

Compara candidato com vaga.

Saída:

match score

lacunas

interviewer_agent

Conduz entrevista.

Saída:

próxima pergunta

dificuldade

tópico

evaluator_agent

Avalia resposta.

Critérios:

clareza

precisão técnica

comunicação

coach_agent

Melhora resposta.

Saída:

resposta ideal

dicas

report_agent

Gera relatório final.

Saída:

score geral

pontos fortes

pontos fracos

study_plan_agent

Cria plano de estudo.

Saída:

tópicos prioritários

plano semanal

Parte 5 — Orquestrador da entrevista

Criar arquivo:

backend/app/services/interview_orchestrator.py
Fluxo do orquestrador
carregar perfil
↓
rodar candidate_agent
↓
rodar job_agent
↓
rodar match_agent
↓
iniciar sessão
↓
interviewer_agent gera pergunta
↓
usuário responde
↓
evaluator_agent avalia
↓
coach_agent melhora resposta
↓
decidir próxima pergunta
↓
repetir
↓
report_agent gera relatório
↓
study_plan_agent cria plano
Parte 6 — Ordem de implementação
Fase 1

Persistência do item 5

merge seletivo no profile

criar resume_analyses

criar job_analyses

salvar análises completas

atualizar candidate_profiles automaticamente

Fase 2

Uso correto de IA

padronizar JSON

validar schemas

salvar metadados IA

Fase 3

Entrevista com LLM

separar prompts

pipeline de entrevista

avaliação estruturada

Fase 4

Multiagente MVP

candidate_agent

job_agent

match_agent

interviewer_agent

evaluator_agent

report_agent

interview_orchestrator

Fase 5

Multiagente avançado

coach_agent

study_plan_agent

Resultado esperado

O sistema final deve ser capaz de:

simular entrevistas por vídeo com IA

analisar currículo e vaga

adaptar perguntas em tempo real

avaliar respostas

gerar feedback detalhado

criar plano de estudo personalizado