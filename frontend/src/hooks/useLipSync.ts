import { useEffect, useRef, useState } from 'react';

interface LipSyncState {
  mouthOpen: number;
  isSpeaking: boolean;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const useLipSync = (audioEl: HTMLAudioElement | null): LipSyncState => {
  const [mouthOpen, setMouthOpen] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const smoothRef = useRef(0);

  useEffect(() => {
    if (!audioEl) {
      setMouthOpen(0);
      setIsSpeaking(false);
      return;
    }

    let active = true;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    const source = ctx.createMediaElementSource(audioEl);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const data = new Uint8Array(analyser.fftSize);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const handlePlay = () => {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };

    const handleStop = () => {
      smoothRef.current = 0;
      setMouthOpen(0);
      setIsSpeaking(false);
    };

    audioEl.addEventListener('play', handlePlay);
    audioEl.addEventListener('pause', handleStop);
    audioEl.addEventListener('ended', handleStop);

    const update = () => {
      if (!active) return;

      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const target = clamp01(rms * 2.4);

      smoothRef.current = smoothRef.current * 0.65 + target * 0.35;
      const next = audioEl.paused ? 0 : smoothRef.current;

      setMouthOpen((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
      setIsSpeaking(next > 0.02);

      rafRef.current = window.requestAnimationFrame(update);
    };

    rafRef.current = window.requestAnimationFrame(update);

    return () => {
      active = false;
      audioEl.removeEventListener('play', handlePlay);
      audioEl.removeEventListener('pause', handleStop);
      audioEl.removeEventListener('ended', handleStop);

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      source.disconnect();
      analyser.disconnect();
      ctx.close().catch(() => {});

      audioContextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
      smoothRef.current = 0;
    };
  }, [audioEl]);

  return { mouthOpen, isSpeaking };
};
