TASK — Audio Interview Engine para Dev Interview AI
Objetivo

Implementar um subsistema de captura e envio de áudio robusto para o Dev Interview AI, inspirado no mecanismo analisado de Web Components, mas adaptado à arquitetura atual do projeto.

O novo subsistema deve suportar:

captura confiável de microfone

seleção de dispositivo de áudio

gravação por chunks

pausa, retomada e finalização

retry de upload

fallback local com IndexedDB

integração com entrevista simulada

base para live coach em tempo real

Contexto

O projeto atual do Dev Interview AI precisa de um mecanismo de áudio mais robusto para entrevistas por vídeo com IA.

Foi analisado um mecanismo externo que usa:

getUserMedia

MediaRecorder

AudioContext

chunking automático

persistência local com IndexedDB

retry de envio

A proposta desta task é adaptar os conceitos úteis desse mecanismo ao Dev Interview AI, sem importar sua arquitetura acoplada de Web Components/Stencil.

Objetivos desta implementação

Melhorar a confiabilidade da gravação de respostas do candidato

Reduzir risco de perda de resposta em caso de falha de rede

Criar base para streaming e live coach

Permitir evolução futura para captura incremental e análise em tempo real

Parte 1 — Arquitetura alvo
Frontend

Criar módulo:

frontend/src/features/audio/

Arquivos sugeridos:

useAudioCapture.ts
chunkRecorder.ts
chunkUploadService.ts
audioRetryStore.ts
microphoneService.ts
types.ts

Componentes sugeridos:

AudioPermissionCard.tsx
MicrophoneSelector.tsx
RecordingStatusBadge.tsx
Backend

Integrar com módulos existentes:

backend/app/api/routes_live_coach.py
backend/app/services/live_coach_service.py

Se necessário, criar:

backend/app/api/routes_audio.py
backend/app/services/audio_chunk_service.py
backend/app/repositories/audio_chunk_repository.py
Parte 2 — Captura de microfone
Tarefa 2.1 — Criar serviço de microfone

Arquivo:

frontend/src/features/audio/microphoneService.ts

Responsabilidades:

solicitar permissão de microfone

listar dispositivos disponíveis

selecionar microfone padrão

retornar erros de permissão de forma amigável

Interface esperada
export async function requestMicrophonePermission(): Promise<MediaStream>
export async function listAudioInputDevices(): Promise<MediaDeviceInfo[]>
export async function getDefaultAudioInputId(): Promise<string | null>
Tarefa 2.2 — Criar hook de captura de áudio

Arquivo:

frontend/src/features/audio/useAudioCapture.ts

Responsabilidades:

iniciar stream do microfone

pausar captura

retomar captura

finalizar captura

expor estados de gravação

Estados esperados
"idle"
"requesting_permission"
"ready"
"recording"
"paused"
"stopping"
"error"
Critérios de aceite

usuário consegue permitir microfone

usuário consegue trocar o microfone

estado da UI reflete com clareza a situação atual

Parte 3 — Gravação por chunks
Tarefa 3.1 — Criar chunkRecorder

Arquivo:

frontend/src/features/audio/chunkRecorder.ts

Responsabilidades:

usar MediaRecorder

gravar áudio do microfone

dividir a gravação em chunks

emitir chunks em intervalo configurável

suportar pausa e retomada

Regras

chunk padrão inicial: 3 a 5 segundos

permitir ajuste posterior

manter compatibilidade com gravação por resposta

Interface sugerida
type ChunkCallback = (chunk: Blob, metadata: AudioChunkMeta) => void

class ChunkRecorder {
  start(): Promise<void>
  pause(): void
  resume(): void
  stop(): Promise<void>
  onChunk(callback: ChunkCallback): void
}
Metadados por chunk
type AudioChunkMeta = {
  chunkIndex: number
  startedAt: string
  endedAt: string
  durationMs: number
  sessionId?: string
  questionId?: string
}
Tarefa 3.2 — Integrar gravação com a entrevista

Arquivo impactado:

frontend/src/features/interview/components/InterviewRoom.tsx

Responsabilidades:

iniciar gravação ao começar resposta

pausar quando necessário

finalizar quando o candidato terminar

enviar chunks durante ou após a resposta

Critério de aceite

gravação fica integrada ao turno da entrevista

o sistema sabe quais chunks pertencem a qual sessão/pergunta

Parte 4 — Upload de chunks
Tarefa 4.1 — Criar chunkUploadService

Arquivo:

frontend/src/features/audio/chunkUploadService.ts

Responsabilidades:

enviar chunks para o backend

anexar metadados da sessão

sinalizar sucesso/falha

permitir reenvio

Interface sugerida
export async function uploadAudioChunk(params: {
  blob: Blob
  metadata: AudioChunkMeta
  sessionId: string
  userId?: string
}): Promise<void>
Tarefa 4.2 — Criar endpoint de upload no backend

Se necessário, criar rota dedicada:

POST /audio/chunk

Ou integrar ao live coach.

Payload esperado

arquivo de áudio

sessionId

questionId

chunkIndex

startedAt

endedAt

durationMs

Backend deve:

validar payload

persistir chunk ou processar imediatamente

retornar confirmação de recebimento

Parte 5 — Retry e persistência local
Tarefa 5.1 — Criar audioRetryStore com IndexedDB

Arquivo:

frontend/src/features/audio/audioRetryStore.ts

Responsabilidades:

salvar chunks cujo upload falhou

listar pendências

remover chunks reenviados com sucesso

permitir retry posterior

Sugestão

Usar:

IndexedDB

Dexie, se quiser simplicidade

Estrutura mínima
type PendingAudioChunk = {
  id: string
  sessionId: string
  questionId?: string
  chunkIndex: number
  blob: Blob
  metadata: AudioChunkMeta
  createdAt: string
  attempts: number
}
Tarefa 5.2 — Criar retry automático

Responsabilidades:

ao detectar conexão restabelecida

ou ao reabrir o app

reenviar chunks pendentes

Critérios de aceite

falha de rede não apaga resposta do candidato

chunks pendentes podem ser reenviados depois

sistema evita duplicidade no backend

Parte 6 — Integração com live coach
Objetivo

Preparar o mesmo mecanismo para futuro processamento incremental.

Tarefa 6.1 — Adaptar live_coach_service para receber chunks menores

Arquivo:

backend/app/services/live_coach_service.py
Responsabilidades futuras

receber chunk

transcrever chunk

acumular contexto parcial

gerar sugestão incremental

Nesta fase

Não precisa implementar o streaming completo, mas o contrato deve ficar pronto.

Tarefa 6.2 — Estruturar contrato de chunk para tempo real

Criar ou adaptar schema:

backend/app/schemas/live_coach.py

Adicionar algo como:

class AudioChunkPayload(BaseModel):
    sessionId: str
    chunkIndex: int
    startedAt: str
    endedAt: str
    durationMs: int
Parte 7 — UI e experiência
Tarefa 7.1 — Criar componentes visuais de áudio

Criar componentes:

AudioPermissionCard.tsx
MicrophoneSelector.tsx
RecordingStatusBadge.tsx
Devem mostrar

permissão do microfone

dispositivo selecionado

estado da gravação

erro de captura

indicador de envio

Tarefa 7.2 — Estados da interface na entrevista

Adicionar estados visuais em InterviewRoom:

microphone_ready
recording
paused
uploading
retry_pending
error
Critério de aceite

O candidato sempre sabe:

se está sendo gravado

se a gravação pausou

se o áudio está subindo

se houve falha

Parte 8 — Regras arquiteturais
Regra 1

Não portar o Recorder.js inteiro do projeto analisado.

Regra 2

Reaproveitar apenas os conceitos:

captura robusta

chunking

retry

IndexedDB

Regra 3

Separar responsabilidades:

captura

chunking

upload

retry

integração com entrevista

Regra 4

Não acoplar áudio ao estado global da aplicação inteira.

Regra 5

O módulo de áudio deve ser reutilizável tanto na entrevista quanto no live coach.

Parte 9 — Melhorias futuras já previstas

Essas melhorias não precisam entrar agora, mas a arquitetura deve permitir.

Futuro 1 — Detecção de silêncio

encerrar automaticamente resposta

ou marcar pausas longas

Futuro 2 — Mixagem de múltiplas fontes

microfone + áudio remoto

útil para assistente em entrevista real

Futuro 3 — Streaming incremental

enviar chunk enquanto o usuário fala

transcrição parcial

feedback em tempo real

Futuro 4 — Métricas de áudio

duração média da resposta

tempo de silêncio

tempo total gravado

taxa de falhas de upload

Ordem de implementação
Fase 1 — base de captura

criar microphoneService.ts

criar useAudioCapture.ts

criar MicrophoneSelector.tsx

Fase 2 — gravação em chunks

criar chunkRecorder.ts

integrar com InterviewRoom.tsx

Fase 3 — upload robusto

criar chunkUploadService.ts

criar/adaptar endpoint backend para chunks

Fase 4 — retry

criar audioRetryStore.ts

implementar retry automático

Fase 5 — integração futura com live coach

preparar schemas e contrato incremental

Critérios finais de aceite
O sistema deve permitir:

capturar áudio do microfone com estabilidade

gravar respostas em chunks

enviar cada chunk ao backend

salvar localmente em caso de falha

reenviar depois sem perder resposta

integrar o áudio ao fluxo de entrevista

O sistema não deve:

depender de store global acoplado

concentrar tudo em um único arquivo

misturar lógica de entrevista com lógica de captura

Resultado esperado

Ao final desta task, o Dev Interview AI terá um Audio Interview Engine robusto, capaz de:

melhorar a confiabilidade da entrevista

reduzir perda de respostas

suportar live coach no futuro

servir de base para streaming e processamento incremental