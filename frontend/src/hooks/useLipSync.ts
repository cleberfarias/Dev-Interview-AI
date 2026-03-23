import { useEffect, useState } from 'react';

interface LipSyncState {
  mouthOpen: number;
  isSpeaking: boolean;
}

const isAudioPlaying = (audioEl: HTMLAudioElement) =>
  !audioEl.paused && !audioEl.ended && audioEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

export const useLipSync = (audioEl: HTMLAudioElement | null): LipSyncState => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!audioEl) {
      setIsSpeaking(false);
      return;
    }

    const syncPlaybackState = () => {
      setIsSpeaking(isAudioPlaying(audioEl));
    };

    syncPlaybackState();

    const playbackEvents = ['play', 'playing', 'pause', 'ended', 'waiting', 'stalled', 'emptied', 'suspend', 'error'];
    playbackEvents.forEach((eventName) => {
      audioEl.addEventListener(eventName, syncPlaybackState);
    });

    let rafId: number | null = null;
    const tick = () => {
      syncPlaybackState();
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      playbackEvents.forEach((eventName) => {
        audioEl.removeEventListener(eventName, syncPlaybackState);
      });
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      setIsSpeaking(false);
    };
  }, [audioEl]);

  return { mouthOpen: 0, isSpeaking };
};
