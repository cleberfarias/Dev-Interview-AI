import React, { useEffect, useState } from 'react';
import type { User } from '../../../shared/types';
import { auth } from '../../../lib/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import styles from './Login.module.css';
import { BackendApi } from '../../../shared/services/backendApi';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin: _onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<'dev' | 'rh'>('dev');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (auth.currentUser?.email) {
      setEmail(auth.currentUser.email);
    }
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser?.email) setEmail(fbUser.email);
    });
    return () => unsub();
  }, []);

  const handleGoogle = async () => {
    let success = false;
    try {
      setLoading(true);
      setError(null);
      setInfo(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      success = true;
    } catch (e: any) {
      setError(e?.message || 'Falha no login com Google');
    } finally {
      if (!success) setLoading(false);
    }
  };

  const handleEmail = async () => {
    let success = false;
    try {
      setLoading(true);
      setError(null);
      setInfo(null);
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        // if registering as RH, create company automatically
        if (role === 'rh') {
          try {
            // ensure firebase auth is fully available and token can be retrieved
            let attempts = 0;
            let tokenAvailable = false;
            while (attempts < 6 && !tokenAvailable) {
              if (auth.currentUser) {
                try {
                  // force refresh once
                  // @ts-ignore
                  await auth.currentUser.getIdToken(true);
                  tokenAvailable = true;
                  break;
                } catch (err) {
                  // wait and retry
                }
              }
              attempts += 1;
              // small delay
              // eslint-disable-next-line no-await-in-loop
              await new Promise((r) => setTimeout(r, 300));
            }

            if (!tokenAvailable) {
              throw new Error('Falha ao autenticar usuario para criar empresa');
            }

            await BackendApi.createCompany({ name: companyName || `${email.split('@')[0]} company`, plan: 'business' });
            setInfo('Conta criada e empresa registrada. Voce ja pode fazer login.');
          } catch (e: any) {
            setError(`Conta criada, porem falha ao criar empresa: ${e?.message || e}`);
          }
        }
      }
      success = true;
    } catch (e: any) {
      setError(e?.message || 'Falha no login');
    } finally {
      if (!success) setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Informe seu e-mail para receber o link de redefinicao.');
      setInfo(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setInfo(null);
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Enviamos um link de redefinicao para seu e-mail.');
    } catch (e: any) {
      setError(e?.message || 'Nao foi possivel enviar o e-mail de redefinicao.');
    } finally {
      setLoading(false);
    }
  };

  const submitLabel = mode === 'login' ? 'Entrar' : 'Criar conta';
  const modeToggleLabel = mode === 'login' ? 'Nao tem conta? Criar conta' : 'Ja tem conta? Entrar';

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <div className={styles.brandBlock}>
            <div className={styles.logoRow}>
              <div className={styles.logoBadge}>
                <img src="/img/logo.png" alt="Dev Interview AI" className="w-full h-full object-contain rounded-xl" />
              </div>
              <h1 className={styles.brandName}>
                Dev Interview <strong>AI</strong>
              </h1>
            </div>
            <p className={styles.tagline}>Domine sua proxima entrevista tecnica com IA</p>
          </div>

          <div className={styles.card}>
            <h2 className={styles.title}>Acesse sua conta</h2>

            {error && <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>}
            {info && <div className={`${styles.alert} ${styles.alertInfo}`}>{info}</div>}

            <label className={styles.label}>E-mail</label>
            <div className={styles.inputWrap}>
              <span className={styles.icon} aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.02-8 4.5V21h16v-2.5C20 16.02 16.4 14 12 14Z" />
                </svg>
              </span>
              <input
                className={styles.input}
                placeholder="seu@email.com"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <label className={styles.label}>Senha</label>
            <div className={styles.inputWrap}>
              <span className={styles.icon} aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4Z" />
                </svg>
              </span>
              <input
                className={styles.input}
                placeholder="••••••••"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className={styles.eyeButton}
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  {showPassword ? (
                    <path d="M3.53 2.47 2.47 3.53l3 3A11.77 11.77 0 0 0 1 12s4 7 11 7a10.86 10.86 0 0 0 5.19-1.28l3.28 3.28 1.06-1.06ZM12 17c-3.74 0-6.56-2.76-8.06-5A10.16 10.16 0 0 1 6.84 8.8l1.73 1.73A4 4 0 0 0 12 16a3.86 3.86 0 0 0 1.47-.29l1.72 1.72A8.33 8.33 0 0 1 12 17Zm0-10a3.9 3.9 0 0 1 2.37.79l1.44 1.44A3.94 3.94 0 0 1 16 12a3.9 3.9 0 0 1-.32 1.56l2.12 2.12A11.77 11.77 0 0 0 23 12s-4-7-11-7a10.86 10.86 0 0 0-3.89.72l1.65 1.65A3.87 3.87 0 0 1 12 7Z" />
                  ) : (
                    <path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7Zm0 12a5 5 0 1 1 5-5 5 5 0 0 1-5 5Zm0-8a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z" />
                  )}
                </svg>
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <label className={styles.label}>Acessar como</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" onClick={() => setRole('dev')} className={`${styles.primaryButton} ${role === 'dev' ? '' : ''}`}>
                  Dev
                </button>
                <button type="button" onClick={() => setRole('rh')} className={`${styles.primaryButton} ${role === 'rh' ? '' : ''}`}>
                  RH
                </button>
              </div>
            </div>

            {mode === 'register' && role === 'rh' && (
              <>
                <label className={styles.label}>Nome da Empresa</label>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    placeholder="Nome da sua empresa"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
              </>
            )}

            {mode === 'login' && (
              <button className={styles.forgot} type="button" onClick={handleForgotPassword} disabled={loading}>
                Esqueceu a senha?
              </button>
            )}

            <button
              onClick={handleEmail}
              disabled={loading || !email || !password}
              className={styles.primaryButton}
            >
              {submitLabel}
            </button>

            <div className={styles.divider}>Ou continue com</div>

            <div className={styles.socialGrid}>
              <button onClick={handleGoogle} disabled={loading} className={styles.socialButton}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.22 3.23l6.9-6.9C35.83 2.34 30.32 0 24 0 14.64 0 6.5 5.38 2.56 13.22l8.2 6.37C12.62 13.02 17.88 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24c0-1.54-.14-3.02-.4-4.45H24v8.43h12.7c-.55 2.95-2.2 5.45-4.7 7.12l7.2 5.59c4.22-3.9 6.3-9.65 6.3-16.69z" />
                  <path fill="#FBBC05" d="M10.76 28.59a14.43 14.43 0 0 1 0-9.18l-8.2-6.37A23.97 23.97 0 0 0 0 24c0 3.88.93 7.55 2.56 10.96l8.2-6.37z" />
                  <path fill="#34A853" d="M24 48c6.32 0 11.63-2.08 15.5-5.61l-7.2-5.59c-2 1.35-4.56 2.15-8.3 2.15-6.12 0-11.38-3.52-13.24-8.59l-8.2 6.37C6.5 42.62 14.64 48 24 48z" />
                </svg>
                Google
              </button>

              <button className={styles.socialButton} type="button" disabled title="Disponivel em breve">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.1.82-.26.82-.58 0-.29-.01-1.06-.02-2.09-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.34-1.74-1.34-1.74-1.1-.76.08-.74.08-.74 1.22.08 1.86 1.25 1.86 1.25 1.07 1.84 2.8 1.31 3.49 1 .11-.78.42-1.31.75-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.35 11.35 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22 0 1.61-.01 2.9-.01 3.3 0 .32.22.69.83.58A12 12 0 0 0 12 .5Z" />
                </svg>
                GitHub
              </button>
            </div>

            <div className={styles.modeSwitch}>
              <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{modeToggleLabel}</button>
            </div>
          </div>

          <p className={styles.foot}>Dev Interview AI</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
