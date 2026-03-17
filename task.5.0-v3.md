TASK — Audio Interview Engine V3 + B2B Hiring Signals
Objetivo

Evoluir o Audio Interview Engine para uma camada inteligente de análise de resposta, capaz de gerar sinais úteis tanto para:

B2C: coaching do candidato

B2B: apoio ao RH e recrutadores

A V3 deve adicionar:

feedback parcial em tempo real

detecção de hesitação

análise de ritmo e fluidez de fala

sinais de comunicação profissional

base para score comportamental e de aderência

Contexto

A V1 cobre:

captura de áudio

chunking

upload robusto

retry

A V2 cobre:

detecção de silêncio

auto-stop

transcrição incremental

métricas básicas de resposta

A V3 deve transformar o subsistema de áudio em uma camada de inteligência de comunicação, útil para entrevista simulada e avaliação de candidatos.

Objetivos principais

Detectar sinais de hesitação e insegurança

Medir ritmo de fala e fluidez

Produzir feedback parcial em tempo real

Gerar sinais que alimentem:

coaching

score de comunicação

score comportamental

futuras análises DISC e culture fit

Parte 1 — Sinais de fala e hesitação
Objetivo

Extrair métricas de comunicação a partir da resposta falada.

Tarefa 1.1 — Criar speechMetricsAnalyzer.ts

Arquivo:

frontend/src/features/audio/speechMetricsAnalyzer.ts
Responsabilidades

receber chunks + transcrição parcial

estimar:

tempo até começar a falar

duração total da resposta

número de pausas

pausas longas

densidade de fillers

ritmo estimado de fala

Interface sugerida
type SpeechMetrics = {
  answerId: string
  timeToFirstSpeechMs: number
  totalDurationMs: number
  silenceDurationMs: number
  pauseCount: number
  longPauseCount: number
  fillerCount: number
  wordsPerMinute?: number
  interruptionRecoveryCount?: number
}

export function analyzeSpeechMetrics(params: {
  answerId: string
  transcript: string
  durationMs: number
  silenceMs: number
  pauseCount: number
  longPauseCount: number
}): SpeechMetrics
Tarefa 1.2 — Detectar fillers e hesitação textual
Objetivo

Identificar sinais como:

“é...”

“ahn...”

“tipo...”

“hum...”

“acho que...”

“talvez...”

Regra

Começar com heurística simples por idioma:

português

inglês

Exemplo de saída
{
  "fillerCount": 6,
  "hesitationMarkers": [
    "ahn",
    "tipo",
    "acho que"
  ]
}
Tarefa 1.3 — Classificar fluidez da resposta
Objetivo

Gerar um score inicial de fluidez com base em:

pausas

fillers

tempo para começar

continuidade da resposta

Saída sugerida
{
  "fluencyScore": 7.1,
  "fluencyLevel": "moderate"
}
Parte 2 — Feedback parcial em tempo real
Objetivo

Gerar sinais leves de coaching durante a resposta ou logo após os primeiros chunks.

Tarefa 2.1 — Criar partialFeedbackService no backend

Arquivo:

backend/app/services/partial_feedback_service.py
Responsabilidades

receber transcrição parcial e métricas iniciais

produzir feedback curto e seguro

evitar feedback excessivo ou intrusivo

Exemplos de sinais

resposta ainda vaga

faltam exemplos práticos

resposta muito curta

muito tempo sem conteúdo técnico

fala hesitante

Exemplo de saída
{
  "type": "partial_feedback",
  "severity": "low",
  "message": "Tente trazer um exemplo prático da sua experiência."
}
Tarefa 2.2 — Definir regras de frequência
Regra obrigatória

Não gerar feedback a cada chunk.

Política inicial sugerida

no máximo 1 insight parcial por resposta

só após chunk mínimo viável

não interromper o candidato visualmente de forma agressiva

Tarefa 2.3 — Exibir insight parcial opcional na UI

Arquivo impactado:

frontend/src/features/interview/components/InterviewRoom.tsx
Regras

exibição discreta

pode ficar desativada por padrão

útil para modo treino, não para modo avaliação B2B

Parte 3 — Score de comunicação
Objetivo

Transformar sinais de fala em score estruturado para coaching e RH.

Tarefa 3.1 — Criar CommunicationScore schema

Arquivo:

backend/app/schemas/report.py

Adicionar estrutura como:

class CommunicationScore(BaseModel):
    clarity: float
    fluency: float
    confidence: float
    conciseness: float
    structure: float
    overall: float
Tarefa 3.2 — Alimentar communication score no report_service

Arquivo:

backend/app/services/report_service.py
Objetivo

Usar:

transcrição

métricas de fala

avaliação do LLM

sinais de hesitação

para compor um score de comunicação mais robusto.

Resultado esperado

O relatório final deve ter:

score técnico

score de comunicação

pontos fortes de comunicação

pontos de melhoria

Parte 4 — Base para B2B RH
Objetivo

Preparar os dados de áudio/comunicação para uso em avaliação de candidatos por empresas.

Tarefa 4.1 — Criar HiringCommunicationSignals

Arquivo sugerido:

backend/app/schemas/analysis.py

Estrutura:

class HiringCommunicationSignals(BaseModel):
    responseClarity: float
    responseConfidence: float
    hesitationLevel: float
    verbalObjectivity: float
    professionalCommunication: float
Tarefa 4.2 — Persistir sinais para uso futuro em scorecard

Criar ou adaptar persistência para que cada entrevista possa armazenar sinais como:

{
  "communicationSignals": {
    "responseClarity": 8.1,
    "responseConfidence": 6.8,
    "hesitationLevel": 0.42,
    "verbalObjectivity": 7.3,
    "professionalCommunication": 7.9
  }
}
Objetivo

Esses dados serão usados futuramente na fase B2B para:

scorecard do candidato

apoio ao RH

ranking de candidatos

Tarefa 4.3 — Separar modo coaching de modo hiring
Regra obrigatória

O sistema precisa prever dois modos:

candidate_coaching_mode

feedback parcial

sugestões de melhoria

apoio ao candidato

hiring_assessment_mode

sem interferência durante a resposta

coleta silenciosa de sinais

foco em avaliação e scorecard

Objetivo

Evitar misturar experiência de treino com experiência de avaliação.

Parte 5 — Preparação para DISC e perfil comportamental
Objetivo

Ainda não calcular DISC formalmente, mas preparar os sinais que alimentarão o futuro behavior_agent.

Tarefa 5.1 — Estruturar BehavioralSpeechSignals

Arquivo sugerido:

backend/app/schemas/analysis.py

Estrutura inicial:

class BehavioralSpeechSignals(BaseModel):
    assertiveness: float
    cautionLevel: float
    spontaneity: float
    consistency: float
    emotionalControl: float
Importante

Esses sinais não devem ser apresentados como diagnóstico formal de personalidade.
Devem ser tratados como indicadores comportamentais observados na entrevista.

Tarefa 5.2 — Alimentar esses sinais com heurísticas iniciais

Exemplos:

muita hesitação → menor assertividade

fala muito acelerada → maior impulsividade possível

resposta bem estruturada → maior consistência

pausas excessivas + baixa objetividade → cautela/insegurança

Regra

Nesta fase, isso deve ficar como:

sinal interno

não resultado final ao usuário

Parte 6 — Preparação para culture fit e job fit
Objetivo

Permitir que o futuro culture_fit_agent e match_agent usem também dados de comunicação, não só texto.

Tarefa 6.1 — Adicionar communication context ao orchestrator

Arquivo:

backend/app/services/interview_orchestrator.py
Objetivo

Ao final da resposta, o contexto enviado aos agents deve poder incluir:

context["speech_metrics"] = ...
context["communication_signals"] = ...
context["behavioral_speech_signals"] = ...

Isso permitirá decisões melhores para:

relatório final

aderência à vaga

aderência à cultura

Parte 7 — Observabilidade dessa camada
Objetivo

Medir se essa inteligência está gerando valor ou ruído.

Tarefa 7.1 — Criar logs de communication analysis

Criar registros em algo como:

ai_execution_logs

ou coleção separada:

communication_analysis_logs

Com campos:

answerId

sessionId

metricsGenerated

partialFeedbackTriggered

latencyMs

mode (candidate_coaching ou hiring_assessment)

Parte 8 — UX e segurança de produto
Regras obrigatórias
Regra 1

Não apresentar “diagnóstico psicológico” ao usuário ou à empresa.

Regra 2

Apresentar sinais como:

comunicação

objetividade

confiança verbal

clareza

consistência

Regra 3

Qualquer futuro mapeamento DISC deve ser tratado como inferência limitada e não como laudo.

Regra 4

No modo B2B, deixar claro que a IA fornece apoio à decisão, não decisão final automática.

Parte 9 — Ordem de implementação
Fase 1 — métricas de fala

criar speechMetricsAnalyzer.ts

detectar fillers e hesitação

calcular fluidez inicial

Fase 2 — feedback parcial

criar partial_feedback_service.py

definir regra de frequência

exibir insight parcial opcional na UI

Fase 3 — score de comunicação

criar CommunicationScore

integrar ao report_service.py

Fase 4 — sinais para B2B

criar HiringCommunicationSignals

criar BehavioralSpeechSignals

persistir sinais por entrevista

Fase 5 — integração com orquestrador

injetar métricas de fala no contexto dos agents

Critérios finais de aceite
O sistema deve:

detectar hesitação e fillers

medir fluidez e confiança verbal

gerar score de comunicação

produzir feedback parcial opcional

armazenar sinais úteis para futuro B2B

O sistema não deve:

fingir diagnóstico clínico ou psicológico

poluir a entrevista com feedback excessivo

misturar modo treino com modo avaliação corporativa

Resultado esperado

Ao final da V3, o Dev Interview AI passa a ter:

análise de comunicação mais rica

coaching mais inteligente

base real para RH

preparação para DISC, culture fit e job fit

diferenciação forte no mercado