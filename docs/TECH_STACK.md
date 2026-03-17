# Tech Stack

## Frontend

- `React 19`
- `TypeScript`
- `Vite`
- `Tailwind CSS`
- `Firebase Web SDK`
  - Auth
  - Firestore
  - Analytics
  - Performance Monitoring
- `Recharts` para graficos do relatorio
- `Three.js` e `@pixiv/three-vrm` para experiencias visuais/avatar
- `Capacitor` para empacotamento Android

## Backend

- `Python`
- `FastAPI`
- `Uvicorn`
- `Pydantic v2`
- `firebase-admin`
- `google-genai`
- `MCP`
- `httpx`
- `python-multipart`
- `pypdf`
- `python-docx`

## Dados e Infra

- `Firebase Auth`
- `Firestore`
- `Firebase Storage`
- `Firebase Hosting`
- `Cloud Run`
- `Cloud Logging`
- `Firebase Crashlytics` no Android
- `Firebase Performance Monitoring`

## IA e Midia

- OpenAI, Gemini e Groq por roteamento configuravel
- OpenAI para STT/TTS quando configurado
- ElevenLabs para voz do avatar quando configurado
- lipsync derivado do audio no backend

## Qualidade e Testes

- `pytest` no backend
- `vitest` no frontend
- build web com `vite build`
- build Android com `Capacitor + Gradle`

## Metodos Arquiteturais

- feature-based folders no frontend
- services/agents/repositories no backend
- contratos tipados com schemas compartilhados por dominio
- observabilidade estruturada desde a borda HTTP ate logs do backend
