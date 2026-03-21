import type { SpeechMetrics } from '../../../shared/types';

const MIN_TRANSCRIPT_WORDS = 4;
const MIN_SHORT_TRANSCRIPT_WORDS = 2;
const MIN_SPOKEN_DURATION_MS = 1200;
const MIN_FALLBACK_AUDIO_BYTES = 5000;
const MIN_FALLBACK_DURATION_MS = 1200;

export const countTranscriptWords = (value?: string | null): number =>
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

export const hasMeaningfulAudioAnswer = (
  transcript: string,
  speechMetrics?: SpeechMetrics | null,
): boolean => {
  const wordCount = countTranscriptWords(transcript);
  if (wordCount >= MIN_TRANSCRIPT_WORDS) return true;

  if (!speechMetrics) return false;
  const totalDurationMs = Math.max(0, Number(speechMetrics.totalDurationMs) || 0);
  const silenceDurationMs = Math.max(0, Number(speechMetrics.silenceDurationMs) || 0);
  const spokenDurationMs = Math.max(0, totalDurationMs - silenceDurationMs);
  const silenceRatio = totalDurationMs > 0 ? silenceDurationMs / totalDurationMs : 1;
  const startedSpeaking = Number(speechMetrics.timeToFirstSpeechMs || 0) > 0;

  if (wordCount >= MIN_SHORT_TRANSCRIPT_WORDS && startedSpeaking && silenceRatio < 0.9) {
    return true;
  }

  return startedSpeaking && spokenDurationMs >= MIN_SPOKEN_DURATION_MS;
};

export const shouldAttemptAudioEvaluation = (params: {
  transcript?: string | null;
  speechMetrics?: SpeechMetrics | null;
  audioSize?: number;
  localSpeechDetected?: boolean;
}): boolean => {
  const transcript = String(params.transcript || '');
  if (hasMeaningfulAudioAnswer(transcript, params.speechMetrics)) {
    return true;
  }

  const audioSize = Math.max(0, Number(params.audioSize) || 0);
  const totalDurationMs = Math.max(0, Number(params.speechMetrics?.totalDurationMs) || 0);
  const silenceDurationMs = Math.max(0, Number(params.speechMetrics?.silenceDurationMs) || 0);
  const spokenDurationMs = Math.max(0, totalDurationMs - silenceDurationMs);
  const localSpeechDetected = Boolean(params.localSpeechDetected);
  const metricsDetectedSpeech = Number(params.speechMetrics?.timeToFirstSpeechMs || 0) > 0;

  if ((localSpeechDetected || metricsDetectedSpeech) && spokenDurationMs >= MIN_FALLBACK_DURATION_MS) {
    return true;
  }

  return audioSize >= MIN_FALLBACK_AUDIO_BYTES && totalDurationMs >= MIN_FALLBACK_DURATION_MS;
};
