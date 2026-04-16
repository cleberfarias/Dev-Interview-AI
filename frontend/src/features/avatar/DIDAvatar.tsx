/**
 * DIDAvatar
 *
 * Avatar fotorrealista em tempo real via D-ID Agents SDK.
 * Usa agentManager.speak() — sem LLM, apenas TTS + vídeo WebRTC.
 *
 * Correções aplicadas:
 *  - spokenQuestionRef: evita double-speak por rerender com mesma question
 *  - useEffect de speak só depende de [question, status] — 'actions' fora do dep
 *  - connect/disconnect/attachVideo/onSpeakEnd chamados via ref estável (actions é memo)
 *  - Loop cleanup: desconecta ao desmontar via useEffect com [] dep
 */
import React, { useEffect, useRef } from 'react';
import { useDIDSession } from '../../../hooks/useDIDSession';

export interface DIDAvatarProps {
  /**
   * Texto atual a ser falado pelo avatar.
   * O avatar só fala novamente se o valor mudar (não em rerenders com mesmo valor).
   */
  question?: string;
  /**
   * Chamado quando o avatar termina de falar.
   * Use para ativar a gravação do candidato.
   */
  onSpeakEnd?: () => void;
  videoHeight?: number;
  videoWidth?: number;
  className?: string;
}

const DIDAvatar: React.FC<DIDAvatarProps> = ({
  question,
  onSpeakEnd,
  videoHeight = 480,
  videoWidth = 640,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, actions] = useDIDSession();

  // Rastreia a última pergunta efetivamente falada para evitar double-speak
  const spokenQuestionRef = useRef<string | null>(null);

  // Conecta ao montar — actions.connect é estável (useMemo no hook)
  useEffect(() => {
    actions.connect();
    return () => {
      actions.disconnect();
    };
  }, [actions]); // actions é memo estável — este effect roda apenas na montagem

  // Registra callback de fim de fala quando onSpeakEnd muda
  useEffect(() => {
    actions.onSpeakEnd(onSpeakEnd ?? (() => {}));
  }, [onSpeakEnd, actions]);

  // Anexa <video> ao hook uma vez
  useEffect(() => {
    if (videoRef.current) {
      actions.attachVideo(videoRef.current);
    }
  }, [actions]);

  // Fala a pergunta quando muda E sessão está pronta E não foi falada ainda
  useEffect(() => {
    if (
      question &&
      state.status === 'connected' &&
      question !== spokenQuestionRef.current
    ) {
      spokenQuestionRef.current = question;
      actions.speak(question);
    }
  }, [question, state.status, actions]);

  const isConnected = state.status === 'connected';
  const isConnecting = state.status === 'connecting';
  const isError = state.status === 'error';

  return (
    <div
      className={className}
      data-testid="did-avatar-section"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
    >
      <div
        style={{
          position: 'relative',
          width: videoWidth,
          maxWidth: '100%',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#111',
        }}
      >
        {/* Sempre no DOM para que o SDK possa aplicar srcObject/src */}
        <video
          ref={videoRef}
          data-testid="did-video"
          autoPlay
          playsInline
          muted={false}
          style={{ width: '100%', height: videoHeight, objectFit: 'cover' }}
        />

        {/* Overlay de status (conectando / erro) */}
        {(isConnecting || isError || state.status === 'idle') && (
          <div
            data-testid="did-status-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(10,10,30,0.85)',
              color: '#fff',
              gap: 10,
            }}
          >
            {isConnecting && (
              <>
                <span style={{ fontSize: 32 }}>⏳</span>
                <span style={{ color: '#aaa' }}>Conectando ao entrevistador...</span>
              </>
            )}
            {isError && (
              <>
                <span style={{ fontSize: 32 }}>⚠️</span>
                <span
                  style={{ color: '#ff6b6b', textAlign: 'center', padding: '0 16px', fontSize: 13 }}
                >
                  {state.error}
                </span>
                <button
                  data-testid="did-btn-retry"
                  onClick={actions.connect}
                  style={btnStyle('#4c6ef5')}
                >
                  Tentar novamente
                </button>
              </>
            )}
          </div>
        )}

        {/* Indicador de fala ativa */}
        {isConnected && state.isSpeaking && (
          <div
            data-testid="did-speaking-indicator"
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              background: 'rgba(80,120,255,0.85)',
              color: '#fff',
              borderRadius: 8,
              padding: '3px 10px',
              fontSize: 12,
            }}
          >
            🗣 Entrevistador falando...
          </div>
        )}
      </div>

      {isConnected && (
        <div data-testid="did-controls" style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid="did-btn-disconnect"
            onClick={actions.disconnect}
            style={btnStyle('#e74c3c')}
          >
            Encerrar avatar
          </button>
        </div>
      )}
    </div>
  );
};

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  };
}

export default DIDAvatar;
