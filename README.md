# Dev Interview AI (Frontend + FastAPI + Firebase)
![CI](https://github.com/cleberfarias/Dev-Interview-AI/actions/workflows/ci.yml/badge.svg)
![Deploy](https://github.com/cleberfarias/Dev-Interview-AI/actions/workflows/deploy.yml/badge.svg)


Este projeto foi ajustado para um fluxo real de producao:

- Frontend (Vite + React) usando Firebase Auth
- Backend (FastAPI) para chamadas de IA e regras de negocio
- Banco: Firebase Firestore (usuarios, creditos e historico)
- Creditos: consumidos no backend ao iniciar uma sessao (/sessions/start)
- Limites: duracao e perguntas ajustadas por plano (free/pro)

---

## 1) Configurar Firebase

1. Crie um projeto no Firebase
2. Ative Authentication (Google + Email/Password)
3. Crie o Firestore Database
4. Gere uma Service Account (para o backend):
   - Project settings -> Service accounts -> Generate new private key
   - Salve como backend/service-account.json (nao commitar)

---

## 2) Rodar o Backend (FastAPI)

```bash
cd backend
cp .env.example .env
# coloque GEMINI_API_KEY/OPENAI_API_KEY e FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
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
# preencha VITE_FIREBASE_* e VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev
```

Frontend: http://localhost:3000

---

## 4) Endpoints principais

- GET /me -> retorna perfil (cria automaticamente no primeiro login)
- POST /sessions/start -> consome 1 credito e retorna { sessionId, plan, credits }
- POST /ai/name-extract -> extrai nome do audio
- POST /ai/evaluate-audio -> avalia resposta + transcricao (JSON)
- POST /ai/final-report -> gera relatorio final (JSON)
- POST /sessions/{id}/finish -> salva relatorio e historico
- POST /credits/dev-add?amount=3 -> DEV ONLY (controlado por ALLOW_DEV_CREDITS=true)

---

## Limites e teste gratuito

Backend:
- FREE_TRIAL_CREDITS (ex: 1)
- INTERVIEW_MIN_MINUTES (ex: 10)
- INTERVIEW_MAX_MINUTES_FREE (ex: 15)
- INTERVIEW_MAX_MINUTES_PRO (ex: 25)

Frontend (build):
- VITE_INTERVIEW_MIN_MINUTES
- VITE_INTERVIEW_MAX_MINUTES_FREE
- VITE_INTERVIEW_MAX_MINUTES_PRO

O relatorio final inclui scoresSummary com a media real das respostas.

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
```

---

## Deploy (visao geral)

- Frontend: Vercel/Netlify (variaveis VITE_*)
- Backend: Render/Fly.io/Cloud Run
  - configure GEMINI_API_KEY
  - configure FIREBASE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS

---

## Observacoes importantes

- Nenhuma API Key fica no frontend. Todas as chamadas de IA ficam no backend.
- O app usa SpeechSynthesis do navegador para a voz do entrevistador (mais barato e simples).
- Para voz premium, use OpenAI TTS no backend (env TTS_PROVIDER=openai).
- Pagamento real de creditos: ideal implementar Stripe/Mercado Pago + webhook substituindo /credits/dev-add.

---

## Documentacao de correcoes

Veja o plano tecnico em: docs/PLANO_CORRECOES.md


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

CORS_ORIGINS=http://localhost:3000,https://YOUR_PROJECT.web.app,https://YOUR_PROJECT.firebaseapp.com
