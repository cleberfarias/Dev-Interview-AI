import { BackendApi } from '../../shared/services/backendApi';
import {
  incrementPendingAudioChunkAttempts,
  listPendingAudioChunks,
  removePendingAudioChunk,
  savePendingAudioChunk,
} from './audioRetryStore';
import type { AudioChunkMeta, AudioChunkUploadResult, PendingAudioChunk } from './types';

export async function uploadAudioChunk(params: {
  blob: Blob;
  metadata: AudioChunkMeta;
  sessionId: string;
  userId?: string;
  processWithLiveCoach?: boolean;
}): Promise<AudioChunkUploadResult> {
  return BackendApi.uploadAudioChunk({
    sessionId: params.sessionId,
    questionId: params.metadata.questionId,
    chunkId: params.metadata.chunkId,
    chunkIndex: params.metadata.chunkIndex,
    startedAt: params.metadata.startedAt,
    endedAt: params.metadata.endedAt,
    durationMs: params.metadata.durationMs,
    mimeType: params.blob.type || 'audio/webm',
    file: params.blob,
    processWithLiveCoach: Boolean(params.processWithLiveCoach),
  });
}

export async function queuePendingAudioChunk(params: {
  blob: Blob;
  metadata: AudioChunkMeta;
  sessionId: string;
  userId?: string;
}): Promise<void> {
  const pending: PendingAudioChunk = {
    id: params.metadata.chunkId,
    sessionId: params.sessionId,
    questionId: params.metadata.questionId,
    chunkIndex: params.metadata.chunkIndex,
    blob: params.blob,
    metadata: params.metadata,
    createdAt: new Date().toISOString(),
    attempts: 0,
    userId: params.userId,
  };
  await savePendingAudioChunk(pending);
}

export async function retryPendingAudioChunks(options: {
  processWithLiveCoach?: boolean;
} = {}): Promise<{ uploaded: number; failed: number }> {
  const pendingChunks = await listPendingAudioChunks();
  let uploaded = 0;
  let failed = 0;

  for (const pending of pendingChunks) {
    try {
      await uploadAudioChunk({
        blob: pending.blob,
        metadata: pending.metadata,
        sessionId: pending.sessionId,
        userId: pending.userId,
        processWithLiveCoach: options.processWithLiveCoach,
      });
      await removePendingAudioChunk(pending.id);
      uploaded += 1;
    } catch {
      await incrementPendingAudioChunkAttempts(pending.id);
      failed += 1;
    }
  }

  return { uploaded, failed };
}
