import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { User as FirebaseUser } from 'firebase/auth';

import { useMe } from '../src/shared/hooks/useAppQueries';
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
});
