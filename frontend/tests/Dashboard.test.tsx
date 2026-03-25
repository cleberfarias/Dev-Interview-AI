import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendApiMocks = vi.hoisted(() => ({
  getSessionAnalysisTrace: vi.fn(),
}));

vi.mock('../src/shared/services/backendApi', () => ({
  BackendApi: {
    getSessionAnalysisTrace: backendApiMocks.getSessionAnalysisTrace,
  },
}));

import Dashboard from '../src/features/dashboard/components/Dashboard';
import type { CandidateProfile, User } from '../src/shared/types';

const buildUser = (): User => ({
  uid: 'user-1',
  name: 'Cleber Farias',
  email: 'cleber_afd@hotmail.com',
  credits: 8,
  provider: 'firebase',
  interviews: [
    {
      id: 'session-1',
      date: '2026-03-23T19:51:00.000Z',
      role: 'Entrevista',
      score: 4.66,
      style: 'friendly',
      track: 'frontend',
    },
  ],
});

const buildCandidateProfile = (): CandidateProfile => ({
  userId: 'user-1',
  targetRole: 'Frontend Engineer',
  experienceLevel: 'mid',
  primarySkills: ['JavaScript', 'TypeScript', 'React'],
  weakSkills: ['Go'],
  resumeSummary: 'Desenvolvedor focado em React e TypeScript.',
  jobDescription: 'Vaga frontend com foco em sistemas escalaveis.',
});

describe('Dashboard', () => {
  beforeEach(() => {
    backendApiMocks.getSessionAnalysisTrace.mockReset().mockResolvedValue({
      sessionId: 'session-1',
      hasTrace: true,
      analysisTraceSnapshot: {
        capturedAt: '2026-03-24T10:00:00.000Z',
        lastResumeAnalysisTrace: {
          source: 'ai',
          aiProvider: 'openai',
          aiModel: 'gpt-5.4',
        },
        lastJobAnalysisTrace: {
          source: 'heuristic',
        },
      },
    });
  });

  it('prioritizes the main hero CTA', () => {
    const onStartInterview = vi.fn();

    render(
      <Dashboard
        user={buildUser()}
        candidateProfile={buildCandidateProfile()}
        onStartInterview={onStartInterview}
        onOpenProfile={vi.fn()}
        onOpenInterviewReport={vi.fn()}
        onDeleteInterview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Comecar entrevista' }));

    expect(onStartInterview).toHaveBeenCalledTimes(1);
  });

  it('reveals secondary activity actions behind the overflow control', async () => {
    render(
      <Dashboard
        user={buildUser()}
        candidateProfile={buildCandidateProfile()}
        onStartInterview={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenInterviewReport={vi.fn()}
        onDeleteInterview={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ver trace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir entrevista' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Mais acoes da entrevista/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Ver trace' }));

    await waitFor(() => {
      expect(backendApiMocks.getSessionAnalysisTrace).toHaveBeenCalledWith('session-1');
    });

    await waitFor(() => {
      expect(screen.getByText(/Capturado em:/)).toBeInTheDocument();
    });
  });

  it('keeps profile signals structured without rendering the raw resume summary', () => {
    const onOpenProfile = vi.fn();

    render(
      <Dashboard
        user={buildUser()}
        candidateProfile={buildCandidateProfile()}
        onStartInterview={vi.fn()}
        onOpenProfile={onOpenProfile}
        onOpenInterviewReport={vi.fn()}
        onDeleteInterview={vi.fn()}
      />,
    );

    expect(screen.queryByText('Desenvolvedor focado em React e TypeScript.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar perfil completo' }));

    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });
});
