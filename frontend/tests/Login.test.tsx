import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseState = vi.hoisted(() => ({
  auth: {
    currentUser: null as null | { email: string },
  },
}));

const authMocks = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: firebaseState.auth,
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  createUserWithEmailAndPassword: authMocks.createUserWithEmailAndPassword,
  onAuthStateChanged: authMocks.onAuthStateChanged,
  sendPasswordResetEmail: authMocks.sendPasswordResetEmail,
  signInWithEmailAndPassword: authMocks.signInWithEmailAndPassword,
  signInWithPopup: authMocks.signInWithPopup,
  signInWithRedirect: authMocks.signInWithRedirect,
}));

import Login from '../src/features/auth/components/Login';

describe('Login', () => {
  beforeEach(() => {
    firebaseState.auth.currentUser = null;

    authMocks.createUserWithEmailAndPassword.mockReset().mockResolvedValue(undefined);
    authMocks.sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
    authMocks.signInWithEmailAndPassword.mockReset().mockResolvedValue(undefined);
    authMocks.signInWithPopup.mockReset().mockResolvedValue(undefined);
    authMocks.signInWithRedirect.mockReset().mockResolvedValue(undefined);
    authMocks.onAuthStateChanged.mockReset().mockImplementation((_auth, callback) => {
      callback(null);
      return vi.fn();
    });
  });

  it('submits the login form with labelled inputs and trimmed email', async () => {
    render(<Login onLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' tester@example.com ' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(authMocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
        firebaseState.auth,
        'tester@example.com',
        'secret123',
      );
    });
  });

  it('switches to register mode with dedicated copy and submit action', async () => {
    render(<Login onLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Nao tem conta? Criar conta' }));

    expect(screen.getByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();
    expect(screen.getByText('Use pelo menos 6 caracteres para criar sua senha.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' new-user@example.com ' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(authMocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        firebaseState.auth,
        'new-user@example.com',
        'secret123',
      );
    });
  });

  it('opens a dedicated reset flow without the password field', async () => {
    render(<Login onLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));

    expect(screen.getByRole('heading', { name: 'Redefina sua senha' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' reset@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    await waitFor(() => {
      expect(authMocks.sendPasswordResetEmail).toHaveBeenCalledWith(
        firebaseState.auth,
        'reset@example.com',
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Enviamos o link de redefinicao para reset@example.com.',
      );
    });
  });
});
