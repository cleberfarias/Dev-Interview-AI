# Android / Play Store (AAB)

Este projeto frontend (Vite) foi empacotado com Capacitor para Android.
No build atual, o app Android abre a URL hospedada em Firebase:

`https://dev-interview-ai.web.app`

## Pré-requisitos

- JDK 21 (recomendado Temurin 21)
- Android SDK instalado (`C:\Users\<seu_usuario>\AppData\Local\Android\Sdk`)

## 1) Build web + sync no Android

```powershell
cd frontend
npm install
npm run build:android
```

Se o Gradle reclamar de Java, rode o build com:

```powershell
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

## 2) Configurar chave de assinatura (uma vez)

```powershell
cd frontend\android
mkdir keystore
```

Gerar upload key:

```powershell
keytool -genkeypair -v `
  -keystore keystore\upload-keystore.jks `
  -storetype JKS `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -alias upload
```

Criar `frontend/android/keystore.properties` (nao versionar):

```properties
storeFile=keystore/upload-keystore.jks
storePassword=SEU_STORE_PASSWORD
keyAlias=upload
keyPassword=SEU_KEY_PASSWORD
```

## 3) Gerar AAB de release

```powershell
cd frontend\android
.\gradlew.bat bundleRelease
```

Se aparecer erro de SDK path, crie `frontend/android/local.properties` com:

```properties
sdk.dir=C:/Users/<seu_usuario>/AppData/Local/Android/Sdk
```

Arquivo final para upload no Google Play Console:

`frontend/android/app/build/outputs/bundle/release/app-release.aab`
