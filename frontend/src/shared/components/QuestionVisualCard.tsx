import React from 'react';
import styles from './QuestionVisualCard.module.css';

interface QuestionVisualCardProps {
  title: string;
  bullets: string[];
  isLoading?: boolean;
  topic?: string;
  contextLabel?: string;
}

const QuestionVisualCard: React.FC<QuestionVisualCardProps> = ({
  title,
  bullets,
  isLoading = false,
  contextLabel,
}) => {
  if (isLoading) {
    return (
      <div className={styles.card} aria-label="Carregando pergunta" aria-busy="true">
        <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
        <div className={styles.skeletonGroup}>
          <div className={`${styles.skeletonLine} ${styles.skeletonBullet}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonBullet}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonBullet}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card} aria-label="Pergunta da entrevista">
      <div className={styles.title}>{title}</div>
      {contextLabel && <div className={styles.contextTag}>{contextLabel}</div>}
      <ul className={styles.bullets}>
        {bullets.map((bullet) => (
          <li key={bullet} className={styles.bullet}>
            <span className={styles.bulletDot} aria-hidden="true" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default QuestionVisualCard;
