import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LanguageCode } from '../../../shared/types';
import styles from './ProductTour.module.css';

export interface ProductTourStep {
  id: string;
  target?: string;
  title: string;
  description: string;
  placement?: 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center';
}

interface ProductTourProps {
  open: boolean;
  steps: ProductTourStep[];
  locale?: LanguageCode;
  onClose: () => void;
  onComplete: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const POPOVER_WIDTH = 320;
const VIEWPORT_PADDING = 16;
const SPOTLIGHT_PADDING = 10;
const SPOTLIGHT_RADIUS = 22;
const STEP_GAP = 18;

const LABELS: Record<LanguageCode, { skip: string; back: string; next: string; done: string; step: string }> = {
  'pt-BR': {
    skip: 'Pular tour',
    back: 'Voltar',
    next: 'Proximo',
    done: 'Concluir',
    step: 'Passo',
  },
  en: {
    skip: 'Skip tour',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    step: 'Step',
  },
  es: {
    skip: 'Saltar tour',
    back: 'Volver',
    next: 'Siguiente',
    done: 'Listo',
    step: 'Paso',
  },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const resolvePlacement = (
  preferred: ProductTourStep['placement'],
  rect: SpotlightRect | null,
  popoverHeight: number,
): NonNullable<ProductTourStep['placement']> => {
  if (!rect) return 'center';
  if (preferred && preferred !== 'auto') return preferred;

  const fitsBottom = rect.top + rect.height + STEP_GAP + popoverHeight <= window.innerHeight - VIEWPORT_PADDING;
  if (fitsBottom) return 'bottom';

  const fitsTop = rect.top - popoverHeight - STEP_GAP >= VIEWPORT_PADDING;
  if (fitsTop) return 'top';

  const fitsRight = rect.left + rect.width + STEP_GAP + POPOVER_WIDTH <= window.innerWidth - VIEWPORT_PADDING;
  if (fitsRight) return 'right';

  const fitsLeft = rect.left - STEP_GAP - POPOVER_WIDTH >= VIEWPORT_PADDING;
  if (fitsLeft) return 'left';

  return 'center';
};

const computePopoverPosition = (
  placement: NonNullable<ProductTourStep['placement']>,
  rect: SpotlightRect | null,
  popoverHeight: number,
) => {
  if (!rect || placement === 'center') {
    return {
      top: clamp(window.innerHeight / 2 - popoverHeight / 2, VIEWPORT_PADDING, window.innerHeight - popoverHeight - VIEWPORT_PADDING),
      left: clamp(window.innerWidth / 2 - POPOVER_WIDTH / 2, VIEWPORT_PADDING, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING),
    };
  }

  const centeredLeft = clamp(
    rect.left + rect.width / 2 - POPOVER_WIDTH / 2,
    VIEWPORT_PADDING,
    window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING,
  );
  const centeredTop = clamp(
    rect.top + rect.height / 2 - popoverHeight / 2,
    VIEWPORT_PADDING,
    window.innerHeight - popoverHeight - VIEWPORT_PADDING,
  );

  if (placement === 'top') {
    return {
      top: clamp(rect.top - popoverHeight - STEP_GAP, VIEWPORT_PADDING, window.innerHeight - popoverHeight - VIEWPORT_PADDING),
      left: centeredLeft,
    };
  }

  if (placement === 'right') {
    return {
      top: centeredTop,
      left: clamp(rect.left + rect.width + STEP_GAP, VIEWPORT_PADDING, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING),
    };
  }

  if (placement === 'left') {
    return {
      top: centeredTop,
      left: clamp(rect.left - POPOVER_WIDTH - STEP_GAP, VIEWPORT_PADDING, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING),
    };
  }

  return {
    top: clamp(rect.top + rect.height + STEP_GAP, VIEWPORT_PADDING, window.innerHeight - popoverHeight - VIEWPORT_PADDING),
    left: centeredLeft,
  };
};

const ProductTour: React.FC<ProductTourProps> = ({ open, steps, locale = 'pt-BR', onClose, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const safeSteps = useMemo(() => steps.filter((step) => Boolean(step.title && step.description)), [steps]);
  const activeStep = safeSteps[currentIndex];
  const labels = LABELS[locale] || LABELS['pt-BR'];
  const isLastStep = currentIndex === safeSteps.length - 1;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setCurrentIndex(0);
      setSpotlightRect(null);
      setTargetFound(false);
      setPopoverPosition(null);
      return;
    }
    setCurrentIndex(0);
  }, [open, safeSteps.length]);

  useEffect(() => {
    if (!open || !activeStep?.target) return;
    const target = document.querySelector(activeStep.target);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, [activeStep, open]);

  useLayoutEffect(() => {
    if (!open || !activeStep) return;

    let intervalId = 0;
    let frameId = 0;

    const updateSpotlight = () => {
      const target = activeStep.target ? document.querySelector(activeStep.target) : null;
      if (!(target instanceof HTMLElement)) {
        setTargetFound(false);
        setSpotlightRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setTargetFound(false);
        setSpotlightRect(null);
        return;
      }

      setTargetFound(true);
      setSpotlightRect({
        top: Math.max(VIEWPORT_PADDING, rect.top - SPOTLIGHT_PADDING),
        left: Math.max(VIEWPORT_PADDING, rect.left - SPOTLIGHT_PADDING),
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      });
    };

    frameId = window.requestAnimationFrame(updateSpotlight);
    intervalId = window.setInterval(updateSpotlight, 250);
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
  }, [activeStep, open]);

  useLayoutEffect(() => {
    if (!open || !activeStep || !popoverRef.current) return;
    const popoverHeight = popoverRef.current.getBoundingClientRect().height || 240;
    const placement = resolvePlacement(activeStep.placement ?? 'auto', targetFound ? spotlightRect : null, popoverHeight);
    setPopoverPosition(computePopoverPosition(placement, targetFound ? spotlightRect : null, popoverHeight));
  }, [activeStep, open, spotlightRect, targetFound]);

  if (!open || !portalReady || !activeStep || safeSteps.length === 0) {
    return null;
  }

  const overlay = (
    <div className={styles.root} aria-live="polite">
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      {targetFound && spotlightRect && (
        <div
          className={styles.spotlight}
          aria-hidden="true"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            borderRadius: SPOTLIGHT_RADIUS,
          }}
        />
      )}

      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label={activeStep.title}
        className={styles.popover}
        style={
          popoverPosition
            ? {
                top: popoverPosition.top,
                left: popoverPosition.left,
              }
            : undefined
        }
      >
        <div className={styles.popoverHeader}>
          <span className={styles.kicker}>
            {labels.step} {currentIndex + 1}/{safeSteps.length}
          </span>
          <button type="button" onClick={onClose} className={styles.skipButton}>
            {labels.skip}
          </button>
        </div>

        <h3 className={styles.title}>{activeStep.title}</h3>
        <p className={styles.description}>{activeStep.description}</p>

        {!targetFound && activeStep.target && (
          <p className={styles.helperText}>
            Esta area ainda nao esta visivel. O tour continua mesmo assim.
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
            disabled={currentIndex === 0}
            className={styles.secondaryButton}
          >
            {labels.back}
          </button>

          <button
            type="button"
            onClick={() => {
              if (isLastStep) {
                onComplete();
                return;
              }
              setCurrentIndex((value) => Math.min(safeSteps.length - 1, value + 1));
            }}
            className={styles.primaryButton}
          >
            {isLastStep ? labels.done : labels.next}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default ProductTour;
