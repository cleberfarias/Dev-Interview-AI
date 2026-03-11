import React from 'react';
import styles from './TopBar.module.css';

interface TopBarProps {
  timer: string;
  stage: string;
  finishLabel?: string;
  onFinish?: () => void;
  backLabel?: string;
  onBack?: () => void;
  showMeta?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({
  timer,
  stage,
  finishLabel = 'FINALIZAR CONSULTA',
  backLabel = 'VOLTAR',
  onBack,
  onFinish,
  showMeta = true,
}) => {
  return (
    <div className={`${styles.topBar} ${showMeta ? '' : styles.metaHidden}`}>
      {showMeta && (
        <div className={styles.leftStack}>
          {onBack && (
            <button
              type="button"
              className={styles.backButton}
              aria-label={backLabel}
              onClick={onBack}
            >
              {'<'} {backLabel}
            </button>
          )}
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
