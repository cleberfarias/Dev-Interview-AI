import React from 'react';
import styles from './AvatarControls.module.css';

type AvatarInterviewState = 'idle' | 'avatar_listening' | 'avatar_thinking' | 'avatar_speaking';

interface AvatarControlsProps {
  state: AvatarInterviewState;
}

const LABELS: Record<AvatarInterviewState, string> = {
  idle: 'Inativo',
  avatar_listening: 'Ouvindo',
  avatar_thinking: 'Pensando',
  avatar_speaking: 'Falando',
};

const AvatarControls: React.FC<AvatarControlsProps> = ({ state }) => {
  const items: AvatarInterviewState[] = ['avatar_listening', 'avatar_thinking', 'avatar_speaking'];
  return (
    <div className={styles.panel} aria-label="Avatar controls">
      {items.map((item) => (
        <span key={item} className={`${styles.chip} ${state === item ? styles.active : ''}`}>
          {LABELS[item]}
        </span>
      ))}
    </div>
  );
};

export default AvatarControls;
