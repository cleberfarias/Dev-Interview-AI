/**
 * useDIDSession
 *
 * Gerencia o ciclo de vida de uma sessão D-ID Agents SDK.
 * Usa agentManager.speak() para falar texto diretamente — sem LLM.
 *
 * SDK: @d-id/client-sdk v1.1.58
 * Docs: https://docs.d-id.com/reference/agents-sdk
 *
 * Correções aplicadas:
 *  - isMountedRef: evita setState em componente desmontado (race condition)
 *  - connectionIdRef: aborta conexões obsoletas se desmontar antes de completar
 *  - idleVideoUrlRef: evita stale closure em onVideoStateChange
 *  - statusRef: guard síncrono em callbacks sem depender de closure stale
 *  - actions estabilizado com useMemo: evita double-speak por dep instável
 *  - Tipos SDK reais: StreamingState, ConnectionState enums (não strings)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAgentManager,
  ConnectionState,
  StreamingState,
  type AgentManager,
  type AgentManagerOptions,
} from '@d-id/client-sdk';
import { getDIDCredentials } from '../services/didApi';

export type DIDSessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export interface DIDSessionState {
  status: DIDSessionStatus;
  isSpeaking: boolean;
  idleVideoUrl: string | null;
  error: string | null;
}

export interface DIDSessionActions {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /**
   * Faz o avatar falar o texto via agentManager.speak() — sem LLM.
   * Sem efeito se status !== 'connected' ou texto for vazio.
   */
  speak: (text: string) => void;
  /**
   * Registra callback chamado quando o avatar termina de falar (StreamingState.Stop).
   * Re-registre se o callback mudar entre perguntas.
   */
  onSpeakEnd: (cb: () => void) => void;
  attachVideo: (el: HTMLVideoElement) => void;
}

export function useDIDSession(): [DIDSessionState, DIDSessionActions] {
  const agentManagerRef = useRef<AgentManager | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const srcObjectRef = useRef<MediaStream | null>(null);
  const speakEndCbRef = useRef<(() => void) | null>(null);

  // Refs lidas pelos callbacks do SDK — sem stale closure
  const isMountedRef = useRef(true);
  const statusRef = useRef<DIDSessionStatus>('idle');
  const idleVideoUrlRef = useRef<string | null>(null);
  // Incrementado a cada connect(); callbacks verificam se ainda são donos da sessão atual
  const connectionIdRef = useRef(0);

  const [status, setStatus] = useState<DIDSessionStatus>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [idleVideoUrl, setIdleVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mantém statusRef sincronizado com estado React
  useEffect(() => { statusRef.current = status; }, [status]);

  // Cleanup ao desmontar
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      agentManagerRef.current?.disconnect().catch(() => {});
    };
  }, []);

  // Helper que só faz setState se o componente ainda estiver montado
  const safeSet = useCallback(
    <T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
      if (isMountedRef.current) setter(value);
    },
    [],
  );

  const applyIdleVideo = useCallback((el: HTMLVideoElement) => {
    const idle = idleVideoUrlRef.current;
    if (!idle) return;
    el.loop = true;
    el.src = idle;
    el.play().catch(() => {}); // autoplay pode falhar antes de interação do usuário
  }, []);

  const connect = useCallback(async () => {
    if (statusRef.current !== 'idle' && statusRef.current !== 'error') return;

    const myConnectionId = ++connectionIdRef.current;
    safeSet(setStatus, 'connecting');
    statusRef.current = 'connecting';
    safeSet(setError, null);

    try {
      const { clientKey, agentId } = await getDIDCredentials();

      // Aborta se desmontou ou outra conexão foi iniciada
      if (!isMountedRef.current || myConnectionId !== connectionIdRef.current) return;

      const options: AgentManagerOptions = {
        auth: { type: 'key', clientKey },
        streamOptions: { compatibilityMode: 'auto', streamWarmup: true },
        callbacks: {
          onSrcObjectReady(stream: MediaStream) {
            srcObjectRef.current = stream;
          },

          onVideoStateChange(state: StreamingState) {
            if (myConnectionId !== connectionIdRef.current) return;

            if (state === StreamingState.Stop) {
              if (isMountedRef.current) setIsSpeaking(false);
              const el = videoElRef.current;
              if (el) {
                el.loop = false;
                el.srcObject = null;
                applyIdleVideo(el); // usa ref — sem stale closure
              }
              speakEndCbRef.current?.();
            } else {
              // StreamingState.Start
              if (isMountedRef.current) setIsSpeaking(true);
              const el = videoElRef.current;
              if (el && srcObjectRef.current) {
                el.loop = false;
                el.src = '';
                el.srcObject = srcObjectRef.current;
              }
            }
          },

          onConnectionStateChange(state: ConnectionState) {
            if (myConnectionId !== connectionIdRef.current) return;
            if (!isMountedRef.current) return;

            if (state === ConnectionState.Connected) {
              safeSet(setStatus, 'connected');
              statusRef.current = 'connected';

              // idle_video existe em BasePresenter (presenter.d.ts)
              const idle = agentManagerRef.current?.agent?.presenter?.idle_video;
              if (idle) {
                idleVideoUrlRef.current = idle; // atualiza ref ANTES do setState
                safeSet(setIdleVideoUrl, idle);
                const el = videoElRef.current;
                if (el) applyIdleVideo(el);
              }
            } else if (
              state === ConnectionState.Closed ||
              state === ConnectionState.Fail
            ) {
              safeSet(setStatus, 'idle');
              statusRef.current = 'idle';
              safeSet(setIsSpeaking, false);
            }
          },

          onNewMessage() {
            // speak() não usa LLM — este callback só dispara se chat() for chamado acidentalmente
          },

          onError(err: Error) {
            if (!isMountedRef.current) return;
            console.error('[D-ID] Agent error:', err);
            safeSet(setError, err?.message ?? 'Erro desconhecido no avatar D-ID');
            safeSet(setStatus, 'error');
            statusRef.current = 'error';
          },
        },
      };

      const agentManager = await createAgentManager(agentId, options);

      // Aborta se desmontou durante createAgentManager
      if (!isMountedRef.current || myConnectionId !== connectionIdRef.current) {
        agentManager.disconnect().catch(() => {});
        return;
      }

      agentManagerRef.current = agentManager;
      await agentManager.connect();
    } catch (err) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      safeSet(setStatus, 'error');
      statusRef.current = 'error';
      safeSet(setError, msg);
    }
  }, [safeSet, applyIdleVideo]);

  const disconnect = useCallback(async () => {
    connectionIdRef.current++; // invalida conexão em andamento
    const mgr = agentManagerRef.current;
    if (!mgr) return;
    safeSet(setStatus, 'disconnecting');
    statusRef.current = 'disconnecting';
    try {
      await mgr.disconnect();
    } finally {
      agentManagerRef.current = null;
      srcObjectRef.current = null;
      idleVideoUrlRef.current = null;
      if (isMountedRef.current) {
        setStatus('idle');
        setIsSpeaking(false);
        setIdleVideoUrl(null);
        statusRef.current = 'idle';
      }
    }
  }, [safeSet]);

  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    if (statusRef.current !== 'connected') return; // ref síncrona — sem closure stale
    agentManagerRef.current?.speak({ type: 'text', input: text });
    // speak() retorna Promise mas não precisamos aguardar — fire-and-forget
  }, []);

  const onSpeakEnd = useCallback((cb: () => void) => {
    speakEndCbRef.current = cb;
  }, []);

  const attachVideo = useCallback(
    (el: HTMLVideoElement) => {
      videoElRef.current = el;
      applyIdleVideo(el);
    },
    [applyIdleVideo],
  );

  // Objeto actions estabilizado: ref só muda quando uma função mudar
  const actions = useMemo<DIDSessionActions>(
    () => ({ connect, disconnect, speak, onSpeakEnd, attachVideo }),
    [connect, disconnect, speak, onSpeakEnd, attachVideo],
  );

  return [{ status, isSpeaking, idleVideoUrl, error }, actions];
}
