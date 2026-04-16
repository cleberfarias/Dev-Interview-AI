import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { User as FirebaseUser } from 'firebase/auth';

import { useMe, writeCachedUser } from '../src/shared/hooks/useAppQueries';
import { renderWithQueryClient } from './renderWithQueryClient';

const backendApiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  meWithToken: vi.fn(),
}));

vi.mock('../src/shared/services/backendApi', () => ({
  BackendApi: {
    me: (...args: unknown[]) => backendApiMocks.me(...args),
    meWithToken: (...args: unknown[]) => backendApiMocks.meWithToken(...args),
  },
}));

const QueryProbe = ({ firebaseUser }: { firebaseUser: FirebaseUser }) => {
  const query = useMe(firebaseUser);

  return (
    <div>
      <span data-testid="name">{query.data?.name ?? 'sem-nome'}</span>
      <span data-testid="credits">{query.data?.credits ?? -1}</span>
    </div>
  );
};

const firebaseUser = {
  uid: 'user-1',
  displayName: 'Cleber',
  email: 'cleber_afd@hotmail.com',
  photoURL: null,
  getIdToken: vi.fn().mockResolvedValue('fresh-token'),
} as unknown as FirebaseUser;

describe('useMe', () => {
  beforeEach(() => {
    backendApiMocks.me.mockReset();
    backendApiMocks.meWithToken.mockReset();
    (firebaseUser.getIdToken as unknown as ReturnType<typeof vi.fn>).mockClear();
    window.localStorage.clear();
  });

  it('shows placeholder data but still fetches the real /me payload immediately', async () => {
    backendApiMocks.meWithToken.mockResolvedValue({
      uid: 'user-1',
      name: 'Cleber Farias',
      email: 'cleber_afd@hotmail.com',
      credits: 105,
      interviews: [],
      provider: 'firebase',
    });

    renderWithQueryClient(<QueryProbe firebaseUser={firebaseUser} />);

    expect(screen.getByTestId('name')).toHaveTextContent('Cleber');
    expect(screen.getByTestId('credits')).toHaveTextContent('0');

    await waitFor(() => {
      expect(backendApiMocks.meWithToken).toHaveBeenCalledWith('fresh-token');
    });

    await waitFor(() => {
      expect(screen.getByTestId('name')).toHaveTextContent('Cleber Farias');
      expect(screen.getByTestId('credits')).toHaveTextContent('105');
    });
  });

  it('uses the cached profile as placeholder while revalidating /me', async () => {
    writeCachedUser({
      uid: 'user-1',
      name: 'Cleber Cache',
      email: 'cleber_afd@hotmail.com',
      credits: 74,
      interviews: [],
      provider: 'firebase',
      tourCompletions: { dashboard: '2026-04-16T00:00:00.000Z' },
    });
    backendApiMocks.meWithToken.mockResolvedValue({
      uid: 'user-1',
      name: 'Cleber Atualizado',
      email: 'cleber_afd@hotmail.com',
      credits: 75,
      interviews: [],
      provider: 'firebase',
    });

    renderWithQueryClient(<QueryProbe firebaseUser={firebaseUser} />);

    expect(screen.getByTestId('name')).toHaveTextContent('Cleber Cache');
    expect(screen.getByTestId('credits')).toHaveTextContent('74');

    await waitFor(() => {
      expect(screen.getByTestId('name')).toHaveTextContent('Cleber Atualizado');
      expect(screen.getByTestId('credits')).toHaveTextContent('75');
    });
  });
});
