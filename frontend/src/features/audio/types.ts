export type AudioCaptureState =
  | 'idle'
  | 'requesting_permission'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'error';

export type AudioUploadState = 'idle' | 'uploading' | 'retry_pending' | 'error';

export type AudioChunkMeta = {
  answerId?: string;
  chunkId: string;
  chunkIndex: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  sessionId?: string;
  questionId?: string;
};

export type PendingAudioChunk = {
  id: string;
  sessionId: string;
  questionId?: string;
  chunkIndex: number;
  blob: Blob;
  metadata: AudioChunkMeta;
  createdAt: string;
  attempts: number;
  userId?: string;
};

export type AudioChunkUploadResult = {
  ok: boolean;
  chunkId: string;
  duplicate: boolean;
  stored: boolean;
  processedWithLiveCoach: boolean;
  liveCoachStatus?: string | null;
  audioBytes: number;
};
