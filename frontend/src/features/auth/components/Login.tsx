import React, { useEffect, useId, useState } from 'react';
import type { User } from '../../../shared/types';
import { auth } from '../../../lib/firebase';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import styles from './Login.module.css';

interface LoginProps {
  onLogin: (user: User) => void;
}

type AuthMode = 'login' | 'register' | 'reset';

const Login: React.FC<LoginProps> = ({ onLogin: _onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const titleId = useId();
  const emailInputId = useId();
  const passwordInputId = useId();
  const helperTextId = useId();
  const errorId = useId();
  const infoId = useId();

  const isLoginMode = mode === 'login';
  const isRegisterMode = mode === 'register';
  const isResetMode = mode === 'reset';

  useEffect(() => {
    if (auth.currentUser?.email) {
      setEmail(auth.currentUser.email);
    }

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser?.email) {
        setEmail(fbUser.email);
      }
    });

    return () => unsub();
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setInfo(null);

    if (nextMode === 'reset') {
      setPassword('');
      setShowPassword(false);
    }
  };

  const handleGoogle = async () => {
    let success = false;

    try {
      setLoading(true);
      setError(null);
      setInfo(null);

      const provider = new GoogleAuthProvider();
      const shouldUseRedirect =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 640px), (pointer: coarse)').matches;

      if (shouldUseRedirect) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }

      success = true;
    } catch (e: any) {
      setError(e?.message || 'Falha no login com Google.');
    } finally {
      if (!success) {
        setLoading(false);
      }
    }
  };

  const handleEmail = async () => {
    const normalizedEmail = email.trim();
    let success = false;

    try {
      setLoading(true);
      setError(null);
      setInfo(null);

      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
      } else {
        await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      }

      success = true;
    } catch (e: any) {
      setError(e?.message || 'Nao foi possivel continuar com este login.');
    } finally {
      if (!success) {
        setLoading(false);
      }
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError('Informe seu e-mail para receber o link de redefinicao.');
      setInfo(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setInfo(null);
      await sendPasswordResetEmail(auth, normalizedEmail);
      setInfo(`Enviamos o link de redefinicao para ${normalizedEmail}.`);
    } catch (e: any) {
      setError(e?.message || 'Nao foi possivel enviar o e-mail de redefinicao.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (isResetMode) {
      await handleForgotPassword();
      return;
    }

    await handleEmail();
  };

  const title = isLoginMode
    ? 'Acesse sua conta'
    : isRegisterMode
      ? 'Crie sua conta'
      : 'Redefina sua senha';
  const subtitle = isLoginMode
    ? 'Entre rapido, continue de onde parou e volte para sua proxima simulacao.'
    : isRegisterMode
      ? 'Configure seu acesso em poucos segundos e comece sua preparacao tecnica.'
      : 'Informe o e-mail da sua conta para receber o link de redefinicao.';
  const submitLabel = loading
    ? isLoginMode
      ? 'Entrando...'
      : isRegisterMode
        ? 'Criando conta...'
        : 'Enviando link...'
    : isLoginMode
      ? 'Entrar'
      : isRegisterMode
        ? 'Criar conta'
        : 'Enviar link';
  const modeToggleLabel = isLoginMode ? 'Nao tem conta? Criar conta' : 'Ja tem conta? Entrar';
  const helperText = isRegisterMode
    ? 'Use pelo menos 6 caracteres para criar sua senha.'
    : isResetMode
      ? 'Se o e-mail estiver cadastrado, voce recebera o link em instantes.'
      : null;
  const emailDescribedBy = [isResetMode ? helperTextId : null, error ? errorId : null, info ? infoId : null]
    .filter(Boolean)
    .join(' ') || undefined;
  const passwordDescribedBy = [isRegisterMode ? helperTextId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ') || undefined;
  const submitDisabled = loading || !email.trim() || (!isResetMode && !password);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.content}>
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

          <section className={styles.card} aria-labelledby={titleId}>
            <div className={styles.header}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              <p className={styles.subtitle}>{subtitle}</p>
            </div>

            {error && (
              <div id={errorId} role="alert" className={`${styles.alert} ${styles.alertError}`}>
                {error}
              </div>
            )}
            {info && (
              <div id={infoId} role="status" aria-live="polite" className={`${styles.alert} ${styles.alertInfo}`}>
                {info}
              </div>
            )}

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <fieldset className={styles.formFieldset} disabled={loading}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor={emailInputId}>
                    E-mail
                  </label>
                  <div className={styles.inputWrap}>
                    <span className={styles.icon} aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.02-8 4.5V21h16v-2.5C20 16.02 16.4 14 12 14Z" />
                      </svg>
                    </span>
                    <input
                      id={emailInputId}
                      className={styles.input}
                      name="email"
                      placeholder="seu@email.com"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      enterKeyHint={isResetMode ? 'send' : 'next'}
                      inputMode="email"
                      required
                      spellCheck={false}
                      value={email}
                      aria-describedby={emailDescribedBy}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {!isResetMode && (
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor={passwordInputId}>
                      Senha
                    </label>
                    <div className={styles.inputWrap}>
                      <span className={styles.icon} aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4Z" />
                        </svg>
                      </span>
                      <input
                        id={passwordInputId}
                        className={styles.input}
                        name="password"
                        placeholder={isRegisterMode ? 'Crie uma senha segura' : 'Digite sua senha'}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                        enterKeyHint="go"
                        required
                        value={password}
                        aria-describedby={passwordDescribedBy}
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
                  </div>
                )}

                {helperText && (
                  <p id={helperTextId} className={styles.helperText}>
                    {helperText}
                  </p>
                )}

                {isLoginMode && (
                  <div className={styles.inlineActions}>
                    <button
                      className={styles.secondaryLink}
                      type="button"
                      onClick={() => switchMode('reset')}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                )}

                <button type="submit" disabled={submitDisabled} className={styles.primaryButton}>
                  {submitLabel}
                </button>
              </fieldset>
            </form>

            {!isResetMode && (
              <>
                <div className={styles.divider}>Ou continue com</div>

                <div className={styles.socialGrid}>
                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={loading}
                    className={styles.socialButton}
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.22 3.23l6.9-6.9C35.83 2.34 30.32 0 24 0 14.64 0 6.5 5.38 2.56 13.22l8.2 6.37C12.62 13.02 17.88 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.5 24c0-1.54-.14-3.02-.4-4.45H24v8.43h12.7c-.55 2.95-2.2 5.45-4.7 7.12l7.2 5.59c4.22-3.9 6.3-9.65 6.3-16.69z" />
                      <path fill="#FBBC05" d="M10.76 28.59a14.43 14.43 0 0 1 0-9.18l-8.2-6.37A23.97 23.97 0 0 0 0 24c0 3.88.93 7.55 2.56 10.96l8.2-6.37z" />
                      <path fill="#34A853" d="M24 48c6.32 0 11.63-2.08 15.5-5.61l-7.2-5.59c-2 1.35-4.56 2.15-8.3 2.15-6.12 0-11.38-3.52-13.24-8.59l-8.2 6.37C6.5 42.62 14.64 48 24 48z" />
                    </svg>
                    Continuar com Google
                  </button>
                </div>

                <p className={styles.socialHint}>GitHub entra em breve.</p>
              </>
            )}

            <div className={styles.modeSwitch}>
              {isResetMode ? (
                <button type="button" onClick={() => switchMode('login')} disabled={loading}>
                  Voltar para entrar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode(isLoginMode ? 'register' : 'login')}
                  disabled={loading}
                >
                  {modeToggleLabel}
                </button>
              )}
            </div>
          </section>

          <p className={styles.foot}>Dev Interview AI</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
