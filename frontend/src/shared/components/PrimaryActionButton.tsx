import React from 'react';
import styles from './PrimaryActionButton.module.css';

interface PrimaryActionButtonProps {
  label: string;
  variant?: 'idle' | 'recording';
  disabled?: boolean;
  onClick?: () => void;
}

const PrimaryActionButton: React.FC<PrimaryActionButtonProps> = ({
  label,
  variant = 'idle',
  disabled = false,
  onClick,
}) => {
  return (
    <button
      type="button"
      className={`${styles.button} ${variant === 'recording' ? styles.recording : ''}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      {variant === 'recording' && <span className={styles.dot} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
};

export default PrimaryActionButton;
