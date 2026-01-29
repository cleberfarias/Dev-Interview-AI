import React, { useEffect, useState } from 'react';
import type { User } from '../types';
import { auth } from '../src/lib/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from 'firebase/auth';
import { BackendApi } from '../services/backendApi';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.currentUser?.email) {
      setEmail(auth.currentUser.email);
    }
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser?.email) setEmail(fbUser.email);
    });
    return () => unsub();
  }, []);

  async function afterAuth() {
    // try to get id token and call backend with it immediately
    try {
      console.debug('afterAuth: auth.currentUser=', auth.currentUser);
      const token = await (auth.currentUser ? auth.currentUser.getIdToken(/* forceRefresh */ false) : null);
      console.debug('afterAuth: obtained token length=', token ? token.length : 0);
      const profile = token ? await BackendApi.meWithToken(token) : await BackendApi.me();
      console.debug('afterAuth: profile from backend=', profile);
      onLogin(profile);
    } catch (e) {
      console.error('afterAuth error', e);
      const profile = await BackendApi.me().catch(() => null);
      console.debug('afterAuth fallback profile=', profile);
      if (profile) onLogin(profile as any);
    }
  }

  const handleGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      await afterAuth();
    } catch (e: any) {
      setError(e?.message || 'Falha no login com Google');
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async () => {
    try {
      setLoading(true);
      setError(null);
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      await afterAuth();
    } catch (e: any) {
      setError(e?.message || 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#050a1f] via-[#040813] to-[#02050d] px-6 py-10 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0a0f1f]/80 px-7 py-8 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 h-14 w-14 rounded-2xl bg-[#5860ff] flex items-center justify-center shadow-[0_10px_30px_rgba(88,96,255,0.35)]">
            <span className="text-2xl font-extrabold">D</span>
          </div>
          <h1 className="text-xl font-extrabold tracking-[0.18em]">DEV INTERVIEW</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.35em] text-[#6f7bb0]">Bem-vindo de volta</p>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6f7bb0]">
            E-mail corporativo
          </label>
          <input
            className="w-full rounded-full border border-[#1b2442] bg-[#0b1224] px-5 py-3 text-sm text-white placeholder:text-[#5b6b9a] focus:outline-none focus:ring-2 focus:ring-[#5860ff]/60"
            placeholder="seu@email.com"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6f7bb0]">
            Senha segura
          </label>
          <input
            className="w-full rounded-full border border-[#1b2442] bg-[#0b1224] px-5 py-3 text-sm text-white placeholder:text-[#5b6b9a] focus:outline-none focus:ring-2 focus:ring-[#5860ff]/60"
            placeholder="••••••••"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleEmail}
            disabled={loading || !email || !password}
            className="mt-2 w-full rounded-full bg-white py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#0a0f1f] transition hover:opacity-95 disabled:opacity-60"
          >
            {mode === 'login' ? 'Entrar agora' : 'Criar conta'}
          </button>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-[#4f5a86]">Ou continue com</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-full bg-[#1a73e8] py-3 text-sm font-semibold text-white transition hover:bg-[#1967d2] disabled:opacity-60"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.22 3.23l6.9-6.9C35.83 2.34 30.32 0 24 0 14.64 0 6.5 5.38 2.56 13.22l8.2 6.37C12.62 13.02 17.88 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24c0-1.54-.14-3.02-.4-4.45H24v8.43h12.7c-.55 2.95-2.2 5.45-4.7 7.12l7.2 5.59c4.22-3.9 6.3-9.65 6.3-16.69z" />
              <path fill="#FBBC05" d="M10.76 28.59a14.43 14.43 0 0 1 0-9.18l-8.2-6.37A23.97 23.97 0 0 0 0 24c0 3.88.93 7.55 2.56 10.96l8.2-6.37z" />
              <path fill="#34A853" d="M24 48c6.32 0 11.63-2.08 15.5-5.61l-7.2-5.59c-2 1.35-4.56 2.15-8.3 2.15-6.12 0-11.38-3.52-13.24-8.59l-8.2 6.37C6.5 42.62 14.64 48 24 48z" />
            </svg>
          </span>
          Fazer login com o Google
        </button>

        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="mt-5 w-full text-xs uppercase tracking-[0.35em] text-[#6f7bb0] transition hover:text-white"
        >
          {mode === 'login' ? 'Novo por aqui? Criar conta' : 'Já tem conta? Fazer login'}
        </button>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.45em] text-[#3f4a73]">
          Dev Interview AI - 2025
        </p>
      </div>
    </div>
  );
};

export default Login;
