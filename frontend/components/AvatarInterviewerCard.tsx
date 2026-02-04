import React, { useEffect, useState } from 'react';
import styles from './AvatarInterviewerCard.module.css';
import VrmAvatar from '../src/components/VrmAvatar/VrmAvatar';

interface AvatarInterviewerCardProps {
  isSpeaking?: boolean;
  mouthOpen?: number;
  avatarGender?: 'male' | 'female';
  label?: string;
  showHeader?: boolean;
}

const AvatarInterviewerCard: React.FC<AvatarInterviewerCardProps> = ({
  isSpeaking = false,
  mouthOpen = 0,
  avatarGender = 'female',
  label = 'ENTREVISTADOR',
  showHeader = true,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const vrmUrl = avatarGender === 'male' ? '/vrm/interviewer_male.vrm' : '/vrm/interviewer_female.vrm';

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [vrmUrl]);

  const placeholderText = 'ENTREVISTADOR';

  return (
    <div className={`${styles.card} ${isSpeaking ? styles.speaking : ''}`} aria-label="Entrevistador">
      {showHeader && (
        <div className={styles.header}>
          <span className={styles.label}>{label}</span>
          {isSpeaking && <span className={styles.status}>FALANDO</span>}
        </div>
      )}
      <div className={styles.avatarFrame} aria-label="Avatar do entrevistador">
        {!isLoaded && <div className={styles.avatarPlaceholder}>{placeholderText}</div>}
        <VrmAvatar
          vrmUrl={vrmUrl}
          mouthOpen={mouthOpen}
          className={styles.avatarCanvas}
          onLoaded={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
        {isSpeaking && (
          <div className={styles.wave} aria-hidden="true">
            <span className={styles.waveBar} />
            <span className={styles.waveBar} />
            <span className={styles.waveBar} />
            <span className={styles.waveBar} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AvatarInterviewerCard;
