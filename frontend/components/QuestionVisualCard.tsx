import React, { useEffect, useMemo, useState } from 'react';
import styles from './QuestionVisualCard.module.css';
import { getQuestionVisual } from '../src/constants/questionVisuals';

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
  topic,
  contextLabel,
}) => {
  const imageUrl = useMemo(() => getQuestionVisual(topic), [topic]);
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    setShowImage(false);
    const id = window.setTimeout(() => setShowImage(true), 300);
    return () => window.clearTimeout(id);
  }, [imageUrl, title]);

  if (isLoading) {
    return (
      <div className={styles.card} aria-label="Carregando pergunta" aria-busy="true">
        <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeletonBlock} ${styles.skeletonImage}`} />
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
      <div className={styles.imageFrame} aria-label="Imagem ilustrativa">
        {!showImage && <div className={styles.imageSkeleton} aria-hidden="true" />}
        <img
          src={imageUrl}
          alt={topic ? `Imagem do topico ${topic}` : 'Imagem ilustrativa'}
          className={`${styles.image} ${showImage ? styles.imageVisible : ''}`}
        />
        {contextLabel && <div className={styles.contextTag}>{contextLabel}</div>}
      </div>
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

