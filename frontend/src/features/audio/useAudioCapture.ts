import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { countPendingAudioChunks } from './audioRetryStore';
import { ChunkRecorder } from './chunkRecorder';
import { queuePendingAudioChunk, retryPendingAudioChunks, uploadAudioChunk } from './chunkUploadService';
import {
  getDefaultAudioInputId,
  listAudioInputDevices,
  requestMicrophonePermission,
} from './microphoneService';
import type { AudioCaptureState, AudioChunkMeta, AudioUploadState } from './types';

type UseAudioCaptureOptions = {
  autoRequest?: boolean;
  answerId?: string;
  sessionId?: string;
  questionId?: string;
  userId?: string;
  chunkTimesliceMs?: number;
  processWithLiveCoach?: boolean;
  onChunkCaptured?: (chunk: Blob, metadata: AudioChunkMeta) => void | Promise<void>;
};

type UseAudioCaptureResult = {
  stream: MediaStream | null;
  state: AudioCaptureState;
  uploadState: AudioUploadState;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  pendingChunkCount: number;
  error: string | null;
  isMicrophoneReady: boolean;
  isRecordingSessionActive: boolean;
  requestPermission: (deviceId?: string) => Promise<MediaStream>;
  selectMicrophone: (deviceId: string) => Promise<void>;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob>;
  retryPending: () => Promise<void>;
};

export const useAudioCapture = (options: UseAudioCaptureOptions = {}): UseAudioCaptureResult => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<AudioCaptureState>('idle');
  const [uploadState, setUploadState] = useState<AudioUploadState>('idle');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [pendingChunkCount, setPendingChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<ChunkRecorder | null>(null);
  const activeUploadsRef = useRef(0);

  const syncPendingChunkCount = useCallback(async () => {
    const count = await countPendingAudioChunks();
    setPendingChunkCount(count);
    return count;
  }, []);

  const syncUploadState = useCallback(
    async (fallback: AudioUploadState = 'idle') => {
      const count = await syncPendingChunkCount();
      if (activeUploadsRef.current > 0) {
        setUploadState('uploading');
        return;
      }
      if (count > 0) {
        setUploadState('retry_pending');
        return;
      }
      setUploadState(fallback);
    },
    [syncPendingChunkCount],
  );

  const refreshDevices = useCallback(async () => {
    const nextDevices = await listAudioInputDevices();
    setDevices(nextDevices);
    if (!selectedDeviceId && nextDevices.length > 0) {
      const defaultId = await getDefaultAudioInputId();
      setSelectedDeviceId(defaultId || nextDevices[0]?.deviceId || null);
    }
  }, [selectedDeviceId]);

  const replaceStream = useCallback((nextStream: MediaStream | null) => {
    setStream((previous) => {
      previous?.getTracks().forEach((track) => track.stop());
      return nextStream;
    });
  }, []);

  const requestPermission = useCallback(async (deviceId?: string) => {
    setError(null);
    setState('requesting_permission');
    try {
      const targetDeviceId = deviceId || selectedDeviceId || (await getDefaultAudioInputId()) || undefined;
      const nextStream = await requestMicrophonePermission(targetDeviceId);
      replaceStream(nextStream);
      const audioTrack = nextStream.getAudioTracks()[0];
      const resolvedDeviceId = audioTrack?.getSettings?.().deviceId || targetDeviceId || null;
      setSelectedDeviceId(resolvedDeviceId);
      await refreshDevices();
      setState('ready');
      return nextStream;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Falha ao acessar o microfone.';
      setError(message);
      setState('error');
      throw nextError;
    }
  }, [refreshDevices, replaceStream, selectedDeviceId]);

  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      if (state === 'recording' || state === 'paused' || state === 'stopping') {
        return;
      }
      await requestPermission(deviceId);
    },
    [requestPermission, state],
  );

  const handleChunk = useCallback(
    async (chunk: Blob, metadata: AudioChunkMeta) => {
      await options.onChunkCaptured?.(chunk, metadata);

      if (!metadata.sessionId) {
        return;
      }

      activeUploadsRef.current += 1;
      setUploadState('uploading');
      try {
        await uploadAudioChunk({
          blob: chunk,
          metadata,
          sessionId: metadata.sessionId,
          userId: options.userId,
          processWithLiveCoach: options.processWithLiveCoach,
        });
      } catch (uploadError) {
        console.warn('Audio chunk upload failed, queueing retry', uploadError);
        await queuePendingAudioChunk({
          blob: chunk,
          metadata,
          sessionId: metadata.sessionId,
          userId: options.userId,
        });
      } finally {
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        await syncUploadState();
      }
    },
    [options, syncUploadState],
  );

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'paused') return;
    let currentStream = stream;
    if (!currentStream) {
      currentStream = await requestPermission();
    }
    if (!currentStream) {
      throw new Error('Microfone indisponivel.');
    }

    setError(null);
    const recorder = new ChunkRecorder(currentStream, {
      answerId: options.answerId,
      timesliceMs: options.chunkTimesliceMs,
      sessionId: options.sessionId,
      questionId: options.questionId,
    });
    recorder.onChunk((chunk, metadata) => {
      void handleChunk(chunk, metadata);
    });
    recorderRef.current = recorder;
    await recorder.start();
    setState('recording');
  }, [
    handleChunk,
    options.answerId,
    options.chunkTimesliceMs,
    options.questionId,
    options.sessionId,
    requestPermission,
    state,
    stream,
  ]);

  const pause = useCallback(() => {
    recorderRef.current?.pause();
    setState((current) => (current === 'recording' ? 'paused' : current));
  }, []);

  const resume = useCallback(() => {
    recorderRef.current?.resume();
    setState((current) => (current === 'paused' ? 'recording' : current));
  }, []);

  const stop = useCallback(async (): Promise<Blob> => {
    if (!recorderRef.current) {
      throw new Error('Nenhuma gravacao em andamento.');
    }
    setState('stopping');
    const blob = await recorderRef.current.stop();
    recorderRef.current = null;
    setState('ready');
    await syncUploadState();
    return blob;
  }, [syncUploadState]);

  const retryPending = useCallback(async () => {
    try {
      setUploadState('uploading');
      await retryPendingAudioChunks({
        processWithLiveCoach: options.processWithLiveCoach,
      });
      await syncUploadState();
    } catch (retryError) {
      console.warn('Audio retry failed', retryError);
      setUploadState('retry_pending');
    }
  }, [options.processWithLiveCoach, syncUploadState]);

  useEffect(() => {
    void syncPendingChunkCount();
  }, [syncPendingChunkCount]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    const handleOnline = () => {
      void retryPending();
    };
    const handleDeviceChange = () => {
      void refreshDevices();
    };

    window.addEventListener('online', handleOnline);
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshDevices, retryPending]);

  useEffect(() => {
    if (!options.autoRequest) return;
    if (state !== 'idle') return;
    void requestPermission().catch(() => undefined);
  }, [options.autoRequest, requestPermission, state]);

  useEffect(() => {
    return () => {
      recorderRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  const isMicrophoneReady = useMemo(
    () => ['ready', 'recording', 'paused', 'stopping'].includes(state),
    [state],
  );
  const isRecordingSessionActive = state === 'recording' || state === 'paused' || state === 'stopping';

  return {
    stream,
    state,
    uploadState,
    devices,
    selectedDeviceId,
    pendingChunkCount,
    error,
    isMicrophoneReady,
    isRecordingSessionActive,
    requestPermission,
    selectMicrophone,
    start,
    pause,
    resume,
    stop,
    retryPending,
  };
};
