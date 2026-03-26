# Dev Interview AI (Frontend + FastAPI + Firebase)
[![CI](https://github.com/cleberfarias/Dev-Interview-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/cleberfarias/Dev-Interview-AI/actions/workflows/ci.yml)
[![Deploy](https://github.com/cleberfarias/Dev-Interview-AI/actions/workflows/deploy.yml/badge.svg)](https://github.com/cleberfarias/Dev-Interview-AI/actions/workflows/deploy.yml)


Este projeto foi ajustado para um fluxo real de producao:

- Frontend (Vite + React) usando Firebase Auth
- Backend (FastAPI) para chamadas de IA, orquestracao da entrevista e telemetria
- Banco: Firebase Firestore (usuarios, creditos, historico e metadata dos chunks)
- Storage: Firebase Storage para chunks de audio grandes
- Entrevista oficial via `/interview/*`, com avatar falante, lipsync e live coach
- Dois modos de sessao: `candidate_coaching_mode` e `hiring_assessment_mode`
- Relatorio final com score tecnico, comunicacao, sinais comportamentais e culture fit
- Politica de uso/creditos centralizada em `backend/app/services/usage_policy_service.py`

---

## 1) Configurar Firebase

1. Crie um projeto no Firebase
2. Ative Authentication (Google + Email/Password)
3. Crie o Firestore Database
4. Ative Firebase Storage
5. Registre o app Web em Project settings -> General -> Your apps
6. Se for usar Android/Capacitor, registre tambem o app Android e baixe `google-services.json`
   - Salve em `frontend/android/app/google-services.json`
7. Para monitoramento:
   - Web: habilite Analytics/Performance Monitoring
   - Android: habilite Crashlytics e Performance Monitoring
8. Gere uma Service Account (para o backend):
   - Project settings -> Service accounts -> Generate new private key
   - Salve como backend/service-account.json (nao commitar)

---

## 2) Rodar o Backend (FastAPI)

```bash
cd backend
cp .env.example .env
# configure FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
# configure pelo menos um provider de IA: OPENAI_API_KEY, GEMINI_API_KEY ou GROQ_API_KEY
# opcional para avatar com voz natural: AVATAR_TTS_PROVIDER=elevenlabs + ELEVENLABS_API_KEY
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
./run.sh
```

Backend: http://localhost:8000

---

## 3) Rodar o Frontend (Vite)

```bash
cp .env.example .env.local
# preencha VITE_FIREBASE_* , VITE_FIREBASE_MEASUREMENT_ID
# em dev local use VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev
```

Frontend: http://localhost:5000

Variaveis uteis do frontend:

- `VITE_ENABLE_FIREBASE_MONITORING_IN_DEV=true` para testar Performance Monitoring localmente
- `VITE_CLIENT_TELEMETRY_ENABLED=true` para enviar erros do navegador ao backend
- `VITE_INTERVIEW_FIXED_MINUTES=10`
- `VITE_INTERVIEW_FIXED_QUESTION_COUNT=5`

---

## 4) Fluxo Atual da Sessao

- A sessao oficial roda em `/interview/context`, `/interview/start`, `/interview/turn` e `/interview/finalize`
- O entrevistador chama o candidato pelo nome e fala a pergunta com avatar + TTS
- A sessao atual usa limite fixo de `10 minutos` e `5 perguntas` por entrevista
- O produto agora separa `formato da entrevista` de `dificuldade tecnica`
  - `Nivel 1 | Guiado`: enunciado visivel para leitura durante a resposta
  - `Nivel 2 | Padrao`: equilibrio entre apoio visual e fluidez da conversa
  - `Nivel 3 | Simulacao real`: menos apoio visual durante a pergunta, privilegiando a conducao por voz
- A dificuldade tecnica da proxima pergunta e derivada principalmente da senioridade (`intern/junior -> 1`, `mid -> 2`, `senior/staff -> 3`)
- O audio do candidato pode ser enviado por resposta completa ou por chunks incrementais
- O live coach processa STT/sinais de fala em tempo real e pode devolver insight parcial
- Em `candidate_coaching_mode`, a UI mostra ajuda parcial e feedback orientado a desenvolvimento
- Em `hiring_assessment_mode`, o fluxo fica mais silencioso e orientado a coleta de evidencia
- O relatorio final agrega:
  - `scoresSummary` e `criteriaSummary`
  - `communicationScore`
  - `communicationSignals` e `behavioralSpeechSignals`
  - `behaviorProfile` com `discReadiness`
  - `cultureFitSignals`
  - `jobMatch` e `plan7Days`

---

## 5) Endpoints Principais

### Perfil, curriculo e vaga

- GET /me -> retorna perfil (cria automaticamente no primeiro login)
- GET /auth/me -> alias autenticado de perfil
- GET /profile/candidate -> perfil consolidado do candidato
- PUT /profile/candidate -> atualiza perfil consolidado
- GET /profile/candidate/audit -> historico paginado de traces de analise
- GET /profile/candidate/resume-analyses -> historico paginado de analises completas de curriculo
- GET /profile/candidate/job-analyses -> historico paginado de analises completas de vaga
- POST /resume/analyze -> extrai e analisa curriculo
- POST /jobs/analyze -> analisa descricao de vaga

### Sessao e entrevista

- POST /sessions/start -> cria sessao e retorna { sessionId, plan, credits }
- POST /sessions/{id}/plan/generate -> gera plano e consome 1 credito
- GET /sessions/{id}/analysis-trace -> retorna snapshot de traces capturado ao iniciar a sessao
- POST /sessions/{id}/finish -> salva relatorio e historico
- DELETE /sessions/{id} -> remove sessao/historico associado
- POST /interview/context -> gera contexto multiagente (candidate/job/match)
- POST /interview/start -> inicia a entrevista oficial e pode retornar pergunta/avatar iniciais
- POST /interview/turn -> processa turno oficial (audio ou transcript + avaliacao + coach + proxima pergunta)
- POST /interview/finalize -> gera relatorio final + plano de estudo
- POST /orchestrator/interview/* -> legado compativel (deprecated)

### Audio, avatar e coaching em tempo real

- POST /audio/chunk -> upload multipart de chunk com idempotencia por `chunkId`
- POST /live-coach/process -> processa chunk de audio para coaching em tempo real (HTTP)
- WS /live-coach/ws -> canal de baixa latencia para live coach em streaming
- POST /avatar/respond -> gera audio + lipsync do avatar para a fala do entrevistador
- POST /ai/tts -> TTS generico/legado da aplicacao
- POST /ai/name-extract -> extrai nome a partir do audio

### Relatorio, utilitarios e observabilidade

- POST /reports/final -> gera relatorio final direto
- POST /telemetry/client-error -> recebe erros do frontend para Cloud Logging
- POST /ai/evaluate-audio, /ai/evaluate-text, /ai/next-question, /ai/final-report -> utilitarios/legado
- POST /credits/dev-add?amount=3 -> DEV ONLY (habilite apenas em dev com ALLOW_DEV_CREDITS=true)

---

## MCP (Model Context Protocol)

- MCP server (Streamable HTTP) em /mcp
- Tools: ping, get_user_profile, get_recent_interviews, get_rubric
- Auth via Firebase ID token (Authorization: Bearer <id_token>)
- Tools com `uid` exigem que o `uid` seja o mesmo do token
- MCP client interno usa `MCP_SERVER_URL` (ex.: http://127.0.0.1:8000/mcp ou Cloud Run: http://127.0.0.1:8080/mcp)
- Timeout HTTP: `MCP_HTTP_TIMEOUT` (default 5s)
- Contexto de rubrica na avaliacao: MCP_CONTEXT_ENABLED=true (soft-fail se MCP indisponivel)

---

## Limites e teste gratuito

Sessao atual:

- Limite padrao: `10 minutos`
- Quantidade padrao: `5 perguntas`
- O frontend e o backend normalizam a duracao para esse formato fixo

Overrides atuais:

- Backend: `INTERVIEW_FIXED_MINUTES`, `INTERVIEW_FIXED_QUESTION_COUNT`
- Frontend: `VITE_INTERVIEW_FIXED_MINUTES`, `VITE_INTERVIEW_FIXED_QUESTION_COUNT`
- Creditos: `FREE_TRIAL_CREDITS`, `DEFAULT_CREDITS`

Observacao:

- Os envs antigos de min/max ainda existem em alguns arquivos de configuracao, mas o fluxo atual da entrevista esta fixado em `5 perguntas / 10 minutos` por padrao.

---

## Testes

Backend:
```bash
python -m pytest backend/tests
```

Frontend:
```bash
cd frontend
npm test
npm run build
```

Android (opcional):
```bash
cd frontend
npm run build:android
```

Android release bundle:
```bash
cd frontend/android
./gradlew bundleRelease
```

Versao Android atual:
- `versionName`: `1.0.2`
- `versionCode`: `20260326`

---

## Deploy (visao geral)

- Frontend web: Firebase Hosting
- Backend API: Cloud Run
- Android app: Capacitor/Gradle
- Observabilidade:
  - Web: Firebase Performance Monitoring
  - Android: Firebase Crashlytics + Performance Monitoring
  - Backend: Cloud Logging estruturado

---

## Observacoes importantes

- Nenhuma API Key fica no frontend. Todas as chamadas de IA ficam no backend.
- O avatar usa `/avatar/respond` e prefere ElevenLabs quando `AVATAR_TTS_PROVIDER=elevenlabs` e `ELEVENLABS_API_KEY` estao configurados.
- `/ai/tts` continua como TTS generico/legado e pode usar `TTS_PROVIDER`.
- O audio por chunk usa metadata no Firestore e, quando o payload fica grande demais, faz spillover para Firebase Storage.
- O frontend evita avaliar silencio: se nao houver resposta significativa, a entrevista entra no fluxo de `no_response`.
- Em `hiring_assessment_mode`, o live coach nao mostra coaching parcial ao candidato.
- Em `candidate_coaching_mode`, o live coach pode mostrar transcricao parcial e insight leve durante a resposta.
- `behaviorProfile`, `discReadiness` e `cultureFitSignals` sao sinais de apoio a decisao, nao diagnostico psicologico.
- Pagamento real de creditos: ideal implementar Stripe/Mercado Pago + webhook substituindo /credits/dev-add.
- Em producao, mantenha ALLOW_DEV_CREDITS=false.
- Para Android, veja tambem `docs/PLAY_STORE_ANDROID.md`.

---

## Documentacao de correcoes

Veja o plano tecnico em: docs/PLANO_CORRECOES.md

## Documentacao do Projeto

- Visao de arquitetura: `docs/PROJECT_ARCHITECTURE.md`
- Stack tecnica: `docs/TECH_STACK.md`
- Observabilidade: `docs/OBSERVABILITY.md`
- Publicacao Android: `docs/PLAY_STORE_ANDROID.md`

## Observabilidade

- Firebase Performance Monitoring no frontend web
- Firebase Crashlytics + Performance Monitoring no app Android (Capacitor)
- Cloud Logging estruturado no backend/Cloud Run

Guia de ativacao: `docs/OBSERVABILITY.md`


## Deploy (Firebase Hosting + Cloud Run)

### 1) Frontend (Firebase Hosting)

```bash
npm install
npm run build
npm i -g firebase-tools
firebase login
firebase use --add  # selecione seu projeto
firebase deploy --only hosting
```

- O firebase.json ja esta configurado como SPA e com cache correto.
- Em producao use VITE_API_BASE_URL=/api (rewrite para o Cloud Run).

### 2) Backend (Cloud Run)

Na pasta backend/:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/dev-interview-api
gcloud run deploy dev-interview-api \
  --image gcr.io/PROJECT_ID/dev-interview-api \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=... \
  --set-env-vars FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

Dica: voce pode usar FIREBASE_SERVICE_ACCOUNT_PATH localmente e FIREBASE_SERVICE_ACCOUNT_JSON no Cloud Run.

### 3) CORS

Se voce nao usar o rewrite /api do Hosting, defina no backend:

CORS_ORIGINS=http://localhost:5000,https://YOUR_PROJECT.web.app,https://YOUR_PROJECT.firebaseapp.com
