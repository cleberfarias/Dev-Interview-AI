import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { InterviewConfig, User } from '../src/shared/types';
import UserProfile from '../src/features/profile/components/UserProfile';

const updateProfileMock = vi.fn();
const getIdTokenMock = vi.fn();
const updateMeNameMock = vi.fn();

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
    getSessionAnalysisTrace: vi.fn(),
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

describe('UserProfile', () => {
  beforeEach(() => {
    updateProfileMock.mockReset();
    getIdTokenMock.mockReset();
    updateMeNameMock.mockReset();
  });

  it('edits and persists the profile name', async () => {
    const onUserUpdated = vi.fn();
    updateProfileMock.mockResolvedValue(undefined);
    getIdTokenMock.mockResolvedValue('fresh-token');
    updateMeNameMock.mockResolvedValue({
      ...baseUser,
      name: 'Cleber Silva',
    });

    render(
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
});
