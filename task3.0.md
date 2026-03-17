TASK — Evolução Arquitetural do Dev Interview AI
Objetivo

Elevar o Dev Interview AI para nível de plataforma escalável de entrevistas com IA, implementando três pilares arquiteturais:

Streaming real da entrevista

Memória estruturada por candidato

Observabilidade completa da IA

Essas melhorias visam:

reduzir latência percebida

melhorar adaptação das entrevistas

facilitar debugging e otimização

permitir evolução segura do sistema

Parte 1 — Observabilidade da IA
Objetivo

Criar rastreabilidade completa de todas interações com IA.

Cada chamada de agente deve registrar:

request_id

usuário

sessão

agent

modelo

latência

custo estimado

versão do prompt

status

Tarefa 1.1 — Criar modelo de log de IA

Criar coleção:

ai_execution_logs

Estrutura:

{
  "requestId": "uuid",
  "userId": "uid",
  "sessionId": "session",
  "agent": "interviewer_agent",
  "model": "gpt-4o-mini",
  "promptVersion": "interview_v3",
  "latencyMs": 1450,
  "estimatedCost": 0.0021,
  "status": "success",
  "createdAt": "timestamp"
}
Tarefa 1.2 — Instrumentar router de IA

Arquivo:

backend/app/ai/router.py

Adicionar middleware de log.

Antes da chamada:

start_time = time.time()

Depois:

latency = time.time() - start_time

Persistir log.

Tarefa 1.3 — Adicionar request_id global

Arquivo:

backend/app/main.py

Criar middleware:

request_id = uuid4()

Adicionar em:

logs

contexto da sessão

chamadas de agent

Critérios de aceite

toda chamada de agent gera log

logs possuem latência

logs possuem modelo

logs possuem custo estimado

Parte 2 — Memória estruturada do candidato
Objetivo

Criar memória de evolução do candidato.

Essa memória deve armazenar:

padrões de erro

evolução por skill

histórico de entrevistas

pontos fortes

gaps recorrentes

Tarefa 2.1 — Criar coleção candidate_memory

Estrutura:

{
  "userId": "uid",
  "skillProgress": {
    "react": {
      "scoreHistory": [6,7,8],
      "average": 7,
      "trend": "improving"
    }
  },
  "recurringGaps": [
    "testing",
    "system design"
  ],
  "strongSkills": [
    "javascript",
    "react"
  ],
  "communicationScore": 7.5,
  "lastUpdated": "timestamp"
}
Tarefa 2.2 — Atualizar memória após relatório

Arquivo:

backend/app/services/report_service.py

Após geração do relatório:

atualizar skillProgress

recalcular average

registrar gaps recorrentes

Tarefa 2.3 — Injetar memória no contexto da entrevista

Arquivo:

backend/app/services/interview_orchestrator.py

Antes de iniciar entrevista:

candidate_memory = memory_repository.load(user_id)

Adicionar ao contexto do agent:

context["candidate_memory"] = candidate_memory
Critérios de aceite

histórico de skill é acumulado

agentes recebem memória no contexto

gaps recorrentes são detectados

Parte 3 — Streaming da entrevista
Objetivo

Reduzir latência percebida durante a entrevista.

Transformar fluxo de resposta em pipeline quase contínuo.

Fluxo atual
audio completo
→ STT
→ LLM
→ resposta
Fluxo desejado
audio chunk
→ transcrição incremental
→ avaliação rápida
→ resposta quase imediata
Tarefa 3.1 — Criar pipeline de chunks de áudio

Arquivo:

backend/app/live_coach_service.py

Adicionar suporte a:

audio_chunks

Cada chunk deve conter:

{
  "chunkIndex": 3,
  "audio": "...",
  "timestamp": "..."
}
Tarefa 3.2 — Atualizar WebSocket

Arquivo:

routes_live_coach.py

Permitir eventos:

audio_chunk
partial_transcription
coach_hint
Tarefa 3.3 — Atualizar frontend

Arquivo:

frontend/src/features/interview

Estados necessários:

listening
processing
ai_speaking
candidate_speaking
Critérios de aceite

IA responde mais rápido

feedback parcial aparece

WebSocket não bloqueia UI

Parte 4 — Telemetria da entrevista

Criar métricas de performance da sessão.

Coleção:

interview_metrics

Exemplo:

{
  "sessionId": "session",
  "averageLatency": 1.7,
  "totalCost": 0.03,
  "questionsAsked": 6,
  "durationSeconds": 720
}
Parte 5 — Métricas de produto

Adicionar métricas:

tempo médio de resposta

custo médio por entrevista

taxa de conclusão

skill improvement rate

Ordem de implementação
Semana 1

Observabilidade da IA

router logging

request_id

logs de latência

Semana 2

Memória estruturada

candidate_memory

atualização pós relatório

contexto no orchestrator

Semana 3

Streaming da entrevista

pipeline de áudio

websocket streaming

UI states

Resultado esperado

O Dev Interview AI passa a ter:

entrevistas mais naturais

memória evolutiva do candidato

rastreabilidade completa

base para otimização de custo

melhor experiência em tempo real

Impacto esperado
melhoria	impacto
observabilidade	debugging + otimização
memória	personalização
streaming	experiência do usuário