import { describe, expect, it } from 'vitest';

import { deriveInterviewRuntimeState } from '../src/features/interview/components/interviewRuntimeState';

const baseInput = {
  flowState: 'idle' as const,
  conversationState: 'idle' as const,
  isOpeningStep: false,
  isTextMode: false,
  isFinished: false,
  isMediaReady: true,
  isMicrophoneReady: true,
  isCandidateCoachingMode: false,
  questionAudioFallbackActive: false,
  runtimeNotice: null,
  timeLimitReached: false,
  textEntryEnabled: false,
  candidateFirstName: 'Cleber',
  audioCaptureState: 'ready',
  audioUploadState: 'idle',
  pendingChunkCount: 0,
  partialTranscriptActive: false,
  partialFeedbackVisible: false,
  showLiveCoachPanel: false,
  liveCoachLoading: false,
  liveCoachError: null,
  hasLiveCoachInsight: false,
  liveCoachFeedCount: 0,
  currentQuestionIndex: 0,
  totalQuestions: 5,
  stageElapsedMs: 4200,
  sessionElapsedSeconds: 95,
  questionDeliveryLatencyMs: null,
  analysisLatencyMs: null,
};

describe('deriveInterviewRuntimeState', () => {
  it('marks processing moments as active analysis', () => {
    const state = deriveInterviewRuntimeState({
      ...baseInput,
      flowState: 'evaluating',
      conversationState: 'processing',
    });

    expect(state.headline).toBe('IA processando a proxima etapa');
    expect(state.tone).toBe('active');
    expect(state.timeline.find((item) => item.key === 'analysis')?.tone).toBe('active');
    expect(state.statuses.find((item) => item.label === 'Entrevistadora')?.value).toBe(
      'pensando na proxima etapa',
    );
    expect(state.metrics.find((item) => item.label === 'Etapa atual')?.value).toBe('4.2s');
    expect(state.metrics.find((item) => item.label === 'Sessao')?.value).toBe('01:35');
    expect(state.signals.find((item) => item.label === 'Analise')?.value).toBe('sem amostra');
  });

  it('surfaces fallback moments as warnings', () => {
    const state = deriveInterviewRuntimeState({
      ...baseInput,
      questionAudioFallbackActive: true,
      conversationState: 'listening',
      flowState: 'awaiting_answer',
    });

    expect(state.headline).toBe('Modo de contingencia ativo');
    expect(state.tone).toBe('warning');
    expect(state.timeline.find((item) => item.key === 'fallback')?.tone).toBe('warning');
    expect(state.statuses.find((item) => item.label === 'Audio')?.value).toBe('fallback em texto');
    expect(state.metrics.find((item) => item.label === 'Transporte')?.value).toBe('fallback em texto');
  });

  it('marks completed interviews as done across the runtime view', () => {
    const state = deriveInterviewRuntimeState({
      ...baseInput,
      isFinished: true,
      flowState: 'finished',
    });

    expect(state.headline).toBe('Entrevista encerrada');
    expect(state.tone).toBe('done');
    expect(state.timeline.every((item) => item.key === 'fallback' || item.tone === 'done')).toBe(true);
    expect(state.statuses.find((item) => item.label === 'Cleber')?.value).toBe('entrevista encerrada');
    expect(state.metrics.find((item) => item.label === 'Progresso')?.value).toBe('1/5');
  });

  it('reports pending audio chunks as active transport pressure', () => {
    const state = deriveInterviewRuntimeState({
      ...baseInput,
      flowState: 'recording',
      conversationState: 'candidate_speaking',
      pendingChunkCount: 3,
      isCandidateCoachingMode: true,
      questionDeliveryLatencyMs: 1400,
      analysisLatencyMs: 3800,
      partialTranscriptActive: true,
      liveCoachFeedCount: 2,
      hasLiveCoachInsight: true,
    });

    expect(state.metrics.find((item) => item.label === 'Transporte')?.value).toBe('3 chunk(s) na fila');
    expect(state.metrics.find((item) => item.label === 'Transporte')?.tone).toBe('active');
    expect(state.signals.find((item) => item.label === 'Entrega')?.value).toBe('1.4s');
    expect(state.signals.find((item) => item.label === 'Entrega')?.tone).toBe('done');
    expect(state.signals.find((item) => item.label === 'Analise')?.value).toBe('3.8s');
    expect(state.signals.find((item) => item.label === 'Coach')?.value).toBe('parcial ao vivo');
  });
});
