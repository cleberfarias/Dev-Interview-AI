# Dev Interview AI (Frontend + FastAPI + Firebase)

Este projeto foi ajustado para um fluxo **real de produção**:

- **Frontend (Vite + React)** usando **Firebase Auth**
- **Backend (FastAPI)** para chamadas de IA (Gemini) e regras de negócio
- **Banco**: **Firebase Firestore** (usuários, créditos e histórico)
- **Créditos**: consumidos **no backend** ao iniciar uma sessão (`/sessions/start`)

---

## 1) Configurar Firebase

1. Crie um projeto no Firebase
2. Ative **Authentication** (Google + Email/Password)
3. Crie o **Firestore Database**
4. Gere uma **Service Account** (para o backend):
   - Project settings → Service accounts → Generate new private key
   - Salve como `backend/service-account.json` (não commitar)

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

Backend: `http://localhost:8000`

---

## 3) Rodar o Frontend (Vite)

```bash
cp .env.example .env.local
# preencha VITE_FIREBASE_* e VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev
```

Frontend: `http://localhost:3000`

---

## 4) Endpoints principais

- `GET /me` → retorna perfil (cria automaticamente no primeiro login)
- `POST /sessions/start` → **consome 1 crédito** e retorna `{ sessionId, plan, credits }`
- `POST /ai/name-extract` → extrai nome do áudio
- `POST /ai/evaluate-audio` → avalia resposta + transcrição (JSON)
- `POST /ai/final-report` → gera relatório final (JSON)
- `POST /sessions/{id}/finish` → salva relatório e histórico
- `POST /credits/dev-add?amount=3` → **DEV ONLY** (controlado por `ALLOW_DEV_CREDITS=true`)

---

## Deploy (visão geral)

- **Frontend**: Vercel/Netlify (variáveis `VITE_*`)
- **Backend**: Render/Fly.io/Cloud Run
  - configure `GEMINI_API_KEY`
  - configure `FIREBASE_SERVICE_ACCOUNT_JSON` ou `GOOGLE_APPLICATION_CREDENTIALS`

---

## Observações importantes

- **Nenhuma API Key fica no frontend.** Todas as chamadas de IA ficam no **backend**.
- O app usa **SpeechSynthesis** do navegador para a voz do entrevistador (mais barato e simples).
- Para voz premium, use **OpenAI TTS** no backend (env `TTS_PROVIDER=openai`).
- Pagamento real de créditos: ideal implementar **Stripe/Mercado Pago + webhook** substituindo `/credits/dev-add`.


---

## Documenta????o de corre????es

Veja o plano t??cnico em: `docs/PLANO_CORRECOES.md`


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

- O `firebase.json` já está configurado como SPA e com cache correto.
- Por padrão o frontend chama o backend em **`/api`**.

### 2) Backend (Cloud Run)

Na pasta `backend/`:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/dev-interview-api
gcloud run deploy dev-interview-api \
  --image gcr.io/PROJECT_ID/dev-interview-api \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=... \
  --set-env-vars FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

> Dica: você pode usar `FIREBASE_SERVICE_ACCOUNT_PATH` localmente e `FIREBASE_SERVICE_ACCOUNT_JSON` no Cloud Run.

### 3) CORS

Se você **não** usar o rewrite `/api` do Hosting, defina no backend:

`CORS_ORIGINS=http://localhost:3000,https://YOUR_PROJECT.web.app,https://YOUR_PROJECT.firebaseapp.com`
