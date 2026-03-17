import React, { useMemo } from 'react';
import type { AudioCaptureState, AudioUploadState } from '../types';
import styles from './RecordingStatusBadge.module.css';

interface RecordingStatusBadgeProps {
  captureState: AudioCaptureState;
  uploadState: AudioUploadState;
  pendingChunkCount: number;
}

const RecordingStatusBadge: React.FC<RecordingStatusBadgeProps> = ({
  captureState,
  uploadState,
  pendingChunkCount,
}) => {
  const title = useMemo(() => {
    if (captureState === 'recording') return 'Gravacao em andamento';
    if (captureState === 'paused') return 'Gravacao pausada';
    if (captureState === 'stopping') return 'Finalizando resposta';
    if (uploadState === 'uploading') return 'Enviando chunks de audio';
    if (uploadState === 'retry_pending') return 'Chunks pendentes para retry';
    if (captureState === 'ready') return 'Microfone pronto';
    if (captureState === 'requesting_permission') return 'Solicitando permissao';
    if (captureState === 'error') return 'Microfone indisponivel';
    return 'Audio em espera';
  }, [captureState, uploadState]);

  const subtitle = useMemo(() => {
    if (uploadState === 'retry_pending' && pendingChunkCount > 0) {
      return `${pendingChunkCount} chunk(s) aguardando reenvio seguro.`;
    }
    if (uploadState === 'uploading') {
      return 'O sistema esta subindo partes da sua resposta em segundo plano.';
    }
    if (captureState === 'recording') {
      return 'Sua resposta esta sendo gravada por chunks para reduzir risco de perda.';
    }
    if (captureState === 'paused') {
      return 'Retome quando estiver pronto para continuar a mesma resposta.';
    }
    return 'Captura de audio pronta para o proximo turno.';
  }, [captureState, pendingChunkCount, uploadState]);

  const dotClassName =
    captureState === 'recording'
      ? `${styles.dot} ${styles.recording}`
      : captureState === 'paused'
        ? `${styles.dot} ${styles.paused}`
        : uploadState === 'retry_pending'
          ? `${styles.dot} ${styles.retry}`
          : styles.dot;

  return (
    <div className={styles.badge} aria-live="polite">
      <div className={styles.primary}>
        <span className={dotClassName} aria-hidden="true" />
        <div className={styles.text}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
      </div>
      <span className={styles.meta}>{pendingChunkCount} pendente(s)</span>
    </div>
  );
};

export default RecordingStatusBadge;
