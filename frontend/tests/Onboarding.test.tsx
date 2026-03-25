import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Onboarding from '../src/features/onboarding/components/Onboarding';
import type { InterviewConfig } from '../src/shared/types';

const baseConfig: InterviewConfig = {
  uiLanguage: 'pt-BR',
  interviewLanguage: 'pt-BR',
  track: 'frontend',
  seniority: 'mid',
  stacks: ['React'],
  style: 'friendly',
  duration: 10,
  plan: 'free',
  interviewMode: 'candidate_coaching_mode',
};

describe('Onboarding', () => {
  beforeEach(() => {
    (window as Window & { aistudio?: { openSelectKey?: () => Promise<void> } }).aistudio = undefined;
  });

  it('keeps a compact interview summary visible while the user moves through steps', () => {
    render(<Onboarding onComplete={vi.fn()} initialConfig={baseConfig} />);

    const summary = screen.getByLabelText('Resumo da entrevista');

    expect(within(summary).getByText('Standard')).toBeInTheDocument();
    expect(within(summary).getByText('Frontend')).toBeInTheDocument();
    expect(within(summary).getByText('1 selecionadas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));

    expect(within(summary).getByText('Mobile')).toBeInTheDocument();
  });

  it('finishes the setup flow from the final step', () => {
    const onComplete = vi.fn();

    render(<Onboarding onComplete={onComplete} initialConfig={baseConfig} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Entrevista' }));

    expect(onComplete).toHaveBeenCalledWith(baseConfig);
  });
});
