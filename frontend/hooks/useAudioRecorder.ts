import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioRecorderState {
  isRecording: boolean;
  error: string | null;
  start: () => void;
  stop: () => Promise<Blob>;
}

const getRecorderOptions = (): MediaRecorderOptions | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus' };
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return { mimeType: 'audio/webm' };
  }
  return undefined;
};

export const useAudioRecorder = (stream: MediaStream | null): AudioRecorderState => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onerror = () => {
      setError('Falha ao gravar audio.');
      setIsRecording(false);
    };

    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
  }, [stream]);

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
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        resolve(blob);
      };

      recorder.onerror = () => {
        setIsRecording(false);
        reject(new Error('Recorder stop failed'));
      };

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
