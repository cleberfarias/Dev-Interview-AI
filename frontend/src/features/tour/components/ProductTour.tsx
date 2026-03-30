import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTIONS,
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
  compact: boolean;
  labels: (typeof LABELS)[LanguageCode];
  onPrimaryLastStep: () => void;
  popoverWidth: number;
  targetFound: boolean;
};

const ProductTourTooltip: React.FC<TooltipProps> = ({
  backProps,
  compact,
  continuous,
  index,
  isLastStep,
  labels,
  onPrimaryLastStep,
  popoverWidth,
  primaryProps,
  skipProps,
  size,
  step,
  targetFound,
  tooltipProps,
}) => {
  const { role: _role, 'aria-label': _ariaLabel, style: tooltipStyle, ...restTooltipProps } =
    tooltipProps as TooltipRenderProps & { style?: React.CSSProperties };
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
      style={{
        ...tooltipStyle,
        width: `${popoverWidth}px`,
        maxWidth: compact ? 'calc(100vw - 24px)' : 'calc(100vw - 24px)',
      }}
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
  const [tourInstanceKey, setTourInstanceKey] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
  const completionHandledRef = useRef(false);
  const labels = LABELS[locale] || LABELS['pt-BR'];
  const safeSteps = useMemo(() => steps.filter((step) => Boolean(step.title && step.description)), [steps]);
  const isCompactViewport = viewportWidth <= 640;
  const popoverWidth = isCompactViewport
    ? Math.max(220, Math.min(280, viewportWidth - 24))
    : 320;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewport = () => {
      setViewportWidth(window.innerWidth);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    completionHandledRef.current = false;
    if (open && safeSteps.length > 0) {
      setTourInstanceKey((current) => current + 1);
    }
  }, [open, safeSteps.length]);

  const resolvedSteps = useMemo(() => {
    return safeSteps.map<JoyrideStep>((step) => {
      const targetFound =
        typeof document !== 'undefined' && step.target ? Boolean(document.querySelector(step.target)) : false;

      return {
        content: step.description,
        data: { targetFound },
        floatingOptions: isCompactViewport
          ? {
              hideArrow: true,
            }
          : undefined,
        placement: isCompactViewport ? 'center' : mapPlacement(step.placement),
        skipBeacon: true,
        target: step.target && targetFound ? step.target : 'body',
        title: step.title,
      };
    });
  }, [isCompactViewport, safeSteps]);

  const completeTour = () => {
    if (completionHandledRef.current) {
      return;
    }

    completionHandledRef.current = true;
    onComplete();
  };

  const closeTour = () => {
    if (completionHandledRef.current) {
      return;
    }

    completionHandledRef.current = true;
    onClose();
  };

  const handleEvent = (event: EventData) => {
    const { action, status } = event;

    if (status === STATUS.FINISHED) {
      completeTour();
      return;
    }

    if (status === STATUS.SKIPPED || action === ACTIONS.CLOSE) {
      closeTour();
    }
  };

  if (!open || safeSteps.length === 0) {
    return null;
  }

  return (
    <Joyride
      key={tourInstanceKey}
      callback={handleEvent}
      continuous
      disableCloseOnEsc={false}
      disableOverlayClose={false}
      disableScrolling={false}
      hideCloseButton
      run={open}
      scrollDuration={300}
      scrollOffset={20}
      scrollToFirstStep
      showProgress={false}
      showSkipButton
      spotlightClicks={false}
      steps={resolvedSteps}
      styles={{
        options: {
          arrowColor: '#0f172a',
          overlayColor: 'rgba(2, 6, 23, 0.76)',
          primaryColor: '#0891b2',
          spotlightShadow: '0 0 0 1px rgba(103, 232, 249, 0.68), 0 0 32px rgba(34, 211, 238, 0.34)',
          width: popoverWidth,
          zIndex: 220,
        },
      }}
      spotlightPadding={isCompactViewport ? 6 : 10}
      tooltipComponent={(props) => (
        <ProductTourTooltip
          {...props}
          compact={isCompactViewport}
          labels={labels}
          onPrimaryLastStep={completeTour}
          popoverWidth={popoverWidth}
          targetFound={Boolean((resolvedSteps[props.index]?.data as { targetFound?: boolean } | undefined)?.targetFound)}
        />
      )}
    />
  );
};

export default ProductTour;
