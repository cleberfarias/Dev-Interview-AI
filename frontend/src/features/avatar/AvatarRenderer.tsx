import React, { useEffect, useMemo, useState } from 'react';
import type { AvatarResponse } from '../../shared/types';
import styles from './AvatarRenderer.module.css';
import AvatarThreeScene from './AvatarThreeScene';

type AvatarInterviewState = 'idle' | 'avatar_listening' | 'avatar_thinking' | 'avatar_speaking';

interface AvatarRendererProps {
  avatar?: AvatarResponse | null;
  state?: AvatarInterviewState;
  liveMouthOpen?: number;
}

const stateClassName = (state: AvatarInterviewState) => {
  if (state === 'avatar_speaking') return styles.speaking;
  if (state === 'avatar_thinking') return styles.thinking;
  if (state === 'avatar_listening') return styles.listening;
  return '';
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const PORTRAIT_SRC = '/img/avatar-femin.png';

const VISEME_MOUTH_OPEN: Record<string, number> = {
  REST: 0.08,
  A: 0.94,
  E: 0.73,
  I: 0.52,
  O: 0.81,
  U: 0.62,
  MBP: 0.1,
  FV: 0.2,
  L: 0.24,
  R: 0.22,
  S: 0.18,
  T: 0.16,
  K: 0.18,
};

const EMOTION_LABELS: Record<string, string> = {
  neutral: 'Neutra',
  happy: 'Positiva',
  curious: 'Curiosa',
  encouraging: 'Confiante',
};

const STATE_LABELS: Record<AvatarInterviewState, string> = {
  idle: 'Pronta',
  avatar_listening: 'Ouvindo',
  avatar_thinking: 'Analisando',
  avatar_speaking: 'Falando',
};

const STATE_TEXT: Record<AvatarInterviewState, string> = {
  idle: 'Entrevistadora pronta para iniciar a conversa.',
  avatar_listening: 'Ouvindo sua resposta e aguardando o fechamento da ideia.',
  avatar_thinking: 'Processando contexto para formular a próxima interação.',
  avatar_speaking: 'Conduzindo a pergunta atual com resposta por voz.',
};

const AvatarRenderer: React.FC<AvatarRendererProps> = ({
  avatar,
  state = 'idle' as AvatarInterviewState,
  liveMouthOpen = 0,
}) => {
  const frames = avatar?.lipsync?.frames || [];
  const [frameIndex, setFrameIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [idleTime, setIdleTime] = useState(0);

  const durationMs = Math.max(300, Number(avatar?.lipsync?.durationMs || frames.length * 90));

  useEffect(() => {
    setFrameIndex(0);
  }, [avatar?.audio, frames.length]);

  useEffect(() => {
    setImageError(false);
  }, [avatar?.audio]);

  useEffect(() => {
    let rafId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      setIdleTime((now - start) / 1000);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

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

  useEffect(() => {
    let blinkTimeout: number;
    let closeTimeout: number;

    const scheduleBlink = () => {
      const delay = 1800 + Math.random() * 2600;
      blinkTimeout = window.setTimeout(() => {
        setIsBlinking(true);

        closeTimeout = window.setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 120);
      }, delay);
    };

    scheduleBlink();

    return () => {
      window.clearTimeout(blinkTimeout);
      window.clearTimeout(closeTimeout);
    };
  }, []);

  const currentViseme = useMemo(() => {
    if (!frames.length) return 'REST';
    return frames[Math.min(frameIndex, frames.length - 1)]?.viseme || 'REST';
  }, [frameIndex, frames]);

  const mouthOpenFromViseme = useMemo(() => {
    const viseme = String(currentViseme || 'REST').toUpperCase();
    const base = VISEME_MOUTH_OPEN[viseme] ?? 0.1;

    if (state !== 'avatar_speaking') {
      if (state === 'avatar_listening') return 0.08;
      if (state === 'avatar_thinking') return 0.06;
      return 0.05;
    }

    return clamp(base, 0.04, 1);
  }, [currentViseme, state]);

  const mouthOpen = useMemo(() => {
    const liveValue = clamp(Number(liveMouthOpen || 0), 0, 1);

    if (state !== 'avatar_speaking') {
      return mouthOpenFromViseme;
    }

    if (liveValue > 0.015) {
      return clamp(liveValue * 1.4, 0.05, 1);
    }

    return clamp(mouthOpenFromViseme * 0.18, 0.05, 0.24);
  }, [liveMouthOpen, mouthOpenFromViseme, state]);

  const emotionKey = String(avatar?.emotion || 'neutral').toLowerCase();
  const emotionLabel = EMOTION_LABELS[emotionKey] || 'Neutra';
  const providerLabel = avatar?.ttsProvider ? String(avatar.ttsProvider).toUpperCase() : 'NEURAL';
  const statusLabel = STATE_LABELS[state];
  const renderThreeScene = imageError;

  const breathingOffset = useMemo(() => Math.sin(idleTime * 1.8) * 1.8, [idleTime]);
  const headTilt = useMemo(() => Math.sin(idleTime * 0.9) * 0.8, [idleTime]);
  const subtleX = useMemo(() => Math.sin(idleTime * 0.7) * 2.2, [idleTime]);

  const portraitTransform = useMemo(() => {
    const translateX =
      subtleX +
      (state === 'avatar_listening' ? 2 : 0) +
      (state === 'avatar_thinking' ? -2 : 0);

    const translateY =
      breathingOffset +
      (state === 'avatar_speaking' ? -(4 + mouthOpen * 2.2) : 0) +
      (state === 'avatar_thinking' ? -2 : -1);

    const rotate =
      headTilt +
      (state === 'avatar_listening' ? 0.6 : 0) +
      (state === 'avatar_thinking' ? -0.8 : 0);

    const scale =
      state === 'avatar_speaking'
        ? 1.018 + mouthOpen * 0.018
        : state === 'avatar_listening'
        ? 1.012
        : 1.008;

    return `translate3d(${translateX}px, ${translateY}px, 0) rotate(${rotate}deg) scale(${scale})`;
  }, [breathingOffset, headTilt, mouthOpen, state, subtleX]);

  const mouthPreset = useMemo(() => {
    const viseme = String(currentViseme || 'REST').toUpperCase();

    const presets: Record<string, { sx: number; sy: number; y: number; r: number }> = {
      REST: { sx: 1, sy: 0.3, y: 0, r: 0 },
      A: { sx: 0.95, sy: 1.18, y: 2, r: 0 },
      E: { sx: 1.28, sy: 0.56, y: 0, r: 0 },
      I: { sx: 1.34, sy: 0.4, y: 0, r: 0 },
      O: { sx: 0.84, sy: 1.0, y: 1, r: 0 },
      U: { sx: 0.74, sy: 0.8, y: 1, r: 0 },
      MBP: { sx: 0.96, sy: 0.12, y: -1, r: 0 },
      FV: { sx: 1.12, sy: 0.22, y: 0, r: -1 },
      L: { sx: 1.08, sy: 0.46, y: 0, r: 1 },
      R: { sx: 1.02, sy: 0.5, y: 1, r: 0 },
      S: { sx: 1.18, sy: 0.18, y: 0, r: 0 },
      T: { sx: 1.08, sy: 0.14, y: -1, r: 0 },
      K: { sx: 0.92, sy: 0.34, y: 1, r: 0 },
    };

    return presets[viseme] || presets.REST;
  }, [currentViseme]);

  const mouthOpacity = useMemo(() => {
    if (state !== 'avatar_speaking') return 0.08;
    return clamp(0.14 + mouthOpen * 0.24, 0.14, 0.34);
  }, [mouthOpen, state]);

  const jawOpacity = useMemo(() => {
    if (state !== 'avatar_speaking') return 0.08;
    return clamp(0.1 + mouthOpen * 0.16, 0.1, 0.22);
  }, [mouthOpen, state]);

  const voiceLevel = useMemo(() => {
    const base = state === 'avatar_speaking' ? 0.4 + mouthOpen * 0.72 : 0.26;
    return clamp(base, 0.24, 1);
  }, [mouthOpen, state]);

  const eyeScaleY = isBlinking ? 0.08 : 1;
  const eyeTranslateY = isBlinking ? 2 : 0;

  return (
    <article className={`${styles.card} ${stateClassName(state)}`} aria-label="Avatar entrevistador">
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>Entrevistadora virtual</span>
          <h3 className={styles.title}>Avatar de entrevista</h3>
          <p className={styles.subtitle}>{STATE_TEXT[state]}</p>
        </div>

        <div className={styles.metaGroup}>
          <span className={styles.providerChip}>{providerLabel}</span>
          <span className={styles.emotion}>{emotionLabel}</span>
        </div>
      </header>

      <div className={styles.scene}>
        <div className={styles.sceneGlow} aria-hidden="true" />
        <div className={styles.liveBadge}>{statusLabel}</div>

        {renderThreeScene ? (
          <AvatarThreeScene
            className={styles.sceneCanvas}
            state={state}
            mouthOpen={mouthOpen}
            emotion={avatar?.emotion || 'neutral'}
          />
        ) : (
          <div className={styles.portraitStage}>
            <img
              src={PORTRAIT_SRC}
              alt="Entrevistadora virtual"
              className={styles.portrait}
              style={{ transform: portraitTransform }}
              onError={() => setImageError(true)}
            />

            <div className={styles.faceVeil} aria-hidden="true" />
            <div className={styles.faceFocus} aria-hidden="true" />
            <div className={styles.orbitHighlight} aria-hidden="true" />

            <div
              className={styles.eyeMask}
              aria-hidden="true"
              style={{
                transform: `translateY(${eyeTranslateY}px) scaleY(${eyeScaleY})`,
              }}
            />

            <div
              className={styles.jawShadow}
              aria-hidden="true"
              style={{ opacity: jawOpacity }}
            />

            <div className={styles.mouthRig} aria-hidden="true" style={{ opacity: mouthOpacity }}>
              <span
                className={styles.mouthShadow}
                style={{
                  transform: `translateX(-50%) translateY(${mouthPreset.y}px) rotate(${mouthPreset.r}deg) scale(${mouthPreset.sx}, ${mouthPreset.sy})`,
                }}
              />
              <span
                className={styles.mouthHighlight}
                style={{
                  transform: `translateX(-50%) translateY(${mouthPreset.y}px) scale(${0.96 + mouthOpen * 0.08}, ${0.54 + mouthOpen * 0.48})`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <div>
          <span className={styles.statusLabel}>{statusLabel}</span>
          <p className={styles.footerText}>{STATE_TEXT[state]}</p>
        </div>

        <div className={styles.voiceBand} aria-hidden="true">
          <span className={styles.voiceBar} style={{ transform: `scaleY(${voiceLevel})` }} />
          <span className={styles.voiceBar} style={{ transform: `scaleY(${Math.max(0.3, voiceLevel * 0.78)})` }} />
          <span className={styles.voiceBar} style={{ transform: `scaleY(${Math.max(0.32, voiceLevel * 1.04)})` }} />
          <span className={styles.voiceBar} style={{ transform: `scaleY(${Math.max(0.26, voiceLevel * 0.62)})` }} />
        </div>
      </footer>
    </article>
  );
};

export default AvatarRenderer;
