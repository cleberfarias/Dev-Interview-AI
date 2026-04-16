# Proposta Técnica — Avatar Falante em Tempo Real
## Dev-Interview AI · Comparativo HeyGen / D-ID / Synthesia

> Gerado via: `context7` (docs oficiais) + `sequential-thinking` (análise)  
> Data: 2026-04-15  
> Status: **Proposta para revisão — nenhum código implementado**

---

## 1. Comparativo Técnico

### 1.1 Tabela de decisão

| Critério | HeyGen Interactive Avatar | D-ID Agents | Synthesia |
|---|---|---|---|
| **Avatar em tempo real** | ✅ WebRTC nativo | ✅ WebRTC nativo | ❌ Apenas assíncrono |
| **Streaming vídeo/áudio** | ✅ WebRTC | ✅ WebRTC | ❌ Download de arquivo |
| **SDK JavaScript oficial** | ✅ `@heygen/streaming-avatar` | ✅ `@d-id/client-sdk` | ❌ Sem SDK real-time |
| **Voice chat bidirecional** | ✅ STT (Deepgram) integrado | ⚠️ Requer STT externo | ❌ |
| **Modo texto (fala programática)** | ✅ `streamingAvatar.speak({text})` | ✅ `agentManager.chat(text)` | ❌ |
| **Interromper fala** | ✅ `streamingAvatar.interrupt()` | ⚠️ Não documentado | ❌ |
| **Video idle (avatar esperando)** | ⚠️ Não explícito | ✅ `agent.presenter.idle_video` | ❌ |
| **Latência estimada** | ~300–500ms | ~500–1500ms | Minutos |
| **Qualidade fotorrealista** | Alta | Alta (Clips/Premium+) | Alta |
| **Suporte a Português** | ✅ | ✅ | ✅ |
| **Docs quality (snippets)** | 448 snippets (High) | 968 snippets (High) | N/A |
| **Acesso para MVP** | ⛔ **Enterprise only** | ✅ Planos pagos regulares | ❌ |
| **Risco de acesso bloqueado** | Alto | Baixo | N/A |
| **Client-side key (browser)** | ❌ Só API Key (server) | ✅ `clientKey` para browser | ❌ |
| **Custo estimado** | Alto (Enterprise) | Médio (~$0.15–$0.30/min) | Alto |

### 1.2 Análise por plataforma

#### HeyGen Interactive Avatar
**Produto correto para real-time:** `@heygen/streaming-avatar` (não confundir com `LiveAvatar SDK` ou `VideoAgent`).

**O que faz bem:**
- Voice chat bidirecional com STT Deepgram integrado
- Controle fino: `speak()`, `interrupt()`, `startListening()`, `stopListening()`
- Knowledge base customizável por sessão
- `VoiceChatTransport.WEBSOCKET` para menor latência

**Problema crítico:**
> A própria documentação afirma: *"This requires an API key, which is **typically available for Enterprise customers**."*

O token de sessão é gerado via `POST /v1/streaming.create_token` com uma API Key Enterprise. Sem esse acesso, o produto de streaming real-time **não está disponível**. O Video Agent (`/v3/video-agents`) é um produto diferente, assíncrono, não serve para o caso de uso.

**Conclusão:** Excelente tecnicamente. **Bloqueante para MVP** por restrição de acesso.

---

#### D-ID Agents SDK
**Produto correto:** `@d-id/client-sdk` com `createAgentManager`.

**O que faz bem:**
- WebRTC bem documentado (968 snippets, reputação High)
- `agentManager.chat(text)` → avatar fala o texto em vídeo
- `idle_video` nativo para estado de espera do avatar
- `clientKey` para uso direto no browser (sem obrigatoriamente expor no backend)
- `onVideoStateChange(state)` para alternar entre idle e ativo
- `streamWarmup: true` para pré-aquecer conexão (reduz latência na primeira fala)
- Planos pagos não-enterprise disponíveis

**Limitações para o projeto:**
- Sem STT integrado → precisamos manter o STT próprio (já existe no projeto)
- Latência levemente maior (~500–1500ms vs ~300ms HeyGen)
- Para avatar fluente (sem corte brusco): requer plano Premium+ com `fluent: true`
- `clientKey` exposta no frontend é risco de segurança → requer proxy backend

**Conclusão:** Tecnicamente adequado para o fluxo do projeto. **Acessível para MVP.** Documentação mais extensa.

---

#### Synthesia
Geração de vídeo completamente assíncrona. Tempo de resposta em minutos. Não tem API de streaming real-time. **Descartado.**

---

## 2. Recomendação Final

**→ D-ID Agents SDK para MVP**

**Justificativa técnica:**

1. **Acesso real:** D-ID tem planos pagos disponíveis sem barreira Enterprise. HeyGen bloqueia o streaming para Enterprise.

2. **Fit com o fluxo atual:** O Dev-Interview já tem STT no backend. O D-ID não precisa de STT próprio — o avatar apenas fala o texto que o backend gera. O fluxo não muda: `backend gera pergunta → D-ID avatar fala → candidato responde → STT atual → loop`.

3. **Documentação:** 968 snippets de código vs 4 do SDK HeyGen. Menor risco de integração.

4. **`idle_video`:** O avatar pode ficar em loop de vídeo neutro enquanto espera, melhorando muito a UX.

5. **Caminho para HeyGen:** Se após o MVP conseguir acesso Enterprise HeyGen, a troca é localizada em um único componente/hook. A arquitetura proposta suporta isso.

**Escopo do MVP:** Avatar D-ID substitui o sistema TTS + VRM atual. STT e lógica de entrevista permanecem inalterados.

---

## 3. Arquitetura Sugerida

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend React (Firebase Hosting)                               │
│                                                                   │
│  InterviewRoomLayout                                              │
│    ├── [ATUAL] AvatarInterview (VRM 3D) ← desativar com flag     │
│    └── [NOVO]  DIDAvatar                                         │
│                  ├── useDIDSession (hook)                        │
│                  │     └── @d-id/client-sdk                      │
│                  │           ├── agentManager.connect()          │
│                  │           ├── agentManager.chat(question)     │
│                  │           └── agentManager.disconnect()       │
│                  └── <video> ← WebRTC srcObject                  │
│                                                                   │
│  didApi.ts ──► GET /api/did/client-key (backend)                 │
└─────────────────────────────────────────────────────────────────┘
              │ REST para buscar clientKey
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend FastAPI (Cloud Run)                                      │
│                                                                   │
│  routes_did.py                                                    │
│    GET /did/client-key                                            │
│      └── retorna DID_CLIENT_KEY do .env                          │
│          (protegido por autenticação Firebase)                    │
└─────────────────────────────────────────────────────────────────┘
              │ WebRTC (vídeo/áudio direto)
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  D-ID Cloud                                                       │
│  - Avatar fotorrealista via WebRTC                                │
│  - TTS integrado (fala o texto enviado pelo chat())               │
│  - idle_video em loop quando aguardando                           │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo de sessão completo

```
1. [Candidato entra no InterviewRoom]
       ↓
2. useDIDSession.connect()
   → GET /api/did/client-key (backend)
   → sdk.createAgentManager(agentId, { auth, callbacks })
   → agentManager.connect()  ← WebRTC estabelecido
       ↓
3. onConnectionStateChange("connected")
   → video.src = agent.presenter.idle_video  ← avatar em espera
       ↓
4. [Início da entrevista]
   agentManager.chat("Olá! Vamos começar. Me fale sobre você.")
   → onVideoStateChange("START") → video.srcObject = stream
   → Avatar fala a pergunta em vídeo real-time
       ↓
5. onVideoStateChange("STOP")
   → video.src = idle_video  ← avatar volta a esperar
   → [Sistema ativa gravação do candidato — fluxo atual mantido]
       ↓
6. [Candidato fala → STT backend → próxima pergunta gerada]
   agentManager.chat("Interessante! Agora me fale sobre...")
   → loop volta ao passo 4
       ↓
7. [Fim da entrevista]
   agentManager.chat("Obrigado pela sua participação!")
   → agentManager.disconnect()
```

---

## 4. Riscos e Limitações

| Risco | Severidade | Mitigação |
|---|---|---|
| Latência ~500–1500ms por resposta D-ID | Média | `streamWarmup: true` no início; mostrar `idle_video` durante espera |
| Custo por minuto (~$0.15–0.30) em entrevistas longas | Média | Desconectar durante longos períodos de silêncio; monitorar uso |
| `clientKey` exposta no frontend | Alta | Sempre obter via backend autenticado — nunca hardcoded no JS |
| Voz D-ID em pt-BR pode soar artificial | Baixa–Média | Testar vozes disponíveis; opcionalmente usar voz ElevenLabs via D-ID |
| `idle_video` requer plano que inclua Clips | Média | Testar com plano básico; Talk presenter pode não ter idle nativo |
| `fluent: true` requer plano Premium+ | Baixa | Testar sem; degradação aceitável para MVP |
| Quota de streams simultâneos | Baixa | Verificar limites do plano antes de escalar |
| D-ID sunset ou mudança de preço | Baixa | Arquitetura isolada em 1 componente facilita troca futura |

---

## 5. Pré-requisitos antes de implementar

### 5.1 Conta D-ID
- [ ] Criar conta em [studio.d-id.com](https://studio.d-id.com)
- [ ] Verificar plano que inclui Agents API (não é o plano gratuito)
- [ ] Criar um **Agent** no dashboard com:
  - Avatar: escolher um apresentador fotorrealista
  - Voz: selecionar voz em pt-BR
  - LLM: desabilitar (usaremos apenas para TTS, não para geração de resposta)
  - Anotar o `agentId` (formato: `agt_xxxxxxxx`)
- [ ] Obter `clientKey` (em Settings → API → Client Key)

### 5.2 Variáveis de ambiente
```bash
# backend/.env
DID_CLIENT_KEY=Z3123asd...base64key...

# Opcional: para criar agents via API
DID_API_KEY=Basic base64(email:password)
```

### 5.3 Dependência frontend
```bash
cd frontend
npm install @d-id/client-sdk
```
> Confirmar antes de instalar se há conflito com React 19 ou Vite 6.

---

## 6. Plano de Implementação

### Fase 1 — Backend (½ dia)

**Arquivo:** `backend/app/api/routes_did.py`

```python
# GET /did/client-key
# Retorna DID_CLIENT_KEY para uso no frontend
# Requer usuário autenticado via Firebase token
```

**Registrar em** `backend/app/main.py`:
```python
from .api import routes_did
app.include_router(routes_did.router)
```

**Responsabilidade:** Nunca expor `DID_CLIENT_KEY` sem autenticação. Verificar Firebase ID token no header.

---

### Fase 2 — Serviço Frontend (1h)

**Arquivo:** `frontend/services/didApi.ts`

```typescript
// GET /api/did/client-key → string
export async function getDIDClientKey(): Promise<string>
```

---

### Fase 3 — Hook React (2h)

**Arquivo:** `frontend/hooks/useDIDSession.ts`

**Estados expostos:**
```typescript
type DIDSessionStatus = 'idle' | 'connecting' | 'connected' | 'speaking' | 'error';

interface DIDSessionState {
  status: DIDSessionStatus;
  isConnected: boolean;
  isSpeaking: boolean;        // avatar está falando
  idleVideoUrl: string | null; // URL do idle_video do agent
  error: string | null;
}
```

**Ações expostas:**
```typescript
interface DIDSessionActions {
  connect(): Promise<void>;         // obtém clientKey + cria agentManager + conecta WebRTC
  disconnect(): Promise<void>;      // encerra sessão
  speak(text: string): void;        // agentManager.chat(text)
  attachVideo(el: HTMLVideoElement): void; // liga srcObject ao <video>
}
```

**Callbacks internos do SDK a implementar:**
```typescript
const callbacks = {
  onSrcObjectReady(value) { ... },        // liga stream ao video
  onConnectionStateChange(state) { ... }, // atualiza status
  onVideoStateChange(state) {             // alterna idle/stream
    if (state === 'STOP') video.src = idleVideoUrl;
    else { video.src = ''; video.srcObject = srcObject; }
  },
  onNewMessage(messages, type) { ... },   // confirma resposta
  onError(error, errorData) { ... },      // trata erros
};
```

---

### Fase 4 — Componente React (2h)

**Arquivo:** `frontend/src/features/avatar/DIDAvatar.tsx`

**Interface:**
```typescript
interface DIDAvatarProps {
  question?: string;          // quando muda, avatar fala a nova pergunta
  onSpeakEnd?: () => void;    // avatar terminou de falar → ativar gravação candidato
  className?: string;
}
```

**Comportamento:**
- Conecta automaticamente ao montar
- Quando `question` muda e está conectado → `actions.speak(question)`
- Quando `onVideoStateChange("STOP")` → chama `onSpeakEnd()`
- Mostra `idle_video` em `<video>` quando avatar não está falando
- Mostra loader durante conexão
- Mostra erro com botão de retry se falhar

---

### Fase 5 — Integração no InterviewRoom (1–2h)

**Arquivo:** `frontend/src/features/interview/components/InterviewRoomLayout.tsx`

Adicionar feature flag (simples, sem lib de feature flag):
```typescript
// Em InterviewRoomLayout.tsx
const USE_DID_AVATAR = import.meta.env.VITE_USE_DID_AVATAR === 'true';

// No JSX:
{USE_DID_AVATAR ? (
  <DIDAvatar
    question={currentQuestion?.text}
    onSpeakEnd={() => startCandidateRecording()}
  />
) : (
  <AvatarInterview avatar={initialAvatar} state={avatarState} mouthOpen={mouthOpen} />
)}
```

**Ajuste no fluxo:** O TTS atual (`setAudioElementSourceFromBase64`) pode ser desabilitado quando `USE_DID_AVATAR === true`, pois o D-ID já faz TTS internamente.

---

### Fase 6 — Testes (1 dia)

#### Testes unitários (Vitest + Testing Library)

**Arquivo:** `frontend/tests/DIDAvatar.test.tsx`

Cobertura mínima:
- [ ] Renderiza idle_video antes de conectar
- [ ] Chama `connect()` ao montar
- [ ] Chama `agentManager.chat(text)` quando `question` muda
- [ ] Chama `onSpeakEnd` quando `onVideoStateChange("STOP")` dispara
- [ ] Exibe erro e botão retry quando `onError` dispara
- [ ] Chama `disconnect()` ao desmontar

#### Testes Playwright (locais)

**Arquivo:** `frontend/tests/e2e/did-avatar.spec.ts`

> Playwright serve para validar a **interface** localmente, não o comportamento real do SDK (que exige credenciais reais).

```typescript
// Cenários com SDK mockado via route interception:
test('exibe loader durante conexão', ...)
test('exibe video element após mock de "connected"', ...)
test('botão de encerrar encerra a sessão', ...)
```

---

## 7. Estrutura de arquivos sugerida

```
frontend/
├── services/
│   └── didApi.ts                    ← novo: busca clientKey do backend
├── hooks/
│   └── useDIDSession.ts             ← novo: gerencia ciclo de vida D-ID
└── src/
    └── features/
        └── avatar/
            ├── AvatarInterview.tsx  ← existente: mantido
            ├── DIDAvatar.tsx        ← novo: componente principal
            └── index.ts             ← atualizar: exportar DIDAvatar

backend/
└── app/
    └── api/
        └── routes_did.py            ← novo: GET /did/client-key

docs/
└── AVATAR_REALTIME_PROPOSTA_TECNICA.md  ← este arquivo
```

---

## 8. Checklist de testes locais

### Setup inicial
- [ ] Conta D-ID criada e plano Agents ativo
- [ ] Agent criado no dashboard com voz pt-BR
- [ ] `agentId` e `clientKey` anotados
- [ ] `DID_CLIENT_KEY` adicionado ao `backend/.env`
- [ ] `@d-id/client-sdk` instalado no frontend
- [ ] `VITE_USE_DID_AVATAR=true` no `frontend/.env.local`

### Testes manuais no navegador
- [ ] `npm run dev` (frontend) + backend rodando
- [ ] Abrir DevTools → Network → verificar que `/api/did/client-key` retorna 200
- [ ] Abrir DevTools → Network → verificar que WebRTC ICE candidates são trocados
- [ ] Avatar exibe `idle_video` antes da primeira pergunta
- [ ] Avatar fala a primeira pergunta com lip sync
- [ ] Após avatar falar, sistema ativa gravação do candidato
- [ ] Próxima pergunta funciona sem reconectar
- [ ] Encerrar entrevista desconecta sessão D-ID
- [ ] Recarregar página não deixa sessão "zumbi" no D-ID

### Testes de resiliência
- [ ] Desconectar internet durante sessão → exibe mensagem de erro
- [ ] Backend indisponível → não bloqueia carregamento da página
- [ ] Plano D-ID sem quota → erro tratado com mensagem amigável

### Testes unitários
```bash
cd frontend
npx vitest run tests/DIDAvatar.test.tsx
```
- [ ] Todos os testes passam com SDK mockado

### Testes E2E Playwright
```bash
cd frontend
npx playwright test tests/e2e/did-avatar.spec.ts
```
- [ ] Cenários de UI passam com mocks

---

## 9. Decisão sobre HeyGen no futuro

Se após o MVP o acesso Enterprise HeyGen for obtido, a migração é localizada:

| O que muda | O que permanece |
|---|---|
| `useDIDSession.ts` → `useHeyGenSession.ts` | Toda lógica de entrevista |
| `DIDAvatar.tsx` → `HeyGenAvatar.tsx` | STT backend |
| `routes_did.py` → `routes_heygen.py` | InterviewRoomLayout |
| Feature flag `VITE_USE_DID_AVATAR` | Testes unitários (apenas mocks) |

**Vantagem adicional do HeyGen quando/se disponível:**
- STT integrado elimina o loop STT do backend durante voice chat
- Latência menor (~300ms)
- `streamingAvatar.interrupt()` funciona de forma mais robusta

---

## 10. Próximos passos sugeridos

1. **Agora (antes de implementar):**
   - Criar conta D-ID e verificar plano que inclui Agents API
   - Criar Agent no dashboard e testar no playground do D-ID
   - Confirmar que `@d-id/client-sdk` é compatível com React 19 + Vite 6
   - Validar custo estimado para sessões de ~30 min

2. **Implementação (após validar acesso):**
   - Seguir as 6 fases da seção 6 em ordem
   - Testar cada fase isoladamente antes de integrar

3. **Pós-MVP:**
   - Avaliar latência real em produção
   - Monitorar custo por entrevista
   - Explorar HeyGen Enterprise se latência for crítica
