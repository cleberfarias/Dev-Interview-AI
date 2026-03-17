# Project Architecture

## Visao Geral

O Dev Interview AI e uma plataforma de entrevista tecnica assistida por IA com dois modos de operacao:

- `candidate_coaching_mode`: experiencia orientada a desenvolvimento, com live coach e feedback parcial de baixa intrusao.
- `hiring_assessment_mode`: experiencia orientada a avaliacao, com coleta de evidencia e menos intervencao em tempo real.

O produto combina:

- frontend web em React/Vite
- app Android via Capacitor
- backend FastAPI
- autenticacao e dados em Firebase
- processamento de IA via orquestracao multiagente
- avatar falante com TTS e lipsync
- observabilidade com Firebase + Cloud Logging

## Arquitetura em Camadas

### Frontend

Responsabilidades principais:

- autenticacao com Firebase Auth
- configuracao da sessao
- gravacao de audio e upload por chunks
- live coach em HTTP/WS
- renderizacao do avatar
- exibicao do relatorio final

Estrutura principal:

- `frontend/App.tsx`: composicao do app, roteamento por estado e bootstrap da sessao
- `frontend/src/features/auth`: login e entrada do usuario
- `frontend/src/features/onboarding`: configuracao inicial da entrevista
- `frontend/src/features/interview`: lobby, sala e fluxo principal da entrevista
- `frontend/src/features/audio`: captura, chunks, retry e metricas de fala
- `frontend/src/features/avatar`: render do avatar, audio e lipsync
- `frontend/src/features/report`: relatorio final da sessao
- `frontend/src/shared/services/backendApi.ts`: contrato de acesso ao backend
- `frontend/src/lib/firebase.ts`: bootstrap do Firebase web

Padrao usado no frontend:

- componentes de UI para apresentacao
- hooks/composables para logica reutilizavel
- feature folders por dominio

### Backend

Responsabilidades principais:

- autenticacao e autorizacao por Firebase ID token
- lifecycle oficial da entrevista
- avaliacao de respostas
- live coach em tempo real
- gerenciamento de sessao, creditos e relatorios
- avatar/TTS/lipsync
- persistencia no Firestore/Storage
- telemetria e logs estruturados

Estrutura principal:

- `backend/app/main.py`: bootstrap do FastAPI, middlewares, logging e roteamento
- `backend/app/api`: camada HTTP e websocket
- `backend/app/services`: regras de negocio e orquestracao
- `backend/app/agents`: agentes especializados da entrevista
- `backend/app/repositories`: persistencia Firestore/Storage
- `backend/app/schemas`: contratos tipados do dominio
- `backend/app/avatar_engine`: voz, lipsync e payload do avatar
- `backend/app/ai`: roteador de providers, prompts e observabilidade de IA

Padrao usado no backend:

- `routes` recebem requests e validam dependencias
- `services` concentram regra de negocio
- `agents` encapsulam funcoes de IA/orquestracao
- `repositories` isolam persistencia
- `schemas` padronizam contratos entre camadas

## Fluxo Oficial da Entrevista

1. O usuario autentica no Firebase.
2. O frontend chama `/sessions/start`.
3. O frontend monta contexto com `/interview/context`.
4. O frontend inicia a sessao com `/interview/start`.
5. O avatar apresenta a pergunta inicial com `/avatar/respond`.
6. O candidato responde por audio.
7. O frontend:
   - grava audio
   - pode subir `chunks` em `/audio/chunk`
   - pode mandar chunks ao live coach em `/live-coach/process` ou `WS /live-coach/ws`
   - ao final da resposta, envia `/interview/turn`
8. O backend:
   - transcreve/avalia a resposta
   - deriva sinais de comunicacao
   - calcula comportamento e culture fit
   - decide a proxima pergunta
9. O ciclo se repete ate atingir o limite da sessao.
10. O frontend chama `/interview/finalize`.
11. O backend gera relatorio + plano de estudo.
12. O frontend salva o resultado com `/sessions/{id}/finish`.

## Core do Produto

### 1. Orquestracao Multiagente

O core de IA e organizado em agentes especializados:

- `candidate_agent`: resume o perfil tecnico do candidato
- `job_agent`: interpreta a vaga ou o foco da entrevista
- `match_agent`: estima aderencia candidato-vaga
- `interviewer_agent`: decide a proxima pergunta
- `evaluator_agent`: avalia a resposta enviada
- `coach_agent`: produz coaching quando o modo permite
- `behavior_agent`: deriva perfil comportamental observado
- `culture_fit_agent`: deriva sinais de cultura e aderencia contextual
- `report_agent`: gera o relatorio final
- `study_plan_agent`: produz plano de estudo

### 2. Communication Analysis

O produto mede a comunicacao do candidato durante a resposta:

- clareza
- confianca
- hesitacao
- objetividade
- comunicacao profissional
- pausas, silencio, fillers e fluidez

Esses sinais alimentam:

- feedback parcial no live coach
- avaliacao da resposta
- proxima pergunta
- relatorio final

### 3. Behavior e Culture Fit

O sistema gera sinais derivados da entrevista, incluindo:

- `behaviorProfile`
- `discReadiness`
- `cultureFitSignals`

Esses campos sao tratados como apoio a decisao e nao como diagnostico psicologico.

### 4. Avatar Interview Engine

O entrevistador virtual combina:

- texto da proxima pergunta
- TTS
- payload de lipsync
- renderer visual no frontend

Hoje o avatar prefere ElevenLabs quando configurado no backend, sem acoplar isso ao TTS generico da aplicacao.

### 5. Audio Engine

O modulo de audio foi desenhado para resiliencia:

- captura por `MediaRecorder`
- upload multipart por chunk
- idempotencia por `chunkId`
- retry local
- persistencia local de chunks pendentes
- spillover de payload grande para Firebase Storage

## Metodos e Decisoes de Produto

### Modo Coaching

Objetivo:

- ajudar o candidato a melhorar durante e apos a sessao

Comportamento:

- live coach ativo
- transcricao parcial
- insight parcial de baixa intrusao
- linguagem de relatorio mais desenvolvimentista

### Modo Hiring Assessment

Objetivo:

- coletar evidencia mais objetiva para avaliacao

Comportamento:

- menos intervencao durante a resposta
- sem coaching parcial visivel ao candidato
- perguntas orientadas a evidencia
- linguagem de relatorio mais avaliativa

### Limites da Sessao

No fluxo atual, a entrevista usa por padrao:

- `10 minutos`
- `5 perguntas`

Frontend e backend normalizam esses limites por envs fixos.

## Persistencia e Dados

### Firestore

Entidades persistidas no Firestore:

- perfil do usuario
- creditos
- sessoes
- historico de entrevista
- traces de analise
- metadata de audio chunks
- memoria consolidada do candidato
- relatorios finais

### Firebase Storage

Usado para:

- chunks de audio que excedem o limite seguro para armazenamento inline

## Observabilidade

### Frontend

- Firebase Analytics
- Firebase Performance Monitoring
- captura global de erros e envio para `/telemetry/client-error`

### Android

- Firebase Crashlytics
- Firebase Performance Monitoring

### Backend

- JSON logging estruturado para Cloud Logging
- request id por request
- telemetria HTTP basica
- logs de erro e contexto de sessao

## Arquitetura de Deploy

- `Firebase Hosting`: frontend web
- `Cloud Run`: backend FastAPI
- `Firestore`: dados operacionais
- `Firebase Storage`: blobs de audio
- `Capacitor Android`: app mobile

## Arquivos-Chave Para Onboarding

### Frontend

- `frontend/App.tsx`
- `frontend/src/shared/services/backendApi.ts`
- `frontend/src/features/interview/components/InterviewRoomLayout.tsx`
- `frontend/src/features/audio/useAudioCapture.ts`
- `frontend/src/features/avatar/AvatarRenderer.tsx`
- `frontend/src/features/report/components/Report.tsx`

### Backend

- `backend/app/main.py`
- `backend/app/api/routes_orchestrator.py`
- `backend/app/services/interview_orchestrator.py`
- `backend/app/services/interview_core.py`
- `backend/app/services/live_coach_service.py`
- `backend/app/services/report_service.py`
- `backend/app/services/audio_chunk_service.py`

## Limites Atuais da Arquitetura

- o avatar ainda e um talking-head leve, nao um modelo humano full-3D realista
- `Crashlytics` foi preparado para Android, nao para navegador puro
- behavior/culture fit sao sinais heuristico-assistidos, nao assessment psicometrico validado
- existem endpoints legados `/ai/*` e `/orchestrator/interview/*` mantidos por compatibilidade
