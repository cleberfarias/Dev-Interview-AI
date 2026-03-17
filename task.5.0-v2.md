TASK — Audio Interview Engine V2
Objetivo

Evoluir o subsistema de áudio do Dev Interview AI para suportar uma experiência mais inteligente e natural durante a entrevista, com:

detecção de silêncio

finalização automática da resposta

transcrição incremental

preparação para feedback em tempo real

Essa evolução deve melhorar:

usabilidade

fluidez da entrevista

latência percebida

base para live coach avançado

Contexto

A versão 1 do Audio Interview Engine cobre:

captura de microfone

chunking

upload robusto

retry local

integração com entrevista

A versão 2 adiciona inteligência de captura, permitindo identificar quando o candidato terminou de responder sem depender exclusivamente de um clique manual.

Objetivos principais

Detectar silêncio e pausas longas

Encerrar a gravação automaticamente quando apropriado

Transcrever áudio em partes enquanto a resposta acontece

Preparar base para live feedback em tempo real

Parte 1 — Detecção de silêncio
Objetivo

Identificar automaticamente quando o candidato está:

falando

pausando brevemente

em silêncio prolongado

Tarefa 1.1 — Criar silenceDetector.ts

Arquivo:

frontend/src/features/audio/silenceDetector.ts
Responsabilidades

monitorar stream de áudio

calcular volume médio

detectar silêncio contínuo

emitir eventos de transição de estado

Interface sugerida
type SilenceDetectorCallbacks = {
  onSpeechStart?: () => void
  onSpeechEnd?: () => void
  onSilenceThresholdReached?: (durationMs: number) => void
}

class SilenceDetector {
  start(stream: MediaStream, callbacks: SilenceDetectorCallbacks): void
  stop(): void
}
Tarefa 1.2 — Usar Web Audio API para análise
Requisitos

Usar:

AudioContext

AnalyserNode

Regra

Não usar isso para gravar diretamente.
Usar apenas para observar intensidade do áudio.

Métrica inicial sugerida

volume abaixo de limiar por mais de X ms = silêncio

Valores iniciais de referência

limiar de volume: configurável

silêncio curto: 1000ms

silêncio longo: 2500ms a 4000ms

Esses valores devem ser ajustáveis.

Parte 2 — Encerramento automático da resposta
Objetivo

Permitir que a resposta do candidato seja encerrada automaticamente após silêncio prolongado, sem cortar respostas prematuramente.

Tarefa 2.1 — Adicionar política de auto-stop

Arquivo impactado:

frontend/src/features/interview/components/InterviewRoom.tsx
frontend/src/features/audio/useAudioCapture.ts
Regras sugeridas

não encerrar resposta com pausas curtas

só encerrar após:

candidato já ter começado a falar

silêncio contínuo acima do threshold

mostrar aviso visual antes de finalizar

Fluxo esperado
candidato responde
↓
pausa detectada
↓
UI mostra: "Encerrando resposta em 3..."
↓
se continuar silêncio → finalizar
↓
se voltar a falar → cancelar encerramento
Tarefa 2.2 — Criar estado de pending_auto_stop

Adicionar estado de interface:

pending_auto_stop
Critério de aceite

O usuário deve perceber que o sistema está prestes a encerrar a resposta automaticamente.

Parte 3 — Transcrição incremental
Objetivo

Permitir transcrever a resposta em blocos menores enquanto ela acontece, em vez de esperar a resposta inteira.

Tarefa 3.1 — Criar contrato de transcrição parcial

Backend:

backend/app/schemas/live_coach.py

Criar/adaptar schema para suportar:

class PartialTranscriptionPayload(BaseModel):
    sessionId: str
    chunkIndex: int
    text: str
    isFinal: bool = False
    startedAt: str
    endedAt: str
Tarefa 3.2 — Adaptar serviço para transcrição incremental

Arquivo:

backend/app/services/live_coach_service.py
Responsabilidades

receber chunk de áudio

transcrever cada chunk

devolver texto parcial

opcionalmente consolidar contexto acumulado

Resultado esperado

Cada chunk pode gerar:

{
  "chunkIndex": 3,
  "partialText": "Eu usei React em um projeto de dashboard...",
  "isFinal": false
}
Tarefa 3.3 — Exibir transcrição parcial no frontend

Arquivo impactado:

frontend/src/features/interview/components/InterviewRoom.tsx
Objetivo

Mostrar uma área opcional com transcrição em progresso.

Regras

deve ser atualizada por chunk

deve consolidar texto parcial

quando a resposta terminar, virar a transcrição final

Benefícios

aumenta transparência

facilita debugging

prepara terreno para live coach

Parte 4 — Pipeline incremental de áudio
Objetivo

Transformar o fluxo de resposta em pipeline contínuo:

áudio
→ chunks
→ transcrição parcial
→ contexto acumulado
→ finalização
Tarefa 4.1 — Adicionar estado de chunk processing

Frontend deve ter estados adicionais:

recording
transcribing_partial
pending_auto_stop
finalizing_answer
Tarefa 4.2 — Associar chunks à resposta atual

Cada resposta precisa de um identificador lógico.

Adicionar metadado:

answerId: string

aos chunks.

Estrutura sugerida
type AudioChunkMeta = {
  answerId: string
  sessionId: string
  questionId?: string
  chunkIndex: number
  startedAt: string
  endedAt: string
  durationMs: number
}
Parte 5 — Preparação para feedback em tempo real
Objetivo

Ainda não implementar live feedback completo, mas deixar a arquitetura pronta.

Tarefa 5.1 — Criar espaço para heurísticas em tempo real

No backend, preparar possibilidade de análise parcial por chunk, por exemplo:

resposta muito curta

longos silêncios

sem conteúdo técnico detectado

resposta fora do tópico

Nesta fase

Não precisa exibir coaching completo ao vivo.
Apenas preparar contrato interno.

Tarefa 5.2 — Criar evento opcional de insight parcial

Via WebSocket ou polling futuro, permitir algo como:

{
  "type": "partial_insight",
  "message": "Resposta ainda superficial, faltam exemplos práticos."
}
Nesta fase

Esse evento pode ser apenas interno ou desativado por padrão.

Parte 6 — Métricas de áudio
Objetivo

Persistir sinais úteis para melhorar produto e coaching.

Tarefa 6.1 — Registrar métricas por resposta

Criar estrutura para capturar:

duração total da resposta

número de chunks

tempo total de silêncio

número de pausas longas

tempo até começar a falar

Exemplo
{
  "answerId": "a1",
  "durationMs": 43000,
  "silenceMs": 6200,
  "pauseCount": 3,
  "timeToFirstSpeechMs": 1800
}
Tarefa 6.2 — Integrar métricas ao relatório futuro

Essas métricas devem ficar disponíveis para:

feedback de comunicação

análise comportamental

evolução do candidato

Parte 7 — Regras de UX
Regras obrigatórias
Regra 1

Nunca encerrar a resposta automaticamente antes do candidato realmente começar a falar.

Regra 2

Sempre mostrar feedback visual quando auto-stop estiver prestes a acontecer.

Regra 3

Permitir configuração futura para:

auto-stop ligado/desligado

threshold de silêncio

exibição ou não da transcrição parcial

Regra 4

Não esconder erros de microfone ou transcrição.

Parte 8 — Ordem de implementação
Fase 1 — silêncio

criar silenceDetector.ts

integrar ao stream do microfone

emitir eventos de fala/silêncio

Fase 2 — auto-stop

adicionar pending_auto_stop

criar lógica de encerramento automático com contagem visual

permitir cancelamento ao detectar nova fala

Fase 3 — transcrição parcial

adaptar contrato backend para partial transcription

integrar chunks à transcrição incremental

exibir transcrição parcial na UI

Fase 4 — métricas

registrar métricas básicas por resposta

armazenar para uso futuro em relatório e coaching

Critérios finais de aceite
O sistema deve:

detectar silêncio com estabilidade

diferenciar pausa curta de encerramento real

encerrar automaticamente a resposta quando apropriado

mostrar transcrição parcial por chunks

manter arquitetura pronta para feedback em tempo real

O sistema não deve:

cortar respostas prematuramente

depender de lógica acoplada em um único arquivo

misturar captura, heurística e upload sem separação clara

Resultado esperado

Ao final desta task, o Dev Interview AI terá:

uma experiência de resposta mais natural

menor dependência de ação manual para encerrar respostas

base para entrevistas mais fluidas

preparação real para live coach e streaming inteligente