import React, { useEffect, useMemo, useState } from 'react';
import type { AvatarResponse } from '../../shared/types';
import styles from './AvatarRenderer.module.css';
import AvatarThreeScene from './AvatarThreeScene';

type AvatarInterviewState = 'idle' | 'avatar_listening' | 'avatar_thinking' | 'avatar_speaking';

interface AvatarRendererProps {
  avatar?: AvatarResponse | null;
  state?: AvatarInterviewState;
}

const stateClassName = (state: AvatarInterviewState) => {
  if (state === 'avatar_speaking') return styles.speaking;
  if (state === 'avatar_thinking') return styles.thinking;
  if (state === 'avatar_listening') return styles.listening;
  return '';
};

const VISEME_MOUTH_OPEN: Record<string, number> = {
  REST: 0.08,
  A: 0.94,
  E: 0.73,
  I: 0.52,
  O: 0.81,
  U: 0.62,
  MBP: 0.16,
  FV: 0.2,
  L: 0.24,
  R: 0.22,
  S: 0.2,
  T: 0.18,
  K: 0.18,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const AvatarRenderer: React.FC<AvatarRendererProps> = ({ avatar, state = 'idle' }) => {
  const frames = avatar?.lipsync?.frames || [];
  const [frameIndex, setFrameIndex] = useState(0);
  const durationMs = Math.max(300, Number(avatar?.lipsync?.durationMs || frames.length * 90));

  useEffect(() => {
    setFrameIndex(0);
  }, [avatar?.audio, frames.length]);

  useEffect(() => {
    if (state !== 'avatar_speaking' || frames.length <= 0) {
      setFrameIndex(0);
      return;
    }
    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsedSec = (((now - start) % durationMs) / 1000);
      let idx = 0;
      for (let i = 0; i < frames.length; i += 1) {
        if ((frames[i]?.time || 0) <= elapsedSec) {
          idx = i;
        } else {
          break;
        }
      }
      setFrameIndex(idx);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [durationMs, frames, state]);

  const currentViseme = useMemo(() => {
    if (!frames.length) return 'REST';
    return frames[Math.min(frameIndex, frames.length - 1)]?.viseme || 'REST';
  }, [frameIndex, frames]);

  const mouthOpen = useMemo(() => {
    const viseme = String(currentViseme || 'REST').toUpperCase();
    const base = VISEME_MOUTH_OPEN[viseme] ?? 0.1;
    if (state !== 'avatar_speaking') {
      if (state === 'avatar_listening') return 0.11;
      if (state === 'avatar_thinking') return 0.09;
      return 0.07;
    }
    return clamp(base, 0.05, 1);
  }, [currentViseme, state]);

  return (
    <article className={`${styles.card} ${stateClassName(state)}`} aria-label="Avatar entrevistador">
      <header className={styles.header}>
        <h3 className={styles.title}>Entrevistador IA</h3>
        <span className={styles.emotion}>{avatar?.emotion || 'neutral'}</span>
      </header>

      <div className={styles.scene}>
        <AvatarThreeScene
          className={styles.sceneCanvas}
          state={state}
          mouthOpen={mouthOpen}
          emotion={avatar?.emotion || 'neutral'}
        />
      </div>

      <footer className={styles.footer}>
        <span className={styles.viseme}>viseme: {currentViseme}</span>
        <span className={styles.provider}>{avatar?.ttsProvider || 'fallback'}</span>
      </footer>
    </article>
  );
};

export default AvatarRenderer;
