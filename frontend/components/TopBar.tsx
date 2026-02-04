import React from 'react';
import styles from './TopBar.module.css';

interface TopBarProps {
  timer: string;
  stage: string;
  finishLabel?: string;
  onFinish?: () => void;
  showMeta?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({
  timer,
  stage,
  finishLabel = 'FINALIZAR CONSULTA',
  onFinish,
  showMeta = true,
}) => {
  return (
    <div className={`${styles.topBar} ${showMeta ? '' : styles.metaHidden}`}>
      {showMeta && (
        <div className={styles.leftStack}>
          <div className={`${styles.chip} ${styles.timerChip}`} aria-label={`Tempo ${timer}`}>
            <span className={styles.timerDot} aria-hidden="true" />
            <span className={styles.timerText}>{timer}</span>
          </div>
          <div className={styles.chip} aria-label={`Etapa ${stage}`}>
            <span className={styles.stageText}>{stage}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        className={styles.finishButton}
        aria-label={finishLabel}
        onClick={onFinish}
      >
        {finishLabel}
      </button>
    </div>
  );
};

export default TopBar;
