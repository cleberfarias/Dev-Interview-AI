import { useEffect, useState } from 'react';

export type UserMediaStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UserMediaState {
  stream: MediaStream | null;
  status: UserMediaStatus;
  error: string | null;
}

export const useUserMedia = (constraints: MediaStreamConstraints): UserMediaState => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<UserMediaStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let localStream: MediaStream | null = null;

    const requestMedia = async () => {
      setStatus('loading');
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setError('Media devices indisponiveis neste navegador.');
        return;
      }

      try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!active) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }
        setStream(localStream);
        setStatus('ready');
      } catch (err) {
        if (!active) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Permissao negada para camera/microfone.');
      }
    };

    requestMedia();

    return () => {
      active = false;
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [constraints]);

  return { stream, status, error };
};
