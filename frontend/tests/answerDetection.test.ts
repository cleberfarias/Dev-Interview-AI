import { describe, expect, it } from 'vitest';

import { hasMeaningfulAudioAnswer, shouldAttemptAudioEvaluation } from '../src/features/interview/components/answerDetection';
import type { SpeechMetrics } from '../src/shared/types';

const metrics = (overrides: Partial<SpeechMetrics> = {}): SpeechMetrics => ({
  answerId: 'answer-1',
  timeToFirstSpeechMs: 450,
  totalDurationMs: 4200,
  silenceDurationMs: 900,
  pauseCount: 2,
  longPauseCount: 0,
  fillerCount: 0,
  hesitationMarkers: [],
  interruptionRecoveryCount: 0,
  fluencyScore: 7.4,
  fluencyLevel: 'moderate',
  ...overrides,
});

describe('answerDetection', () => {
  it('accepts a clear transcript', () => {
    expect(hasMeaningfulAudioAnswer('eu estruturaria a resposta em contexto impacto e tradeoffs', null)).toBe(true);
  });

  it('accepts speech metrics even when transcript is still empty', () => {
    expect(shouldAttemptAudioEvaluation({
      transcript: '',
      speechMetrics: metrics(),
      audioSize: 6400,
      localSpeechDetected: true,
    })).toBe(true);
  });

  it('accepts larger final audio as fallback when local transcript is missing', () => {
    expect(shouldAttemptAudioEvaluation({
      transcript: '',
      speechMetrics: metrics({ timeToFirstSpeechMs: 0, totalDurationMs: 2600, silenceDurationMs: 600 }),
      audioSize: 7200,
      localSpeechDetected: false,
    })).toBe(true);
  });

  it('rejects empty and very short silent captures', () => {
    expect(shouldAttemptAudioEvaluation({
      transcript: '',
      speechMetrics: metrics({ timeToFirstSpeechMs: 0, totalDurationMs: 900, silenceDurationMs: 900 }),
      audioSize: 1200,
      localSpeechDetected: false,
    })).toBe(false);
  });
});
