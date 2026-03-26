import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTIONS,
  EVENTS,
  Joyride,
  STATUS,
  type EventData,
  type Step as JoyrideStep,
  type TooltipRenderProps,
} from 'react-joyride';

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

const mapPlacement = (placement?: ProductTourStep['placement']): JoyrideStep['placement'] => {
  if (!placement || placement === 'auto') return 'auto';
  if (placement === 'center') return 'center';
  return placement;
};

type TooltipProps = TooltipRenderProps & {
  labels: (typeof LABELS)[LanguageCode];
  onPrimaryLastStep: () => void;
  targetFound: boolean;
};

const ProductTourTooltip: React.FC<TooltipProps> = ({
  backProps,
  continuous,
  index,
  isLastStep,
  labels,
  onPrimaryLastStep,
  primaryProps,
  skipProps,
  size,
  step,
  targetFound,
  tooltipProps,
}) => {
  const { role: _role, 'aria-label': _ariaLabel, ...restTooltipProps } = tooltipProps;
  const { children: _backChildren, onClick: onBackClick, 'data-action': backAction } = backProps;
  const { children: _primaryChildren, onClick: onPrimaryClick, 'data-action': primaryAction } = primaryProps;
  const { children: _skipChildren, onClick: onSkipClick, 'data-action': skipAction } = skipProps;
  const handlePrimaryClick = (event: React.MouseEvent<HTMLElement>) => {
    onPrimaryClick(event);

    if (continuous && isLastStep) {
      onPrimaryLastStep();
    }
  };

  return (
    <div
      {...restTooltipProps}
      role="dialog"
      className={styles.popover}
      aria-label={String(step.title || step.content || labels.step)}
    >
      <div className={styles.popoverHeader}>
        <span className={styles.kicker}>
          {labels.step} {index + 1}/{size}
        </span>
        <button
          type="button"
          className={styles.skipButton}
          onClick={onSkipClick}
          aria-label={labels.skip}
          data-action={skipAction}
        >
          {labels.skip}
        </button>
      </div>

      {step.title && <h3 className={styles.title}>{String(step.title)}</h3>}
      <p className={styles.description}>{String(step.content || '')}</p>

      {!targetFound && step.target && (
        <p className={styles.helperText}>
          Esta area ainda nao esta visivel. O tour continua mesmo assim.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onBackClick}
          aria-label={labels.back}
          data-action={backAction}
          disabled={index === 0}
        >
          {labels.back}
        </button>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={handlePrimaryClick}
          aria-label={continuous && isLastStep ? labels.done : labels.next}
          data-action={primaryAction}
        >
          {continuous && isLastStep ? labels.done : labels.next}
        </button>
      </div>
    </div>
  );
};

const ProductTour: React.FC<ProductTourProps> = ({ open, steps, locale = 'pt-BR', onClose, onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const completionHandledRef = useRef(false);
  const labels = LABELS[locale] || LABELS['pt-BR'];
  const safeSteps = useMemo(() => steps.filter((step) => Boolean(step.title && step.description)), [steps]);

  useEffect(() => {
    completionHandledRef.current = false;

    if (!open) {
      setStepIndex(0);
      return;
    }

    setStepIndex((current) => Math.min(current, Math.max(0, safeSteps.length - 1)));
  }, [open, safeSteps.length]);

  const resolvedSteps = useMemo(() => {
    return safeSteps.map<JoyrideStep>((step) => {
      const targetFound =
        typeof document !== 'undefined' && step.target ? Boolean(document.querySelector(step.target)) : false;

      return {
        content: step.description,
        data: { targetFound },
        placement: mapPlacement(step.placement),
        skipBeacon: true,
        target: step.target && targetFound ? step.target : 'body',
        title: step.title,
      };
    });
  }, [safeSteps]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const currentStep = safeSteps[stepIndex];

    if (!currentStep?.target || typeof document === 'undefined') {
      return;
    }

    const target = document.querySelector(currentStep.target);

    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }, [open, safeSteps, stepIndex]);

  const completeTour = () => {
    if (completionHandledRef.current) {
      return;
    }

    completionHandledRef.current = true;
    setStepIndex(0);
    onComplete();
  };

  const handleEvent = (event: EventData) => {
    const { action, index, status, type } = event;
    const isFinalAdvance = type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT && index >= resolvedSteps.length - 1;

    if (status === STATUS.FINISHED || isFinalAdvance) {
      completeTour();
      return;
    }

    if (status === STATUS.SKIPPED || action === ACTIONS.CLOSE) {
      setStepIndex(0);
      onClose();
      return;
    }

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const delta = action === ACTIONS.PREV ? -1 : 1;
      setStepIndex(Math.max(0, index + delta));
    }
  };

  if (!open || safeSteps.length === 0) {
    return null;
  }

  return (
    <Joyride
      callback={handleEvent}
      continuous
      disableCloseOnEsc={false}
      disableOverlayClose={false}
      disableScrolling={false}
      hideCloseButton
      run={open}
      scrollDuration={300}
      scrollOffset={20}
      showProgress={false}
      showSkipButton
      spotlightClicks={false}
      spotlightPadding={10}
      stepIndex={stepIndex}
      steps={resolvedSteps}
      styles={{
        options: {
          arrowColor: '#0f172a',
          overlayColor: 'rgba(2, 6, 23, 0.76)',
          primaryColor: '#0891b2',
          spotlightShadow: '0 0 0 1px rgba(103, 232, 249, 0.68), 0 0 32px rgba(34, 211, 238, 0.34)',
          width: 320,
          zIndex: 220,
        },
      }}
      tooltipComponent={(props) => (
        <ProductTourTooltip
          {...props}
          labels={labels}
          onPrimaryLastStep={completeTour}
          targetFound={Boolean((resolvedSteps[props.index]?.data as { targetFound?: boolean } | undefined)?.targetFound)}
        />
      )}
    />
  );
};

export default ProductTour;
