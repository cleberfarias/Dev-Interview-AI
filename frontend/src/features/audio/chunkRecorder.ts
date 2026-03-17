import type { AudioChunkMeta } from './types';

export type ChunkCallback = (chunk: Blob, metadata: AudioChunkMeta) => void;

type ChunkRecorderOptions = {
  answerId?: string;
  timesliceMs?: number;
  sessionId?: string;
  questionId?: string;
};

const MIME_TYPE_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

const nowIso = () => new Date().toISOString();

const getRecorderOptions = (): MediaRecorderOptions | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const candidate of MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return { mimeType: candidate };
    }
  }
  return undefined;
};

const buildChunkId = (sessionId: string | undefined, questionId: string | undefined, chunkIndex: number) =>
  [sessionId || 'session', questionId || 'question', String(chunkIndex)].join('__');

export class ChunkRecorder {
  private readonly callbacks = new Set<ChunkCallback>();
  private readonly chunks: Blob[] = [];
  private recorder: MediaRecorder | null = null;
  private chunkIndex = 0;
  private chunkStartedAt = '';
  private mimeType = 'audio/webm';

  constructor(
    private readonly stream: MediaStream,
    private readonly options: ChunkRecorderOptions = {},
  ) {}

  onChunk(callback: ChunkCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  async start(): Promise<void> {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder indisponivel neste navegador.');
    }
    if (this.recorder && this.recorder.state !== 'inactive') {
      return;
    }

    const audioTracks = this.stream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error('Nenhuma faixa de audio disponivel para gravacao.');
    }

    const audioStream = new MediaStream(audioTracks);
    this.recorder = new MediaRecorder(audioStream, getRecorderOptions());
    this.mimeType = this.recorder.mimeType || 'audio/webm';
    this.chunks.length = 0;
    this.chunkIndex = 0;
    this.chunkStartedAt = nowIso();

    this.recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size <= 0) return;

      const endedAt = nowIso();
      const startedAt = this.chunkStartedAt || endedAt;
      this.chunkIndex += 1;
      this.chunks.push(event.data);

      const metadata: AudioChunkMeta = {
        answerId: this.options.answerId,
        chunkId: buildChunkId(this.options.sessionId, this.options.questionId, this.chunkIndex),
        chunkIndex: this.chunkIndex,
        startedAt,
        endedAt,
        durationMs: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
        sessionId: this.options.sessionId,
        questionId: this.options.questionId,
      };

      this.callbacks.forEach((callback) => callback(event.data, metadata));
      this.chunkStartedAt = endedAt;
    };

    if (this.options.timesliceMs && this.options.timesliceMs > 0) {
      this.recorder.start(this.options.timesliceMs);
    } else {
      this.recorder.start();
    }
  }

  pause(): void {
    if (!this.recorder || this.recorder.state !== 'recording') return;
    try {
      this.recorder.requestData();
    } catch {}
    this.recorder.pause();
  }

  resume(): void {
    if (!this.recorder || this.recorder.state !== 'paused') return;
    this.chunkStartedAt = nowIso();
    this.recorder.resume();
  }

  async stop(): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        reject(new Error('Recorder is not active'));
        return;
      }

      const recorder = this.recorder;
      recorder.onstop = () => {
        if (!this.chunks.length) {
          reject(new Error('Recorder returned empty audio'));
          return;
        }
        const blob = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
        this.chunks.length = 0;
        this.recorder = null;
        resolve(blob);
      };
      recorder.onerror = () => {
        this.recorder = null;
        reject(new Error('Recorder stop failed'));
      };

      try {
        recorder.requestData();
      } catch {}
      recorder.stop();
    });
  }
}
