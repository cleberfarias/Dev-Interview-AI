import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioRecorderState {
  isRecording: boolean;
  error: string | null;
  start: () => void;
  stop: () => Promise<Blob>;
}

interface AudioRecorderOptions {
  timesliceMs?: number;
  onChunk?: (chunk: Blob) => void;
}

const MIME_TYPE_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

const getRecorderOptions = (): MediaRecorderOptions | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const candidate of MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return { mimeType: candidate };
    }
  }
  return undefined;
};

export const useAudioRecorder = (
  stream: MediaStream | null,
  options: AudioRecorderOptions = {},
): AudioRecorderState => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedMimeTypeRef = useRef<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    setError(null);

    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder indisponivel neste navegador.');
      throw new Error('MediaRecorder not available');
    }

    if (!stream) {
      setError('Stream de audio indisponivel.');
      throw new Error('Audio stream not available');
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      setError('Nenhuma faixa de audio encontrada.');
      throw new Error('No audio tracks found');
    }

    const audioStream = new MediaStream(audioTracks);
    const recorder = new MediaRecorder(audioStream, getRecorderOptions());

    chunksRef.current = [];
    recordedMimeTypeRef.current = recorder.mimeType || '';
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        if (event.data.type) {
          recordedMimeTypeRef.current = event.data.type;
        }
        chunksRef.current.push(event.data);
        options.onChunk?.(event.data);
      }
    };
    recorder.onerror = () => {
      setError('Falha ao gravar audio.');
      setIsRecording(false);
    };

    if (options.timesliceMs && options.timesliceMs > 0) {
      recorder.start(options.timesliceMs);
    } else {
      recorder.start();
    }
    recorderRef.current = recorder;
    setIsRecording(true);
  }, [options, stream]);

  const stop = useCallback(() => {
    return new Promise<Blob>((resolve, reject) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setIsRecording(false);
        reject(new Error('Recorder is not active'));
        return;
      }

      recorder.onstop = () => {
        setIsRecording(false);
        const resolvedMimeType =
          recordedMimeTypeRef.current ||
          chunksRef.current.find((chunk) => chunk.type)?.type ||
          recorder.mimeType ||
          'audio/webm';
        if (chunksRef.current.length === 0) {
          reject(new Error('Recorder returned empty audio'));
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: resolvedMimeType,
        });
        chunksRef.current = [];
        recordedMimeTypeRef.current = '';
        resolve(blob);
      };

      recorder.onerror = () => {
        setIsRecording(false);
        reject(new Error('Recorder stop failed'));
      };
      try {
        recorder.requestData();
      } catch {}
      recorder.stop();
    });
  }, []);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    };
  }, []);

  return { isRecording, error, start, stop };
};
