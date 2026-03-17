import type { FluencyLevel, SpeechMetrics } from '../../shared/types';

const FILLER_PATTERNS: Record<string, Array<{ marker: string; pattern: RegExp }>> = {
  'pt-BR': [
    { marker: 'ahn', pattern: /\bahn+\b/gi },
    { marker: 'hum', pattern: /\bhum+\b/gi },
    { marker: 'tipo', pattern: /\btipo\b/gi },
    { marker: 'acho que', pattern: /\bacho que\b/gi },
    { marker: 'talvez', pattern: /\btalvez\b/gi },
    { marker: 'eh', pattern: /\beh+\b/gi },
    { marker: 'e...', pattern: /\bé+\b/gi },
  ],
  en: [
    { marker: 'um', pattern: /\bum+\b/gi },
    { marker: 'uh', pattern: /\buh+\b/gi },
    { marker: 'like', pattern: /\blike\b/gi },
    { marker: 'i think', pattern: /\bi think\b/gi },
    { marker: 'maybe', pattern: /\bmaybe\b/gi },
    { marker: 'you know', pattern: /\byou know\b/gi },
  ],
};

const normalizeText = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const pickLanguage = (value?: string): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.startsWith('en')) return 'en';
  return 'pt-BR';
};

const detectFillers = (text: string, language?: string): { fillerCount: number; hesitationMarkers: string[] } => {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { fillerCount: 0, hesitationMarkers: [] };
  }

  const patterns = FILLER_PATTERNS[pickLanguage(language)] || FILLER_PATTERNS['pt-BR'];
  let fillerCount = 0;
  const markers = new Set<string>();

  patterns.forEach(({ marker, pattern }) => {
    const matches = normalized.match(pattern) || [];
    if (!matches.length) return;
    fillerCount += matches.length;
    markers.add(marker);
  });

  return {
    fillerCount,
    hesitationMarkers: Array.from(markers),
  };
};

const getWordsPerMinute = (text: string, durationMs: number): number | undefined => {
  const words = normalizeText(text).split(' ').filter(Boolean).length;
  if (!words || durationMs <= 0) return undefined;
  const wpm = (words / durationMs) * 60_000;
  return Number(clamp(wpm, 0, 240).toFixed(1));
};

const fluencyLevelFromScore = (score: number): FluencyLevel => {
  if (score >= 7.6) return 'high';
  if (score >= 4.5) return 'moderate';
  return 'low';
};

export function analyzeSpeechMetrics(params: {
  answerId: string;
  transcript: string;
  durationMs: number;
  silenceMs: number;
  pauseCount: number;
  longPauseCount: number;
  timeToFirstSpeechMs?: number;
  interruptionRecoveryCount?: number;
  language?: string;
}): SpeechMetrics {
  const transcript = String(params.transcript || '').trim();
  const durationMs = Math.max(0, Number(params.durationMs) || 0);
  const silenceDurationMs = Math.max(0, Number(params.silenceMs) || 0);
  const pauseCount = Math.max(0, Number(params.pauseCount) || 0);
  const longPauseCount = Math.max(0, Number(params.longPauseCount) || 0);
  const timeToFirstSpeechMs = Math.max(0, Number(params.timeToFirstSpeechMs) || 0);
  const interruptionRecoveryCount = Math.max(0, Number(params.interruptionRecoveryCount) || 0);

  const { fillerCount, hesitationMarkers } = detectFillers(transcript, params.language);
  const wordsPerMinute = getWordsPerMinute(transcript, durationMs);

  let fluencyScore = 8.4;
  fluencyScore -= Math.min(2.0, silenceDurationMs / 3000);
  fluencyScore -= Math.min(1.2, pauseCount * 0.18);
  fluencyScore -= Math.min(1.6, longPauseCount * 0.35);
  fluencyScore -= Math.min(1.5, fillerCount * 0.22);
  fluencyScore -= Math.min(1.3, timeToFirstSpeechMs / 4000);
  fluencyScore += interruptionRecoveryCount > 0 ? Math.min(0.8, interruptionRecoveryCount * 0.2) : 0;

  if (typeof wordsPerMinute === 'number') {
    if (wordsPerMinute >= 105 && wordsPerMinute <= 165) {
      fluencyScore += 0.5;
    } else if (wordsPerMinute < 75 || wordsPerMinute > 190) {
      fluencyScore -= 0.6;
    }
  }

  fluencyScore = Number(clamp(fluencyScore, 0, 10).toFixed(1));

  return {
    answerId: params.answerId,
    timeToFirstSpeechMs,
    totalDurationMs: durationMs,
    silenceDurationMs,
    pauseCount,
    longPauseCount,
    fillerCount,
    hesitationMarkers,
    wordsPerMinute,
    interruptionRecoveryCount,
    fluencyScore,
    fluencyLevel: fluencyLevelFromScore(fluencyScore),
  };
}
