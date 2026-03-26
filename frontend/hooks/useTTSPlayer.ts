import { useCallback, useEffect, useRef, useState } from 'react';
import { BackendApi } from '../src/shared/services/backendApi';
import {
  clearAudioElementSource,
  getSharedTtsAudioElement,
  setAudioElementSourceFromBase64,
} from '../src/shared/utils/audioPlayback';

interface TTSPlayOptions {
  voiceId?: string;
  language?: string;
}

interface TTSPlayer {
  play: (text: string, voiceId?: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
}

export const useTTSPlayer = (defaultOptions: TTSPlayOptions = {}): TTSPlayer => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef(0);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      clearAudioElementSource(audioRef.current);
    }
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    stopAudio();
    setIsSpeaking(false);
  }, [stopAudio]);

  const play = useCallback(
    async (text: string, voiceId?: string) => {
      const safeText = text?.trim();
      if (!safeText) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      stopAudio();
      setIsSpeaking(true);

      try {
        const response = await BackendApi.tts(
          safeText,
          defaultOptions.language ?? 'pt-BR',
          voiceId ?? defaultOptions.voiceId,
        );

        if (requestIdRef.current !== requestId) return;

        const audio = audioRef.current || getSharedTtsAudioElement();
        if (!audio) {
          throw new Error('TTS audio element unavailable');
        }
        audio.preload = 'auto';
        audio.muted = false;
        audio.volume = 1;
        setAudioElementSourceFromBase64(audio, response);
        audio.load();
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            audio.onended = null;
            audio.onerror = null;
          };

          audio.onended = () => {
            cleanup();
            resolve();
          };

          audio.onerror = () => {
            cleanup();
            reject(new Error('TTS playback failed'));
          };

          audio.play().catch(reject);
        });
      } catch (error) {
        console.warn('TTS play failed', error);
      } finally {
        if (requestIdRef.current === requestId) {
          setIsSpeaking(false);
        }
      }
    },
    [defaultOptions.language, defaultOptions.voiceId, stopAudio],
  );

  useEffect(() => () => stop(), [stop]);

  return { play, stop, isSpeaking };
};
