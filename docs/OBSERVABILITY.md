# Observability

Este projeto agora ficou preparado para observabilidade em 3 camadas:

- `Performance Monitoring` no web via Firebase JS SDK
- `Crashlytics + Performance Monitoring` no app Android via Capacitor/Firebase
- `Cloud Logging` estruturado no backend FastAPI rodando no Cloud Run

## O que entrou no codigo

- Frontend web inicializa `firebase/performance` em `frontend/src/lib/firebase.ts`.
- Erros globais do navegador e erros de render do React sao capturados e enviados para `/telemetry/client-error` por `frontend/src/shared/services/clientTelemetry.ts` e `frontend/src/components/GlobalErrorBoundary.tsx`.
- O backend recebe esses eventos em `backend/app/api/routes_telemetry.py` e escreve JSON estruturado para o Cloud Logging com `backend/app/logging_config.py`.
- O Android ficou preparado para Firebase observability em `frontend/android/build.gradle` e `frontend/android/app/build.gradle`.

## Ativar no Firebase Console

### 1. Web Performance Monitoring

1. No Firebase Console, confirme que o app web correto esta registrado no projeto.
2. Verifique se o frontend usa `VITE_FIREBASE_APP_ID` e `VITE_FIREBASE_MEASUREMENT_ID`.
3. Abra `Performance` no console e aguarde os primeiros traces de page load e network.

### 2. Android Crashlytics e Performance

1. Adicione o arquivo `frontend/android/app/google-services.json` do app Android do Firebase.
2. No Firebase Console, habilite `Crashlytics` e `Performance`.
3. Rode:

```powershell
cd frontend
npm run build:android
cd android
.\gradlew.bat assembleDebug
```

4. Instale o app e gere:
   - navegacao/telas/requisicoes HTTP para Performance
   - um crash de teste para aparecer no Crashlytics

## Alertas por e-mail

### Crashlytics

1. Firebase Console -> Project settings -> Alerts / Crashlytics Alerts.
2. Ative os alertas de email que interessam.
3. Para algo mais fino, exporte para Cloud Logging e crie alerta no Cloud Monitoring.

### Performance Monitoring

1. Firebase Console -> Performance -> Alerts.
2. Crie alertas para page load, network ou traces customizados.
3. Use um canal de notificacao por email no Cloud Monitoring quando quiser centralizar alertas.

### Cloud Logging / Backend

1. Google Cloud Console -> Monitoring -> Alerting.
2. Crie um notification channel do tipo email.
3. Monte uma policy baseada em:
   - log-based alert
   - error count do Cloud Run
   - latencia alta ou taxa 5xx

## Variaveis uteis

- Frontend:
  - `VITE_ENABLE_FIREBASE_MONITORING_IN_DEV=false`
  - `VITE_CLIENT_TELEMETRY_ENABLED=true`
- Backend:
  - `LOG_FORMAT=json`

## Observacao importante

Inferencia a partir da documentacao oficial: `Crashlytics` aqui foi tratado como Android-only, porque o Firebase documenta Crashlytics para Android/Apple/Flutter/Unity, enquanto o web tem guia oficial de `Performance Monitoring`, nao de Crashlytics.
