import React from 'react';
import type { AudioCaptureState } from '../types';
import styles from './AudioPermissionCard.module.css';

interface AudioPermissionCardProps {
  state: AudioCaptureState;
  error?: string | null;
  onRequestPermission: () => void;
}

const AudioPermissionCard: React.FC<AudioPermissionCardProps> = ({
  state,
  error,
  onRequestPermission,
}) => {
  const waitingPermission = state === 'requesting_permission';

  return (
    <div className={styles.card}>
      <p className={styles.title}>Microfone</p>
      <p className={`${styles.text} ${error ? styles.error : ''}`}>
        {error
          ? error
          : waitingPermission
            ? 'Solicitando acesso ao microfone...'
            : 'Permita o uso do microfone para gravar sua resposta em audio com upload seguro por chunks.'}
      </p>
      <button type="button" className={styles.action} onClick={onRequestPermission} disabled={waitingPermission}>
        {waitingPermission ? 'Solicitando...' : 'Liberar microfone'}
      </button>
    </div>
  );
};

export default AudioPermissionCard;
