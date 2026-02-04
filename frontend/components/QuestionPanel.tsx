import React from 'react';
import styles from './QuestionPanel.module.css';
import type { DifficultyLevel, InterviewAnswerDraft, InterviewQuestion } from '../types/interview';

interface QuestionPanelProps {
  level: DifficultyLevel;
  question: InterviewQuestion;
  draft: InterviewAnswerDraft;
  isConfirmed?: boolean;
  confirmDisabled?: boolean;
  onSelectOption: (optionId: string) => void;
  onChangeJustification: (value: string) => void;
  onConfirm: () => void;
}

const QuestionPanel: React.FC<QuestionPanelProps> = ({
  level,
  question,
  draft,
  isConfirmed = false,
  confirmDisabled = false,
  onSelectOption,
  onChangeJustification,
  onConfirm,
}) => {
  const showOptions = level === 1 || level === 2;
  const showJustification = level === 2;
  const confirmLabel = level === 3 ? 'Confirmar resposta' : 'Confirmar alternativa';

  return (
    <div className={styles.panel} aria-label={`Nivel ${level}`}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Resposta</div>
          <div className={styles.subtitle}>
            {level === 3 ? 'Resposta aberta' : 'Selecione uma alternativa'}
          </div>
        </div>
        <span className={styles.levelChip}>{`Nivel ${level}`}</span>
      </div>

      {showOptions && (
        <div className={styles.options} role="radiogroup" aria-label="Alternativas">
          {(question.options ?? []).map((option) => {
            const isSelected = draft.selectedOptionId === option.id;
            return (
              <label
                key={option.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={isSelected}
                  onChange={() => onSelectOption(option.id)}
                  className={styles.radio}
                  aria-label={`Alternativa ${option.label}`}
                />
                <span className={styles.optionBadge}>{option.label}</span>
                <span className={styles.optionText}>{option.text}</span>
              </label>
            );
          })}
        </div>
      )}

      {showJustification && (
        <div className={styles.justification}>
          <label className={styles.textareaLabel} htmlFor={`justification-${question.id}`}>
            Justificativa
          </label>
          <textarea
            id={`justification-${question.id}`}
            className={styles.textarea}
            placeholder="Explique sua escolha (texto ou audio)"
            value={draft.justification ?? ''}
            onChange={(event) => onChangeJustification(event.target.value)}
            rows={4}
          />
        </div>
      )}

      {level === 3 && (
        <div className={styles.instruction}>
          Responda em voz alta. Grave sua resposta quando estiver pronto.
        </div>
      )}

      <div className={styles.statusRow}>
        <span className={styles.statusChip}>CAMERA LIGADA</span>
        <span className={styles.statusChip}>AUDIO PRONTO</span>
      </div>

      <div className={styles.confirmRow}>
        <button
          type="button"
          className={styles.confirmButton}
          disabled={confirmDisabled}
          onClick={onConfirm}
          aria-label={confirmLabel}
        >
          {confirmLabel}
        </button>
        {isConfirmed && <span className={styles.confirmedBadge}>CONFIRMADO</span>}
      </div>
    </div>
  );
};

export default QuestionPanel;
