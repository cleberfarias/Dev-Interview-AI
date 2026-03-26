import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { InterviewConfig, User } from '../src/shared/types';
import UserProfile from '../src/features/profile/components/UserProfile';
import { renderWithQueryClient } from './renderWithQueryClient';

const updateProfileMock = vi.fn();
const getIdTokenMock = vi.fn();
const updateMeNameMock = vi.fn();
const getSessionAnalysisTraceMock = vi.fn();

vi.mock('firebase/auth', () => ({
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'user-1',
      getIdToken: (...args: unknown[]) => getIdTokenMock(...args),
    },
  },
}));

vi.mock('../src/shared/services/backendApi', () => ({
  BackendApi: {
    getSessionAnalysisTrace: (...args: unknown[]) => getSessionAnalysisTraceMock(...args),
    updateMeName: (...args: unknown[]) => updateMeNameMock(...args),
  },
}));

vi.mock('../src/features/profile/components/CandidateProfilePanel', () => ({
  default: () => <div>Candidate Profile Panel</div>,
}));

vi.mock('../src/features/live-coach', () => ({
  LiveCoachPreviewCard: () => <div>Live Coach Preview</div>,
}));

const baseUser: User = {
  uid: 'user-1',
  name: 'cleber_afd',
  email: 'cleber_afd@hotmail.com',
  credits: 27,
  interviews: [],
};

const baseConfig: InterviewConfig = {
  uiLanguage: 'pt-BR',
  interviewLanguage: 'pt-BR',
  track: 'frontend',
  seniority: 'mid',
  stacks: ['JavaScript', 'TypeScript', 'React'],
  style: 'friendly',
  duration: 20,
  plan: 'free',
  interviewMode: 'candidate_coaching_mode',
  difficultyLevel: 3,
};

const buildUserWithInterviews = (count: number): User => ({
  ...baseUser,
  interviews: Array.from({ length: count }, (_, index) => ({
    id: `session-${index + 1}`,
    date: `2026-03-${String(23 - index).padStart(2, '0')}T19:51:00.000Z`,
    role: 'Entrevista',
    score: 7 - index * 0.25,
    style: 'friendly',
    track: 'frontend',
  })),
});

describe('UserProfile', () => {
  beforeEach(() => {
    updateProfileMock.mockReset();
    getIdTokenMock.mockReset();
    updateMeNameMock.mockReset();
    getSessionAnalysisTraceMock.mockReset().mockResolvedValue({
      sessionId: 'session-1',
      hasTrace: true,
      analysisTraceSnapshot: {
        capturedAt: '2026-03-24T10:00:00.000Z',
        lastResumeAnalysisTrace: {
          source: 'ai',
          aiProvider: 'openai',
          aiModel: 'gpt-5.4',
        },
      },
    });
  });

  it('edits and persists the profile name', async () => {
    const onUserUpdated = vi.fn();
    updateProfileMock.mockResolvedValue(undefined);
    getIdTokenMock.mockResolvedValue('fresh-token');
    updateMeNameMock.mockResolvedValue({
      ...baseUser,
      name: 'Cleber Silva',
    });

    renderWithQueryClient(
      <UserProfile
        user={baseUser}
        config={baseConfig}
        onBack={vi.fn()}
        onLogout={vi.fn()}
        onAddCredits={vi.fn()}
        onDeleteInterview={vi.fn()}
        onUserUpdated={onUserUpdated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar nome' }));
    fireEvent.change(screen.getByLabelText('Nome que aparece na entrevista'), {
      target: { value: '  Cleber   Silva  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'user-1' }),
        { displayName: 'Cleber Silva' },
      );
    });

    expect(getIdTokenMock).toHaveBeenCalledWith(true);
    expect(updateMeNameMock).toHaveBeenCalledWith('Cleber Silva', 'fresh-token');
    expect(onUserUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'user-1',
        name: 'Cleber Silva',
      }),
    );
  });

  it('paginates session history and keeps secondary actions behind the overflow control', async () => {
    renderWithQueryClient(
      <UserProfile
        user={buildUserWithInterviews(6)}
        config={baseConfig}
        onBack={vi.fn()}
        onLogout={vi.fn()}
        onAddCredits={vi.fn()}
        onDeleteInterview={vi.fn()}
        onOpenInterviewReport={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Ver relatorio' })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Ver trace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir entrevista' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /^Mais acoes da entrevista de/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver trace' }));

    await waitFor(() => {
      expect(getSessionAnalysisTraceMock).toHaveBeenCalledWith('session-1');
    });

    await waitFor(() => {
      expect(screen.getByText(/Capturado em:/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais entrevistas' }));

    expect(screen.getAllByRole('button', { name: 'Ver relatorio' })).toHaveLength(6);
  });
});
