import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './InterviewRoomLayout.module.css';
import { shouldAttemptAudioEvaluation } from './answerDetection';
import { useUserMedia } from '../../../../hooks/useUserMedia';
import { useLipSync } from '../../../hooks/useLipSync';
import {
  PrimaryActionButton,
  QuestionVisualCard,
  TopBar,
  UserCameraCard,
} from '../../../shared/components';
import {
  AudioPermissionCard,
  MicrophoneSelector,
  RecordingStatusBadge,
  analyzeSpeechMetrics,
  useAudioCapture,
} from '../../audio';
import { AvatarInterview } from '../../avatar';
import { FIXED_INTERVIEW_DURATION_MINUTES, FIXED_INTERVIEW_QUESTION_COUNT, I18N } from '../../../shared/constants';
import { BackendApi } from '../../../shared/services/backendApi';
import type {
  AgentRuntimeRecord,
  AvatarResponse,
  CommunicationAnalysis,
  FinalReport,
  InterviewConfig,
  InterviewMode,
  InterviewPlan,
  LiveCoachProcessResponse,
  OrchestratorContextResponse,
  PartialFeedback,
  SessionClientRuntimeTrace,
  SpeechMetrics,
  User,
} from '../../../shared/types';
import {
  blobToBase64,
  buildFallbackReport,
  buildInterviewClosingPrompt,
  buildInterviewOpeningPrompt,
  buildInterviewOpeningRetryPrompt,
  buildNoResponsePrompt,
  buildSpokenPrompt,
  buildUiQuestions,
  deriveContextLabel,
  getLocalFallbackPrompt,
  toUiQuestion,
  type HistoryItem,
  type UiQuestion,
} from './interviewRoomUtils';
import {
  clearAudioElementSource,
  getSharedTtsAudioElement,
  setAudioElementSourceFromBase64,
} from '../../../shared/utils/audioPlayback';
import {
  deriveTechnicalDifficultyLevel,
  getInterviewModeLevelMeta,
  normalizeInterviewModeLevel,
} from '../../../shared/utils/interviewMode';
import {
  deriveInterviewRuntimeState,
  type ConversationState,
  type InterviewFlowState,
  type RuntimeTone,
} from './interviewRuntimeState';

type AvatarInterviewState = 'idle' | 'avatar_listening' | 'avatar_thinking' | 'avatar_speaking';

type AnswerMode = 'audio' | 'text';

const VIDEO_MEDIA_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: false };
const NO_RESPONSE_MS = 5000;
const SILENCE_STOP_MS = 1500;
const SILENCE_THRESHOLD = 0.02;
const NEXT_QUESTION_TRANSITION_MS = 150;
const AUTO_MODE = false;
const MAX_RECORDING_MS = 90000;
const LIVE_COACH_CHUNK_TIMESLICE_MS = 3000;
const LIVE_COACH_CHUNK_INTERVAL_MS = 8000;
const LIVE_COACH_WS_RESPONSE_TIMEOUT_MS = 7000;
const PENDING_ANSWER_INSIGHT_TIMEOUT_MS = 7000;
const LONG_PAUSE_MS = 1200;
const PARTIAL_FEEDBACK_ENABLED = true;
const DEFER_ANSWER_REVIEW_TO_FINAL = true;

const getPreferredCandidateName = (name?: string): string => {
  const raw = String(name || '').trim();
  if (!raw) return 'Candidato';
  return raw.split(/\s+/)[0] || 'Candidato';
};

const appendPartialTranscript = (currentValue: string, nextValue?: string | null): string => {
  const current = String(currentValue || '').trim();
  const incoming = String(nextValue || '').trim();
  if (!incoming) return current;
  if (!current) return incoming;
  if (current === incoming || current.endsWith(incoming)) return current;
  if (incoming.startsWith(current)) return incoming;
  return `${current} ${incoming}`.replace(/\s+/g, ' ').trim();
};

const hasOpeningAcknowledgement = (input: {
  transcript: string;
  audioSize: number;
  localSpeechDetected: boolean;
  speechMetrics?: SpeechMetrics | null;
}): boolean => {
  if (String(input.transcript || '').trim().length > 0) return true;
  if (input.localSpeechDetected) return true;
  return (input.speechMetrics?.totalDurationMs || 0) >= 600 && input.audioSize >= 4000;
};

const AGENT_RUNTIME_ORDER = ['candidate_agent', 'job_agent', 'match_agent', 'candidate_memory'] as const;

const AGENT_RUNTIME_LABELS: Record<string, string> = {
  candidate_agent: 'Candidato',
  job_agent: 'Vaga',
  match_agent: 'Match',
  candidate_memory: 'Memoria',
};

const AGENT_RUNTIME_SOURCE_LABELS: Record<string, string> = {
  system: 'Sistema',
  heuristic: 'Heuristico',
  ai: 'IA',
  hybrid: 'Hibrido',
};

const AGENT_RUNTIME_STATUS_LABELS: Record<string, string> = {
  completed: 'Ativo',
  fallback: 'Fallback',
  skipped: 'Sem dados',
  error: 'Erro',
};

const formatRuntimeConfidence = (value?: number | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${Math.round(value * 100)}%`;
};

const summarizeRuntimeQuality = (value: number | null): string => {
  if (value == null) return 'Inicial';
  if (value >= 0.8) return 'Forte';
  if (value >= 0.6) return 'Bom';
  if (value >= 0.4) return 'Moderado';
  return 'Inicial';
};

const getRuntimeToneClassName = (tone: RuntimeTone): string => {
  switch (tone) {
    case 'active':
      return styles.runtimeToneActive;
    case 'warning':
      return styles.runtimeToneWarning;
    case 'done':
      return styles.runtimeToneDone;
    case 'idle':
    default:
      return styles.runtimeToneIdle;
  }
};

interface InterviewRoomLayoutProps {
  config: InterviewConfig;
  plan: InterviewPlan;
  sessionId?: string;
  initialAvatar?: AvatarResponse | null;
  context?: OrchestratorContextResponse | null;
  user: User;
  onFinish?: (report: FinalReport) => void;
  onBack?: () => void;
}

type LiveCoachFeedItem = {
  id: string;
  createdAt: number;
  questionType?: string | null;
  detectedQuestion?: string | null;
  suggestion: string;
};

type QuestionSpeechOptions = {
  openTextFallback?: boolean;
  suppressNotice?: boolean;
  notice?: string;
};

const InterviewRoomLayout: React.FC<InterviewRoomLayoutProps> = ({
  config,
  plan,
  sessionId,
  initialAvatar,
  context,
  user,
  onFinish,
  onBack,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [introPending, setIntroPending] = useState(true);
  const [flowState, setFlowState] = useState<InterviewFlowState>('idle');
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  const [answerMode, setAnswerMode] = useState<AnswerMode>('audio');
  const [isCompactLayout, setIsCompactLayout] = useState(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 640px)').matches,
  );
  const [textAnswer, setTextAnswer] = useState('');
  const [showMicrophoneSelector, setShowMicrophoneSelector] = useState(false);
  const audioEl = useMemo(() => getSharedTtsAudioElement(), []);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.round((config.duration ?? 0) * 60)),
  );
  const [runtimeClockMs, setRuntimeClockMs] = useState(() => Date.now());
  const [timeLimitReached, setTimeLimitReached] = useState(false);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const [questionAudioFallbackActive, setQuestionAudioFallbackActive] = useState(false);
  const [liveCoachInsight, setLiveCoachInsight] = useState<LiveCoachProcessResponse | null>(null);
  const [liveCoachLoading, setLiveCoachLoading] = useState(false);
  const [liveCoachError, setLiveCoachError] = useState<string | null>(null);
  const [liveCoachFeed, setLiveCoachFeed] = useState<LiveCoachFeedItem[]>([]);
  const [partialFeedback, setPartialFeedback] = useState<PartialFeedback | null>(null);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [activeAnswerId, setActiveAnswerId] = useState<string | null>(null);
  const [avatarByQuestionId, setAvatarByQuestionId] = useState<Record<string, AvatarResponse>>({});
  const [currentAvatar, setCurrentAvatar] = useState<AvatarResponse | null>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const partialTranscriptRef = useRef('');
  const partialFeedbackShownRef = useRef(false);
  const currentSpeechMetricsRef = useRef<SpeechMetrics | null>(null);
  const currentCommunicationAnalysisRef = useRef<CommunicationAnalysis | null>(null);
  const liveCoachFeedRef = useRef<LiveCoachFeedItem[]>([]);
  const finishingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const noResponseTimerRef = useRef<number | null>(null);
  const recordingFailsafeTimerRef = useRef<number | null>(null);
  const stopInProgressRef = useRef(false);
  const liveCoachChunkInFlightRef = useRef(false);
  const lastLiveCoachChunkAtRef = useRef(0);
  const liveCoachChunkIndexRef = useRef(0);
  const avatarRequestByQuestionIdRef = useRef(new Map<string, Promise<AvatarResponse | null>>());
  const avatarCacheRef = useRef<Record<string, AvatarResponse>>({});
  const pendingAnswerInsightsRef = useRef(new Map<string, Promise<void>>());
  const liveCoachChunkHandlerRef = useRef<(chunk: Blob) => Promise<void>>(() => Promise.resolve());
  const stageStartedAtRef = useRef(Date.now());
  const previousRuntimePhaseRef = useRef<{
    flowState: InterviewFlowState;
    conversationState: ConversationState;
    startedAtMs: number;
  } | null>(null);
  const runtimeLatencyRef = useRef<{
    questionDeliveryMs: number | null;
    analysisLatencyMs: number | null;
  }>({
    questionDeliveryMs: null,
    analysisLatencyMs: null,
  });
  const currentTurnRuntimeTraceRef = useRef<SessionClientRuntimeTrace | null>(null);
  const liveCoachWsRef = useRef<WebSocket | null>(null);
  const liveCoachWsConnectRef = useRef<Promise<WebSocket | null> | null>(null);
  const liveCoachWsDisabledRef = useRef(false);
  const liveCoachWsPendingRef = useRef(
    new Map<
      string,
      {
        resolve: (value: LiveCoachProcessResponse | null) => void;
        reject: (reason?: unknown) => void;
        onPartial?: (value: { transcript?: string | null }) => void;
        timeoutId: number;
      }
    >(),
  );
  const isRecorderActiveRef = useRef(false);
  const stopRecordingFlowRef = useRef<((reason: 'manual' | 'auto') => Promise<void>) | null>(null);
  const handleNoResponseRef = useRef<(() => Promise<void>) | null>(null);
  const hasSpokenRef = useRef(false);
  const lastSoundAtRef = useRef(0);
  const autoStopRef = useRef(false);
  const noiseThresholdRef = useRef(SILENCE_THRESHOLD);
  const baselineDoneRef = useRef(false);
  const voiceMonitorRef = useRef<{
    ctx: AudioContext | null;
    analyser: AnalyserNode | null;
    data: Uint8Array | null;
    rafId: number | null;
  }>({ ctx: null, analyser: null, data: null, rafId: null });
  const answerMetricsRef = useRef<{
    answerId: string;
    startedAtMs: number;
    firstSpeechAtMs: number | null;
    silenceDurationMs: number;
    pauseCount: number;
    longPauseCount: number;
    interruptionRecoveryCount: number;
    lastTickAtMs: number;
    silenceStartedAtMs: number | null;
    wasSpeaking: boolean;
  } | null>(null);

  const { stream: videoStream, status: mediaStatus, error: mediaError } = useUserMedia(VIDEO_MEDIA_CONSTRAINTS);

  const { mouthOpen, isSpeaking } = useLipSync(audioEl);

  const interviewModeLevel = normalizeInterviewModeLevel(config.interviewModeLevel);
  const technicalDifficultyLevel = deriveTechnicalDifficultyLevel(config.seniority);
  const interviewModeLevelMeta = getInterviewModeLevelMeta(interviewModeLevel);
  const candidateFirstName = useMemo(() => getPreferredCandidateName(user?.name), [user?.name]);
  const interviewMode: InterviewMode = config.interviewMode || 'candidate_coaching_mode';
  const isCandidateCoachingMode = interviewMode === 'candidate_coaching_mode';
  const interviewModeLabel =
    interviewMode === 'candidate_coaching_mode' ? 'Coaching do candidato' : 'Avaliacao de contratacao';
  const baseBullets = useMemo(() => (plan.mustHaveSkills ?? []).slice(0, 3), [plan]);
  const baseQuestions = useMemo(() => {
    const all = buildUiQuestions(plan);
    const filtered = all.filter((question) => question.difficulty === technicalDifficultyLevel);
    const source = filtered.length ? filtered : all;
    return source.slice(0, FIXED_INTERVIEW_QUESTION_COUNT);
  }, [plan, technicalDifficultyLevel]);
  const initialAvatarByQuestionId = useMemo<Record<string, AvatarResponse>>(() => ({}), []);
  const [questions, setQuestions] = useState<UiQuestion[]>(() => baseQuestions);
  const sanitizedConfig = useMemo(() => {
    const { difficultyLevel, ...rest } = config;
    return rest;
  }, [config]);
  const currentQuestion = questions[currentIndex] ?? questions[0];
  const isOpeningStep = introPending && currentIndex === 0;
  const audioQuestionId = isOpeningStep ? 'intro' : currentQuestion?.id;
  const audioCapture = useAudioCapture({
    autoRequest: true,
    answerId: activeAnswerId || undefined,
    sessionId,
    questionId: audioQuestionId,
    userId: user.uid,
    chunkTimesliceMs: LIVE_COACH_CHUNK_TIMESLICE_MS,
    onChunkCaptured: async (chunk) => {
      void liveCoachChunkHandlerRef.current(chunk);
    },
  });
  const isRecorderActive = audioCapture.isRecordingSessionActive;
  const recorderError = audioCapture.error;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const updateCompactLayout = () => setIsCompactLayout(mediaQuery.matches);

    updateCompactLayout();
    mediaQuery.addEventListener?.('change', updateCompactLayout);
    mediaQuery.addListener?.(updateCompactLayout);

    return () => {
      mediaQuery.removeEventListener?.('change', updateCompactLayout);
      mediaQuery.removeListener?.(updateCompactLayout);
    };
  }, []);

  useEffect(() => {
    setShowMicrophoneSelector(!audioCapture.isMicrophoneReady);
  }, [audioCapture.isMicrophoneReady]);

  useEffect(() => {
    isRecorderActiveRef.current = isRecorderActive;
  }, [isRecorderActive]);

  useEffect(() => {
    const now = Date.now();
    const previousPhase = previousRuntimePhaseRef.current;

    if (previousPhase) {
      const durationMs = Math.max(0, now - previousPhase.startedAtMs);
      const previousWasQuestionDelivery =
        previousPhase.conversationState === 'ai_speaking' || previousPhase.flowState === 'asking';
      const questionDeliverySettled =
        conversationState === 'listening' ||
        flowState === 'awaiting_answer' ||
        flowState === 'recording' ||
        conversationState === 'candidate_speaking';
      if (previousWasQuestionDelivery && questionDeliverySettled) {
        runtimeLatencyRef.current.questionDeliveryMs = durationMs;
      }

      const previousWasAnalysis =
        previousPhase.conversationState === 'processing' ||
        previousPhase.flowState === 'evaluating' ||
        previousPhase.flowState === 'next_question' ||
        previousPhase.flowState === 'finalizing';
      const analysisSettled =
        conversationState === 'ai_speaking' ||
        conversationState === 'listening' ||
        flowState === 'awaiting_answer' ||
        flowState === 'finished';
      if (previousWasAnalysis && analysisSettled) {
        runtimeLatencyRef.current.analysisLatencyMs = durationMs;
      }
    }

    previousRuntimePhaseRef.current = {
      flowState,
      conversationState,
      startedAtMs: now,
    };
    stageStartedAtRef.current = now;
    setRuntimeClockMs(now);
  }, [conversationState, flowState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interviewFinished = flowState === 'finished';

    if (interviewFinished) {
      setRuntimeClockMs(Date.now());
      return;
    }

    const intervalId = window.setInterval(() => {
      setRuntimeClockMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [flowState]);

  const contextLabel = useMemo(
    () => (isOpeningStep ? 'Abertura da entrevista' : deriveContextLabel(currentQuestion, config.stacks)),
    [config.stacks, currentQuestion, isOpeningStep],
  );
  const agentRuntimeEntries = useMemo(() => {
    const runtime = context?.agentRuntime || {};
    const orderedEntries = AGENT_RUNTIME_ORDER.map((key) => runtime[key]).filter(Boolean) as AgentRuntimeRecord[];
    const extraEntries = Object.values(runtime).filter(
      (entry) => entry && !AGENT_RUNTIME_ORDER.includes(entry.name as (typeof AGENT_RUNTIME_ORDER)[number]),
    ) as AgentRuntimeRecord[];
    return [...orderedEntries, ...extraEntries];
  }, [context?.agentRuntime]);
  const contextRuntimeSummary = useMemo(() => {
    if (!agentRuntimeEntries.length) {
      return {
        qualityLabel: 'Inicial',
        averageConfidence: null as number | null,
        evidenceCount: 0,
        activeCount: 0,
      };
    }

    const activeEntries = agentRuntimeEntries.filter((entry) => entry.status !== 'skipped');
    const confidenceValues = activeEntries
      .map((entry) => (typeof entry.confidence === 'number' ? entry.confidence : null))
      .filter((value): value is number => value != null);
    const averageConfidence = confidenceValues.length
      ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
      : null;
    const evidenceCount = agentRuntimeEntries.reduce(
      (total, entry) => total + (Array.isArray(entry.evidence) ? entry.evidence.length : 0),
      0,
    );

    return {
      qualityLabel: summarizeRuntimeQuality(averageConfidence),
      averageConfidence,
      evidenceCount,
      activeCount: activeEntries.length,
    };
  }, [agentRuntimeEntries]);
  const fallbackMaxQuestions = FIXED_INTERVIEW_QUESTION_COUNT;
  const totalSeconds = useMemo(
    () => Math.max(0, Math.round((config.duration ?? 0) * 60)),
    [config.duration],
  );
  const t = I18N[config.uiLanguage];

  const stageLabel = useMemo(() => {
    if (isOpeningStep) return t.introLabel ?? 'INTRODUCAO';
    const total = fallbackMaxQuestions;
    if (!total) return t.introLabel ?? 'INTRODUCAO';
    const current = Math.min(currentIndex + 1, total);
    const template = t.stepLabel ?? 'Stage {current} of {total}';
    return template.replace('{current}', String(current)).replace('{total}', String(total));
  }, [currentIndex, fallbackMaxQuestions, isOpeningStep, t.introLabel, t.stepLabel]);

  const chipLabel = useMemo(() => {
    if (!questions.length) return t.introLabel ?? 'INTRODUCAO';
    if (currentIndex === 0) return t.introLabel ?? 'INTRODUCAO';
    return stageLabel;
  }, [questions.length, currentIndex, stageLabel, t.introLabel]);

  const timerLabel = useMemo(() => {
    const clamped = Math.max(0, remainingSeconds);
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [remainingSeconds]);
  const shouldRevealQuestionText =
    isOpeningStep || interviewModeLevel !== 3 || answerMode === 'text' || questionAudioFallbackActive;
  const questionCardTitle = isOpeningStep
    ? 'Apresentacao inicial'
    : shouldRevealQuestionText
      ? currentQuestion?.title ?? 'Carregando pergunta...'
      : 'Simulacao real em andamento';
  const questionCardBullets = isOpeningStep
    ? ['Responda algo breve, como "sim, podemos comecar", para iniciar a entrevista.']
    : shouldRevealQuestionText
      ? [
          ...(interviewModeLevel === 1 ? [interviewModeLevelMeta.roomHint] : []),
          ...(currentQuestion?.bullets ?? []),
        ]
      : [
          interviewModeLevelMeta.roomHint,
          'A pergunta foi entregue por voz para simular uma entrevista ao vivo.',
          'Se precisar revisar o enunciado, troque para modo texto.',
        ];
  const isMediaReady = mediaStatus === 'ready' && audioCapture.isMicrophoneReady;

  const showRuntimeNotice = useCallback((message: string) => {
    setRuntimeNotice(message);
  }, []);

  const buildAnswerId = useCallback(() => {
    const questionToken = audioQuestionId || `q${currentIndex + 1}`;
    return [sessionId || 'session', questionToken, Date.now().toString(36)].join('__');
  }, [audioQuestionId, currentIndex, sessionId]);

  const resetCurrentAnswerAnalysis = useCallback((nextAnswerId?: string | null) => {
    setActiveAnswerId(nextAnswerId || null);
    setPartialFeedback(null);
    setPartialTranscript('');
    partialTranscriptRef.current = '';
    partialFeedbackShownRef.current = false;
    currentSpeechMetricsRef.current = null;
    currentCommunicationAnalysisRef.current = null;
    answerMetricsRef.current = nextAnswerId
      ? {
          answerId: nextAnswerId,
          startedAtMs: Date.now(),
          firstSpeechAtMs: null,
          silenceDurationMs: 0,
          pauseCount: 0,
          longPauseCount: 0,
          interruptionRecoveryCount: 0,
          lastTickAtMs: Date.now(),
          silenceStartedAtMs: null,
          wasSpeaking: false,
        }
      : null;
  }, []);

  const computeSpeechMetrics = useCallback(
    (transcript: string, durationOverrideMs?: number): SpeechMetrics | null => {
      const snapshot = answerMetricsRef.current;
      const answerId = snapshot?.answerId || activeAnswerId;
      if (!answerId) return null;
      const totalDurationMs =
        typeof durationOverrideMs === 'number'
          ? Math.max(0, durationOverrideMs)
          : snapshot
            ? Math.max(0, Date.now() - snapshot.startedAtMs)
            : 0;
      const timeToFirstSpeechMs = snapshot?.firstSpeechAtMs
        ? Math.max(0, snapshot.firstSpeechAtMs - snapshot.startedAtMs)
        : totalDurationMs;
      const metrics = analyzeSpeechMetrics({
        answerId,
        transcript,
        durationMs: totalDurationMs,
        silenceMs: snapshot?.silenceDurationMs || 0,
        pauseCount: snapshot?.pauseCount || 0,
        longPauseCount: snapshot?.longPauseCount || 0,
        timeToFirstSpeechMs,
        interruptionRecoveryCount: snapshot?.interruptionRecoveryCount || 0,
        language: config.interviewLanguage,
      });
      currentSpeechMetricsRef.current = metrics;
      return metrics;
    },
    [activeAnswerId, config.interviewLanguage],
  );

  const appendLiveCoachFeed = useCallback((insight: LiveCoachProcessResponse) => {
    const suggestion = (insight?.suggestion || '').trim();
    if (!suggestion) return;
    const signature = `${insight.questionType || ''}|${insight.detectedQuestion || ''}|${suggestion}`;
    setLiveCoachFeed((prev) => {
      const previousSignature =
        prev.length > 0 ? `${prev[0].questionType || ''}|${prev[0].detectedQuestion || ''}|${prev[0].suggestion}` : '';
      if (signature === previousSignature) return prev;
      const next: LiveCoachFeedItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        questionType: insight.questionType,
        detectedQuestion: insight.detectedQuestion,
        suggestion,
      };
      return [next, ...prev].slice(0, 6);
    });
  }, []);

  const updateHistoryItemByAnswerId = useCallback((answerId: string, patch: Partial<HistoryItem>) => {
    if (!answerId) return;
    historyRef.current = historyRef.current.map((item) =>
      item.answerId === answerId
        ? {
            ...item,
            ...patch,
          }
        : item,
    );
  }, []);

  const registerPendingAnswerInsight = useCallback((answerId: string, promise: Promise<void>) => {
    if (!answerId) return;
    pendingAnswerInsightsRef.current.set(answerId, promise);
    void promise.finally(() => {
      if (pendingAnswerInsightsRef.current.get(answerId) === promise) {
        pendingAnswerInsightsRef.current.delete(answerId);
      }
    });
  }, []);

  const waitForPendingAnswerInsights = useCallback(async () => {
    const pending = Array.from(pendingAnswerInsightsRef.current.values());
    if (!pending.length) return;

    await Promise.allSettled(
      pending.map((task) =>
        Promise.race([
          task,
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, PENDING_ANSWER_INSIGHT_TIMEOUT_MS);
          }),
        ]),
      ),
    );
  }, []);

  const clearLiveCoachWsPending = useCallback((reason: string) => {
    liveCoachWsPendingRef.current.forEach((pending) => {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    });
    liveCoachWsPendingRef.current.clear();
  }, []);

  const closeLiveCoachSocket = useCallback(
    (reason = 'live_coach_socket_closed') => {
      clearLiveCoachWsPending(reason);
      liveCoachWsConnectRef.current = null;
      const ws = liveCoachWsRef.current;
      liveCoachWsRef.current = null;
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        try {
          ws.close();
        } catch {}
      }
    },
    [clearLiveCoachWsPending],
  );

  const ensureLiveCoachSocket = useCallback(async (): Promise<WebSocket | null> => {
    if (liveCoachWsDisabledRef.current) return null;

    const current = liveCoachWsRef.current;
    if (current && current.readyState === WebSocket.OPEN) return current;

    if (liveCoachWsConnectRef.current) {
      return liveCoachWsConnectRef.current;
    }

    liveCoachWsConnectRef.current = (async () => {
      try {
        const ws = await BackendApi.openLiveCoachSocket();

        ws.addEventListener('message', (event) => {
          if (typeof event.data !== 'string') return;
          let payload: any = null;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }

          const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
          if (!requestId) return;

          const pending = liveCoachWsPendingRef.current.get(requestId);
          if (!pending) return;

          if (payload?.type === 'partial_transcription') {
            pending.onPartial?.(payload?.payload || {});
            return;
          }

          if ((payload?.type === 'coach_hint' || payload?.type === 'insight') && payload?.payload) {
            liveCoachWsPendingRef.current.delete(requestId);
            window.clearTimeout(pending.timeoutId);
            pending.resolve(payload.payload as LiveCoachProcessResponse);
            return;
          }

          liveCoachWsPendingRef.current.delete(requestId);
          window.clearTimeout(pending.timeoutId);
          pending.reject(new Error(payload?.error || 'live_coach_socket_error'));
        });

        ws.addEventListener('close', () => {
          if (liveCoachWsRef.current === ws) {
            liveCoachWsRef.current = null;
          }
          clearLiveCoachWsPending('live_coach_socket_disconnected');
        });

        ws.addEventListener('error', () => {
          clearLiveCoachWsPending('live_coach_socket_error');
        });

        liveCoachWsRef.current = ws;
        return ws;
      } catch {
        liveCoachWsDisabledRef.current = true;
        return null;
      } finally {
        liveCoachWsConnectRef.current = null;
      }
    })();

    return liveCoachWsConnectRef.current;
  }, [clearLiveCoachWsPending]);

  const requestLiveCoachViaWebSocket = useCallback(
    async (
      payload: {
        audioBase64?: string;
        audioChunks?: Array<{ chunkIndex: number; audio: string; timestamp: string }>;
        mimeType?: string;
        context?: Record<string, unknown>;
      },
      options: {
        messageType?: 'process' | 'audio_chunk';
        onPartial?: (value: { transcript?: string | null }) => void;
      } = {},
    ) => {
      const ws = await ensureLiveCoachSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) return null;

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const messageType = options.messageType || 'audio_chunk';
      return new Promise<LiveCoachProcessResponse | null>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          liveCoachWsPendingRef.current.delete(requestId);
          reject(new Error('live_coach_socket_timeout'));
        }, LIVE_COACH_WS_RESPONSE_TIMEOUT_MS);

        liveCoachWsPendingRef.current.set(requestId, {
          resolve,
          reject,
          timeoutId,
          onPartial: options.onPartial,
        });

        try {
          ws.send(
            JSON.stringify({
              type: messageType,
              requestId,
              payload,
            }),
          );
        } catch (error) {
          window.clearTimeout(timeoutId);
          liveCoachWsPendingRef.current.delete(requestId);
          closeLiveCoachSocket('live_coach_socket_send_failed');
          reject(error);
        }
      });
    },
    [closeLiveCoachSocket, ensureLiveCoachSocket],
  );

  const requestLiveCoachInsight = useCallback(
    async (
      input: {
        audioBase64: string;
        audioChunks?: Array<{ chunkIndex: number; audio: string; timestamp: string }>;
        mimeType?: string;
        transcript?: string;
        answerId?: string;
        speechMetrics?: SpeechMetrics | null;
      },
      options: { background?: boolean; silent?: boolean } = {},
    ) => {
      if (!isCandidateCoachingMode) return null;
      if (isOpeningStep) return null;
      if (!currentQuestion?.title) return;
      const background = Boolean(options.background);
      const silent = Boolean(options.silent);
      if (!background) {
        setLiveCoachLoading(true);
        setLiveCoachError(null);
        setConversationState('processing');
      }
      const recentHistory = historyRef.current.slice(-3).map((item) => ({
        question: item.question,
        section: item.section,
        scores: item.evaluation?.criteriaScores || item.evaluation?.scores || {},
        improvements: (item.evaluation?.improvements || []).slice(0, 2),
      }));
      const recentTips = liveCoachFeedRef.current.slice(0, 3).map((item) => item.suggestion);
      const effectiveAnswerId = input.answerId || activeAnswerId || undefined;
      const effectiveSpeechMetrics = input.speechMetrics || currentSpeechMetricsRef.current || undefined;
      const requestPayload = {
        audioBase64: input.audioBase64,
        audioChunks: input.audioChunks || undefined,
        mimeType: input.mimeType || 'audio/webm',
        context: {
          source: 'interview-room',
          mode: interviewMode,
          answerId: effectiveAnswerId,
          partialFeedbackEnabled: PARTIAL_FEEDBACK_ENABLED && isCandidateCoachingMode,
          partialFeedbackDelivered: partialFeedbackShownRef.current,
          speechMetrics: effectiveSpeechMetrics,
          sessionId: sessionId || undefined,
          questionText: currentQuestion.title,
          transcript: input.transcript || undefined,
          candidateProfile: {
            targetRole: config.track,
            primarySkills: config.stacks || [],
            weakSkills: [],
          },
          jobDescription: config.jobDescription || undefined,
          interviewHistory: recentHistory,
          recentLiveCoachTips: recentTips,
        },
      };

      try {
        let response: LiveCoachProcessResponse | null = null;
        try {
          const messageType = input.transcript ? 'process' : 'audio_chunk';
          response = await requestLiveCoachViaWebSocket(requestPayload, {
            messageType,
            onPartial: (partial) => {
              const nextTranscript = appendPartialTranscript(partialTranscriptRef.current, partial?.transcript);
              if (nextTranscript !== partialTranscriptRef.current) {
                partialTranscriptRef.current = nextTranscript;
                setPartialTranscript(nextTranscript);
              }
              if (partial?.transcript && flowState === 'recording') {
                setConversationState('candidate_speaking');
              }
            },
          });
        } catch (wsError) {
          console.warn('Live coach websocket fallback to HTTP', wsError);
        }

        if (!response) {
          response = await BackendApi.liveCoachProcess(requestPayload);
        }

        const mergedTranscript = appendPartialTranscript(partialTranscriptRef.current, response.transcript);
        if (mergedTranscript !== partialTranscriptRef.current) {
          partialTranscriptRef.current = mergedTranscript;
          setPartialTranscript(mergedTranscript);
        }
        if (response.speechMetrics) {
          currentSpeechMetricsRef.current = response.speechMetrics;
        }
        if (
          effectiveAnswerId &&
          (response.communicationSignals || response.behavioralSpeechSignals || response.speechMetrics)
        ) {
          currentCommunicationAnalysisRef.current = {
            answerId: effectiveAnswerId,
            mode: response.mode || interviewMode,
            speechMetrics: response.speechMetrics || effectiveSpeechMetrics || null,
            communicationSignals: response.communicationSignals || null,
            behavioralSpeechSignals: response.behavioralSpeechSignals || null,
          };
        }
        if (response.partialFeedback && !partialFeedbackShownRef.current) {
          partialFeedbackShownRef.current = true;
          setPartialFeedback(response.partialFeedback);
        }

        if (!background || response.status === 'ok') {
          setLiveCoachInsight(response);
          appendLiveCoachFeed(response);
        }
        return response;
      } catch (error) {
        console.warn('Live coach insight failed', error);
        if (!silent) {
          setLiveCoachError('Live coach indisponivel nesta resposta.');
        }
        return null;
      } finally {
        if (!background) {
          setLiveCoachLoading(false);
          if (flowState === 'recording') {
            setConversationState('candidate_speaking');
          } else if (flowState === 'awaiting_answer') {
            setConversationState('listening');
          }
        }
      }
    },
    [
      activeAnswerId,
      appendLiveCoachFeed,
      config.jobDescription,
      config.interviewLanguage,
      config.stacks,
      config.track,
      currentQuestion?.title,
      flowState,
      interviewMode,
      isCandidateCoachingMode,
      isOpeningStep,
      requestLiveCoachViaWebSocket,
      sessionId,
    ],
  );

  const queueDeferredAnswerInsight = useCallback(
    (input: {
      answerId: string;
      questionText: string;
      historySnapshot: HistoryItem[];
      transcript?: string;
      speechMetrics?: SpeechMetrics | null;
      audioBlob?: Blob | null;
      mimeType?: string;
    }) => {
      if (!DEFER_ANSWER_REVIEW_TO_FINAL) return;

      const answerId = String(input.answerId || '').trim();
      const fallbackTranscript = String(input.transcript || '').trim();
      const hasAudio = Boolean(input.audioBlob && input.audioBlob.size > 0);
      if (!answerId || (!hasAudio && !fallbackTranscript)) return;

      const recentHistory = input.historySnapshot.slice(-3).map((item) => ({
        question: item.question,
        section: item.section,
        scores: item.evaluation?.criteriaScores || item.evaluation?.scores || {},
        improvements: (item.evaluation?.improvements || []).slice(0, 2),
      }));

      const task = (async () => {
        const audioBase64 = hasAudio && input.audioBlob ? await blobToBase64(input.audioBlob) : '';
        const response = await BackendApi.liveCoachProcess({
          audioBase64,
          mimeType: input.mimeType || input.audioBlob?.type || 'audio/webm',
          context: {
            source: 'interview-room',
            mode: interviewMode,
            answerId,
            partialFeedbackEnabled: false,
            partialFeedbackDelivered: true,
            speechMetrics: input.speechMetrics || undefined,
            sessionId: sessionId || undefined,
            questionText: input.questionText,
            transcript: fallbackTranscript || undefined,
            candidateProfile: {
              targetRole: config.track,
              primarySkills: config.stacks || [],
              weakSkills: [],
            },
            jobDescription: config.jobDescription || undefined,
            interviewHistory: recentHistory,
            recentLiveCoachTips: [],
          },
        });

        updateHistoryItemByAnswerId(answerId, {
          transcript: appendPartialTranscript(fallbackTranscript, response.transcript),
          speechMetrics: response.speechMetrics || input.speechMetrics || null,
        });
      })().catch((error) => {
        console.warn('Deferred answer insight failed', error);
      });

      registerPendingAnswerInsight(answerId, task);
    },
    [
      config.jobDescription,
      config.stacks,
      config.track,
      interviewMode,
      registerPendingAnswerInsight,
      sessionId,
      updateHistoryItemByAnswerId,
    ],
  );

  const handleLiveCoachChunk = useCallback(
    async (chunk: Blob) => {
      if (DEFER_ANSWER_REVIEW_TO_FINAL) return;
      if (flowState !== 'recording' || answerMode !== 'audio') return;
      if (isOpeningStep) return;
      if (!currentQuestion?.title) return;
      if (chunk.size < 2048) return;
      if (liveCoachChunkInFlightRef.current) return;
      const now = Date.now();
      if (now - lastLiveCoachChunkAtRef.current < LIVE_COACH_CHUNK_INTERVAL_MS) return;

      liveCoachChunkInFlightRef.current = true;
      lastLiveCoachChunkAtRef.current = now;
      try {
        const base64Audio = await blobToBase64(chunk);
        const chunkIndex = liveCoachChunkIndexRef.current + 1;
        liveCoachChunkIndexRef.current = chunkIndex;
        const transcript = partialTranscriptRef.current;
        const speechMetrics = computeSpeechMetrics(transcript);
        await requestLiveCoachInsight(
          {
            audioBase64: base64Audio,
            answerId: activeAnswerId || undefined,
            audioChunks: [
              {
                chunkIndex,
                audio: base64Audio,
                timestamp: new Date().toISOString(),
              },
            ],
            mimeType: chunk.type || 'audio/webm',
            transcript,
            speechMetrics,
          },
          { background: true, silent: true },
        );
      } catch (error) {
        console.warn('Live coach chunk failed', error);
      } finally {
        liveCoachChunkInFlightRef.current = false;
      }
    },
    [activeAnswerId, answerMode, computeSpeechMetrics, currentQuestion?.title, flowState, isOpeningStep, requestLiveCoachInsight],
  );

  const stopTTS = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (!audioEl) return;
    clearAudioElementSource(audioEl);
  }, [audioEl]);

  const speakWithBrowserVoice = useCallback(
    async (text: string): Promise<boolean> => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;

      const content = String(text || '').trim();
      if (!content) return false;

      const synth = window.speechSynthesis;
      synth.cancel();

      return new Promise<boolean>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(content);
        const normalizedLanguage = String(config.interviewLanguage || 'pt-BR').toLowerCase();
        const baseLanguage = normalizedLanguage.split('-')[0];
        const assignVoice = () => {
          const voices = synth.getVoices();
          const matchingVoice =
            voices.find((voice) => voice.lang?.toLowerCase() === normalizedLanguage) ||
            voices.find((voice) => voice.lang?.toLowerCase().startsWith(baseLanguage));
          if (matchingVoice) {
            utterance.voice = matchingVoice;
            utterance.lang = matchingVoice.lang;
          } else {
            utterance.lang = normalizedLanguage;
          }
        };

        assignVoice();

        let resolved = false;
        const timeoutMs = Math.min(14000, Math.max(4500, content.split(/\s+/).length * 220));
        const timeoutId = window.setTimeout(() => {
          if (resolved) return;
          resolved = true;
          synth.cancel();
          resolve(false);
        }, timeoutMs);

        utterance.onend = () => {
          if (resolved) return;
          resolved = true;
          window.clearTimeout(timeoutId);
          resolve(true);
        };

        utterance.onerror = () => {
          if (resolved) return;
          resolved = true;
          window.clearTimeout(timeoutId);
          resolve(false);
        };

        try {
          synth.speak(utterance);
        } catch {
          window.clearTimeout(timeoutId);
          resolve(false);
        }
      });
    },
    [config.interviewLanguage],
  );

  const playAudioPayload = useCallback(
    async (payload: { audioBase64: string; mimeType: string }) => {
      if (!audioEl) return;
      if (!payload.audioBase64) return;

      stopTTS();
      audioEl.preload = 'auto';
      audioEl.muted = false;
      audioEl.volume = 1;
      setAudioElementSourceFromBase64(audioEl, payload);
      audioEl.load();

      await new Promise<void>((resolve, reject) => {
        const handleReady = () => {
          cleanup();
          resolve();
        };

        const handleError = () => {
          cleanup();
          reject(new Error('Falha ao carregar o audio.'));
        };

        const cleanup = () => {
          audioEl.removeEventListener('loadeddata', handleReady);
          audioEl.removeEventListener('canplay', handleReady);
          audioEl.removeEventListener('canplaythrough', handleReady);
          audioEl.removeEventListener('error', handleError);
        };

        if (audioEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          resolve();
          return;
        }

        audioEl.addEventListener('loadeddata', handleReady);
        audioEl.addEventListener('canplay', handleReady);
        audioEl.addEventListener('canplaythrough', handleReady);
        audioEl.addEventListener('error', handleError);
      });

      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          cleanup();
          resolve();
        }, 12000);

        const cleanup = () => {
          window.clearTimeout(timeoutId);
          audioEl.removeEventListener('ended', handleEnd);
          audioEl.removeEventListener('error', handleError);
        };

        const handleEnd = () => {
          cleanup();
          resolve();
        };

        const handleError = () => {
          cleanup();
          reject(new Error('Falha ao tocar o audio.'));
        };

        audioEl.addEventListener('ended', handleEnd);
        audioEl.addEventListener('error', handleError);

        audioEl.play().catch((error) => {
          cleanup();
          reject(error);
        });
      });
    },
    [audioEl, stopTTS],
  );

  const speakQuestion = useCallback(
    async (text: string, _voiceId?: string, options: QuestionSpeechOptions = {}) => {
      stopTTS();
      setQuestionAudioFallbackActive(false);

      const spokeLocally = await speakWithBrowserVoice(text).catch(() => false);
      if (spokeLocally) return;

      if (options.openTextFallback) {
        setQuestionAudioFallbackActive(true);
        if (isCompactLayout) {
          setAnswerMode('text');
        }
      }

      if (!options.suppressNotice) {
        showRuntimeNotice(
          options.notice ||
            (options.openTextFallback && isCompactLayout
              ? 'Nao foi possivel reproduzir o audio. Abrimos a pergunta em texto para voce continuar sem perder o fluxo.'
              : 'Audio da pergunta indisponivel no momento.'),
        );
      }
    },
    [isCompactLayout, showRuntimeNotice, speakWithBrowserVoice, stopTTS],
  );

  const resolveAvatarForQuestion = useCallback(
    async (questionId: string, prompt: string): Promise<AvatarResponse | null> => {
      const cached = avatarCacheRef.current[questionId];
      if (cached) return cached;
      const inflight = avatarRequestByQuestionIdRef.current.get(questionId);
      if (inflight) return inflight;
      const request = BackendApi.avatarRespond({
        text: prompt,
        language: config.interviewLanguage,
        sessionId,
      })
        .then((avatar) => {
          avatarCacheRef.current = { ...avatarCacheRef.current, [questionId]: avatar };
          setAvatarByQuestionId((prev) => ({ ...prev, [questionId]: avatar }));
          return avatar;
        })
        .catch((error) => {
          console.warn('Avatar respond fallback to regular TTS', error);
          return null;
        })
        .finally(() => {
          avatarRequestByQuestionIdRef.current.delete(questionId);
        });
      avatarRequestByQuestionIdRef.current.set(questionId, request);
      return request;
    },
    [config.interviewLanguage, sessionId],
  );

  const beginInterviewAfterOpening = useCallback(() => {
    resetCurrentAnswerAnalysis(null);
    setTextAnswer('');
    setPartialFeedback(null);
    setPartialTranscript('');
    partialTranscriptRef.current = '';
    partialFeedbackShownRef.current = false;
    currentSpeechMetricsRef.current = null;
    currentCommunicationAnalysisRef.current = null;
    answerMetricsRef.current = null;
    setLiveCoachInsight(null);
    setLiveCoachError(null);
    setLiveCoachLoading(false);
    setFlowState('idle');
    setConversationState('processing');
    setIntroPending(false);
  }, [resetCurrentAnswerAnalysis]);

  const askInterviewOpening = useCallback(async () => {
    setFlowState('asking');
    setConversationState('ai_speaking');
    const prompt = buildInterviewOpeningPrompt(config.style, config.interviewLanguage, candidateFirstName, {
      track: config.track,
      seniority: config.seniority,
      stacks: config.stacks,
    });
    const avatarPayload = await resolveAvatarForQuestion('__opening__', prompt);
    if (avatarPayload) {
      setCurrentAvatar(avatarPayload);
    }

    if (avatarPayload?.audio) {
      try {
        await playAudioPayload({ audioBase64: avatarPayload.audio, mimeType: avatarPayload.mimeType });
      } catch (error) {
        console.warn('Opening avatar playback failed, using fallback TTS', error);
        await speakQuestion(prompt, undefined, { openTextFallback: true });
      }
    } else {
      await speakQuestion(prompt, undefined, { openTextFallback: true });
    }

    setFlowState('awaiting_answer');
    setConversationState('listening');
  }, [
    candidateFirstName,
    config.interviewLanguage,
    config.seniority,
    config.stacks,
    config.style,
    config.track,
    playAudioPayload,
    resolveAvatarForQuestion,
    speakQuestion,
  ]);

  const clearNoResponseTimer = useCallback(() => {
    if (noResponseTimerRef.current) {
      window.clearTimeout(noResponseTimerRef.current);
      noResponseTimerRef.current = null;
    }
  }, []);

  const clearRecordingFailsafeTimer = useCallback(() => {
    if (recordingFailsafeTimerRef.current) {
      window.clearTimeout(recordingFailsafeTimerRef.current);
      recordingFailsafeTimerRef.current = null;
    }
  }, []);

  const stopVoiceMonitor = useCallback(() => {
    const monitor = voiceMonitorRef.current;
    if (monitor.rafId) {
      cancelAnimationFrame(monitor.rafId);
      monitor.rafId = null;
    }
    if (monitor.ctx) {
      monitor.ctx.close().catch(() => {});
    }
    voiceMonitorRef.current = { ctx: null, analyser: null, data: null, rafId: null };
  }, []);

  const startVoiceMonitor = useCallback(() => {
    if (!audioCapture.stream) return;
    stopVoiceMonitor();

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const data = new Uint8Array(analyser.fftSize);

      const source = ctx.createMediaStreamSource(audioCapture.stream);
      source.connect(analyser);

      const baselineStart = Date.now();
      const baselineSamples: number[] = [];

      const tick = () => {
        const now = Date.now();
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const analysis = answerMetricsRef.current;
        const deltaMs = analysis ? Math.max(0, now - analysis.lastTickAtMs) : 0;
        if (analysis) {
          analysis.lastTickAtMs = now;
        }

        if (!baselineDoneRef.current) {
          baselineSamples.push(rms);
          if (now - baselineStart >= 400) {
            const avg =
              baselineSamples.reduce((acc, val) => acc + val, 0) / Math.max(baselineSamples.length, 1);
            noiseThresholdRef.current = Math.max(SILENCE_THRESHOLD, avg * 2.5);
            baselineDoneRef.current = true;
          }
        }

        const isSpeakingNow = baselineDoneRef.current && rms > noiseThresholdRef.current;

        if (analysis && baselineDoneRef.current) {
          if (isSpeakingNow) {
            if (analysis.firstSpeechAtMs === null) {
              analysis.firstSpeechAtMs = now;
            }
            if (!analysis.wasSpeaking && analysis.silenceStartedAtMs) {
              const pauseDurationMs = Math.max(0, now - analysis.silenceStartedAtMs);
              if (pauseDurationMs >= 250) {
                analysis.pauseCount += 1;
                if (pauseDurationMs >= LONG_PAUSE_MS) {
                  analysis.longPauseCount += 1;
                  analysis.interruptionRecoveryCount += 1;
                }
              }
            }
            analysis.silenceStartedAtMs = null;
            analysis.wasSpeaking = true;
          } else if (analysis.firstSpeechAtMs !== null) {
            analysis.silenceDurationMs += deltaMs;
            if (analysis.wasSpeaking && analysis.silenceStartedAtMs === null) {
              analysis.silenceStartedAtMs = now;
            }
            analysis.wasSpeaking = false;
          }
        }

        if (isSpeakingNow) {
          hasSpokenRef.current = true;
          lastSoundAtRef.current = now;
        }

        if (hasSpokenRef.current && !autoStopRef.current) {
          if (now - lastSoundAtRef.current > SILENCE_STOP_MS) {
            autoStopRef.current = true;
            void stopRecordingFlowRef.current?.('auto');
            return;
          }
        }

        voiceMonitorRef.current.rafId = requestAnimationFrame(tick);
      };

      voiceMonitorRef.current = { ctx, analyser, data, rafId: requestAnimationFrame(tick) };
    } catch (error) {
      console.warn('Falha ao iniciar monitor de voz', error);
      showRuntimeNotice('Nao foi possivel monitorar sua voz. Continue normalmente.');
    }
  }, [audioCapture.stream, showRuntimeNotice, stopVoiceMonitor]);

  const finalizeInterview = useCallback(
    async (history: HistoryItem[]) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setFlowState('finalizing');
      setConversationState('processing');
      clearNoResponseTimer();
      clearRecordingFailsafeTimer();
      stopVoiceMonitor();
      stopTTS();
      try {
        showRuntimeNotice(t.generatingReport || 'Finalizando seu relatorio...');
        if (history.length > 0) {
          try {
            await speakQuestion(buildInterviewClosingPrompt(config.interviewLanguage, candidateFirstName), undefined, {
              suppressNotice: true,
            });
          } catch {}
        }
        await waitForPendingAnswerInsights();
        const finalizedHistory = historyRef.current.length >= history.length ? historyRef.current : history;
        const finalized = await BackendApi.orchestratorFinalize({
          config: sanitizedConfig,
          sessionId,
          history: finalizedHistory,
        });
        const weeklyPlan = Array.isArray(finalized.studyPlan?.weeklyPlan)
          ? finalized.studyPlan.weeklyPlan
              .map((item, index) => {
                if (!item || typeof item !== 'object') return null;
                const day = Number((item as Record<string, unknown>).day ?? index + 1);
                const task = String((item as Record<string, unknown>).task ?? '').trim();
                if (!task) return null;
                return { day, task };
              })
              .filter((item): item is { day: number; task: string } => Boolean(item))
          : [];

        const report =
          weeklyPlan.length > 0 && (!finalized.report.plan7Days || finalized.report.plan7Days.length === 0)
            ? { ...finalized.report, plan7Days: weeklyPlan }
            : finalized.report;
        const hasInterviewEvidence = finalizedHistory.some(
          (item) => String(item.questionId || '').trim() !== '__opening__' && String(item.transcript || '').trim().length > 0,
        );
        const normalizedReport = hasInterviewEvidence
          ? report
          : {
              ...report,
              reportStatus: 'insufficient_data' as const,
              reportWarnings: [
                ...new Set([
                  ...(report.reportWarnings || []),
                  'A entrevista foi encerrada cedo demais para gerar uma avaliacao confiavel. Use este resumo apenas como registro da sessao.',
                ]),
              ],
            };

        setFlowState('finished');
        setConversationState('idle');
        onFinish?.(normalizedReport);
      } catch (error) {
        console.warn('Falha ao gerar report', error);
        setFlowState('finished');
        setConversationState('idle');
        const errorMessage = error instanceof Error ? error.message : '';
        const isCreditFailure = /credito/i.test(errorMessage);
        const warningMessage = isCreditFailure
          ? 'Nao foi possivel consolidar o relatorio com IA por falta de creditos. Este resumo usa apenas sinais locais da sessao.'
          : 'Nao foi possivel consolidar o relatorio com IA. Este resumo usa apenas sinais locais da sessao.';
        showRuntimeNotice(warningMessage);
        const fallbackHistory = historyRef.current.length >= history.length ? historyRef.current : history;
        onFinish?.(
          buildFallbackReport(fallbackHistory, config, plan, {
            reason: isCreditFailure ? 'payment_required' : 'fallback',
            warning: warningMessage,
          }),
        );
      } finally {
        finishingRef.current = false;
      }
    },
    [
      clearNoResponseTimer,
      clearRecordingFailsafeTimer,
      config,
      candidateFirstName,
      onFinish,
      plan,
      sanitizedConfig,
      sessionId,
      showRuntimeNotice,
      speakQuestion,
      stopTTS,
      t.generatingReport,
      waitForPendingAnswerInsights,
    ],
  );

  const handleFinish = useCallback(async () => {
    if (isRecorderActive) {
      try {
        await audioCapture.stop();
      } catch {}
    }
    clearNoResponseTimer();
    clearRecordingFailsafeTimer();
    stopVoiceMonitor();
    await finalizeInterview(historyRef.current);
  }, [audioCapture, clearNoResponseTimer, clearRecordingFailsafeTimer, finalizeInterview, isRecorderActive, stopVoiceMonitor]);

  const askCurrentQuestion = useCallback(
    async (overridePrompt?: string) => {
      if (!currentQuestion) return;
      setFlowState('asking');
      setConversationState('ai_speaking');
      if (!audioEl) {
        setFlowState('awaiting_answer');
        setConversationState('listening');
        return;
      }
      const prompt = overridePrompt || buildSpokenPrompt(
        currentQuestion.title,
        currentIndex,
        config.style,
        config.interviewLanguage,
        candidateFirstName,
        {
          track: config.track,
          seniority: config.seniority,
          stacks: config.stacks,
        },
        {
          isLastQuestion: currentIndex === fallbackMaxQuestions - 1,
        },
      );
      const cachedAvatar = avatarCacheRef.current[currentQuestion.id];
      const avatarPayload = cachedAvatar || await resolveAvatarForQuestion(currentQuestion.id, prompt);
      const playableAvatar = avatarPayload || (currentIndex === 0 ? initialAvatar || null : null);
      if (playableAvatar) {
        setCurrentAvatar(playableAvatar);
      }

      if (playableAvatar?.audio) {
        try {
          await playAudioPayload({ audioBase64: playableAvatar.audio, mimeType: playableAvatar.mimeType });
        } catch (error) {
          console.warn('Avatar audio playback failed, using fallback TTS', error);
          await speakQuestion(prompt, undefined, { openTextFallback: true });
        }
      } else {
        await speakQuestion(prompt, undefined, { openTextFallback: true });
      }
      setFlowState('awaiting_answer');
      setConversationState('listening');
    },
    [
      audioEl,
      config.interviewLanguage,
      config.seniority,
      config.stacks,
      config.style,
      config.track,
      candidateFirstName,
      currentIndex,
      currentQuestion,
      fallbackMaxQuestions,
      initialAvatar,
      playAudioPayload,
      resolveAvatarForQuestion,
      speakQuestion,
    ],
  );

  const handleNoResponse = useCallback(async () => {
    clearNoResponseTimer();
    clearRecordingFailsafeTimer();
    stopVoiceMonitor();
    resetCurrentAnswerAnalysis(null);
    if (isRecorderActiveRef.current) {
      try {
        await audioCapture.stop();
      } catch {}
    }
    if (isOpeningStep) {
      setFlowState('asking');
      setConversationState('ai_speaking');
      try {
        await speakQuestion(buildInterviewOpeningRetryPrompt(config.interviewLanguage, candidateFirstName), undefined, {
          openTextFallback: true,
        });
      } catch {}
      setFlowState('awaiting_answer');
      setConversationState('listening');
      return;
    }
    setFlowState('no_response');
    setConversationState('ai_speaking');
    try {
      await speakQuestion(buildNoResponsePrompt(config.interviewLanguage), undefined, {
        openTextFallback: true,
      });
    } catch {}
    setConversationState('listening');
  }, [
    audioCapture,
    clearNoResponseTimer,
    clearRecordingFailsafeTimer,
    candidateFirstName,
    config.interviewLanguage,
    isOpeningStep,
    resetCurrentAnswerAnalysis,
    speakQuestion,
    stopVoiceMonitor,
  ]);

  const startRecordingFlow = useCallback(async () => {
    if (flowState !== 'awaiting_answer') return;
    try {
      const nextAnswerId = buildAnswerId();
      resetCurrentAnswerAnalysis(nextAnswerId);
      await audioCapture.start();
      setFlowState('recording');
      setConversationState('candidate_speaking');
      hasSpokenRef.current = false;
      lastSoundAtRef.current = Date.now();
      autoStopRef.current = false;
      baselineDoneRef.current = false;
      noiseThresholdRef.current = SILENCE_THRESHOLD;
      startVoiceMonitor();
      clearNoResponseTimer();
      clearRecordingFailsafeTimer();
      noResponseTimerRef.current = window.setTimeout(() => {
        if (!hasSpokenRef.current) {
          void handleNoResponseRef.current?.();
        }
      }, NO_RESPONSE_MS);
      recordingFailsafeTimerRef.current = window.setTimeout(() => {
        if (!stopInProgressRef.current) {
          void stopRecordingFlowRef.current?.('auto');
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      console.warn(error);
      showRuntimeNotice('Nao foi possivel iniciar a gravacao. Verifique permissoes de microfone.');
    }
  }, [
    audioCapture,
    buildAnswerId,
    clearNoResponseTimer,
    clearRecordingFailsafeTimer,
    flowState,
    handleNoResponse,
    resetCurrentAnswerAnalysis,
    showRuntimeNotice,
    startVoiceMonitor,
  ]);

  const continueLocallyAfterAnswer = useCallback(
    async (
      historyItem: HistoryItem,
      options?: {
        onHistoryCommitted?: (nextHistory: HistoryItem[]) => void;
      },
    ) => {
      const nextHistory = [...historyRef.current, historyItem];
      historyRef.current = nextHistory;
      options?.onHistoryCommitted?.(nextHistory);

      const nextIndex = currentIndex + 1;
      if (remainingSeconds <= 0 || timeLimitReached || nextIndex >= fallbackMaxQuestions) {
        resetCurrentAnswerAnalysis(null);
        await finalizeInterview(nextHistory);
        return;
      }

      let nextQuestion = questions[nextIndex];
      if (!nextQuestion) {
        const fallbackPrompt = getLocalFallbackPrompt(config.track, config.interviewLanguage, nextIndex, {
          askedPrompts: nextHistory.map((item) => item.question),
          seed: sessionId || `${config.track}:${config.seniority}`,
        });
        if (!fallbackPrompt) {
          resetCurrentAnswerAnalysis(null);
          await finalizeInterview(nextHistory);
          return;
        }

        nextQuestion = toUiQuestion(
          {
            id: `local-q${nextIndex + 1}`,
            prompt: fallbackPrompt,
            section: currentQuestion.section || 'technical',
            difficulty: currentQuestion.sourceDifficulty || 3,
          },
          nextIndex,
          baseBullets,
        );

        setQuestions((prev) => {
          const next = [...prev];
          if (next[nextIndex]) {
            next[nextIndex] = nextQuestion;
          } else {
            next.push(nextQuestion);
          }
          return next;
        });
      }

      resetCurrentAnswerAnalysis(null);
      setFlowState('next_question');
      setConversationState('processing');
      const nextSpokenPrompt = buildSpokenPrompt(
        nextQuestion.title,
        nextIndex,
        config.style,
        config.interviewLanguage,
        candidateFirstName,
        {
          track: config.track,
          seniority: config.seniority,
          stacks: config.stacks,
        },
        {
          isLastQuestion: nextIndex === fallbackMaxQuestions - 1,
        },
      );
      void resolveAvatarForQuestion(nextQuestion.id, nextSpokenPrompt);
    },
    [
      baseBullets,
      candidateFirstName,
      config.interviewLanguage,
      config.seniority,
      config.stacks,
      config.style,
      config.track,
      currentIndex,
      currentQuestion.section,
      currentQuestion.sourceDifficulty,
      fallbackMaxQuestions,
      finalizeInterview,
      questions,
      remainingSeconds,
      resetCurrentAnswerAnalysis,
      resolveAvatarForQuestion,
      sessionId,
      timeLimitReached,
    ],
  );

  const continueAfterAnswer = useCallback(
    async (
      historyItem: HistoryItem,
      options?: {
        onHistoryCommitted?: (nextHistory: HistoryItem[]) => void;
      },
    ) => {
      try {
        const turnResponse = await BackendApi.orchestratorTurn({
          config: sanitizedConfig,
          sessionId,
          history: historyRef.current.map((item) => ({ ...item })),
          question: historyItem.question,
          remainingSeconds,
          difficultyLevel: technicalDifficultyLevel,
          confirmedName: candidateFirstName,
          answerId: historyItem.answerId,
          interviewMode,
          speechMetrics: historyItem.speechMetrics || currentSpeechMetricsRef.current || undefined,
          transcript: historyItem.transcript,
          clientRuntime: historyItem.clientRuntime || undefined,
          includeAvatar: true,
        });

        const committedHistoryItem: HistoryItem = {
          ...historyItem,
          transcript: turnResponse.evaluation?.transcript || historyItem.transcript,
          evaluation: turnResponse.evaluation,
          speechMetrics:
            turnResponse.communicationAnalysis?.speechMetrics ||
            historyItem.speechMetrics ||
            currentSpeechMetricsRef.current ||
            null,
          communicationAnalysis: turnResponse.communicationAnalysis || null,
          clientRuntime: historyItem.clientRuntime || null,
        };

        const nextHistory = [...historyRef.current, committedHistoryItem];
        historyRef.current = nextHistory;
        options?.onHistoryCommitted?.(nextHistory);

        currentSpeechMetricsRef.current = committedHistoryItem.speechMetrics || null;
        currentCommunicationAnalysisRef.current = committedHistoryItem.communicationAnalysis || null;

        const nextIndex = currentIndex + 1;
        const nextQuestionPayload = turnResponse.nextQuestion;
        if (
          remainingSeconds <= 0 ||
          timeLimitReached ||
          nextIndex >= fallbackMaxQuestions ||
          nextQuestionPayload?.shouldFinish ||
          !nextQuestionPayload?.question
        ) {
          resetCurrentAnswerAnalysis(null);
          await finalizeInterview(nextHistory);
          return;
        }

        const nextQuestion = toUiQuestion(nextQuestionPayload.question, nextIndex, baseBullets);
        setQuestions((prev) => {
          const next = [...prev];
          if (next[nextIndex]) {
            next[nextIndex] = nextQuestion;
          } else {
            next.push(nextQuestion);
          }
          return next;
        });

        if (turnResponse.avatar) {
          avatarCacheRef.current = { ...avatarCacheRef.current, [nextQuestion.id]: turnResponse.avatar };
          setAvatarByQuestionId((prev) => ({ ...prev, [nextQuestion.id]: turnResponse.avatar as AvatarResponse }));
        }

        resetCurrentAnswerAnalysis(null);
        setFlowState('next_question');
        setConversationState('processing');
      } catch (error) {
        console.warn('Falling back to local turn progression', error);
        await continueLocallyAfterAnswer(historyItem, options);
      }
    },
    [
      baseBullets,
      candidateFirstName,
      continueLocallyAfterAnswer,
      currentIndex,
      fallbackMaxQuestions,
      finalizeInterview,
      interviewMode,
      remainingSeconds,
      resetCurrentAnswerAnalysis,
      sanitizedConfig,
      technicalDifficultyLevel,
      sessionId,
      timeLimitReached,
    ],
  );

  const stopRecordingFlow = useCallback(
    async (_reason: 'manual' | 'auto') => {
      if (flowState !== 'recording' && !isRecorderActiveRef.current) return;
      if (stopInProgressRef.current) return;
      stopInProgressRef.current = true;
      clearNoResponseTimer();
      clearRecordingFailsafeTimer();
      stopVoiceMonitor();
      setFlowState('evaluating');
      setConversationState('processing');
      try {
        const blob = await audioCapture.stop();
        const transcript = partialTranscriptRef.current;
        const speechMetrics = computeSpeechMetrics(
          transcript,
          answerMetricsRef.current ? Date.now() - answerMetricsRef.current.startedAtMs : undefined,
        );
        if (isOpeningStep) {
          if (
            !hasOpeningAcknowledgement({
              transcript,
              audioSize: blob.size,
              localSpeechDetected: hasSpokenRef.current,
              speechMetrics,
            })
          ) {
            resetCurrentAnswerAnalysis(null);
            setFlowState('asking');
            setConversationState('ai_speaking');
            try {
              await speakQuestion(buildInterviewOpeningRetryPrompt(config.interviewLanguage, candidateFirstName), undefined, {
                openTextFallback: true,
              });
            } catch {}
            setFlowState('awaiting_answer');
            setConversationState('listening');
            return;
          }

          beginInterviewAfterOpening();
          return;
        }
        if (
          !shouldAttemptAudioEvaluation({
            transcript,
            speechMetrics,
            audioSize: blob.size,
            localSpeechDetected: hasSpokenRef.current,
          })
        ) {
          resetCurrentAnswerAnalysis(null);
          setFlowState('no_response');
          setConversationState('ai_speaking');
          try {
            await speakQuestion(buildNoResponsePrompt(config.interviewLanguage), undefined, {
              openTextFallback: true,
            });
          } catch {}
          setConversationState('listening');
          return;
        }
        const answerId = activeAnswerId || buildAnswerId();
        const historyItem: HistoryItem = {
          answerId,
          questionId: currentQuestion.id,
          question: currentQuestion.title,
          section: currentQuestion.section,
          difficulty: currentQuestion.sourceDifficulty,
          transcript,
          speechMetrics,
          clientRuntime: currentTurnRuntimeTraceRef.current || null,
        };
        await continueAfterAnswer(historyItem, {
          onHistoryCommitted: (nextHistory) => {
            queueDeferredAnswerInsight({
              answerId,
              questionText: currentQuestion.title,
              historySnapshot: nextHistory,
              transcript,
              speechMetrics,
              audioBlob: blob,
              mimeType: blob.type || 'audio/webm',
            });
          },
        });
      } catch (error) {
        console.warn(error);
        showRuntimeNotice('Nao foi possivel processar sua resposta. Tente novamente.');
        setFlowState('awaiting_answer');
        setConversationState('listening');
      } finally {
        stopInProgressRef.current = false;
      }
    },
    [
      clearNoResponseTimer,
      clearRecordingFailsafeTimer,
      continueAfterAnswer,
      flowState,
      showRuntimeNotice,
      audioCapture,
      activeAnswerId,
      buildAnswerId,
      computeSpeechMetrics,
      stopVoiceMonitor,
      beginInterviewAfterOpening,
      candidateFirstName,
      config.interviewLanguage,
      isOpeningStep,
      currentQuestion.id,
      currentQuestion.title,
      currentQuestion.section,
      currentQuestion.sourceDifficulty,
      queueDeferredAnswerInsight,
      resetCurrentAnswerAnalysis,
      speakQuestion,
    ],
  );

  const submitTextAnswer = useCallback(async () => {
    if (!currentQuestion) return;
    if (flowState !== 'awaiting_answer') return;

    const transcript = textAnswer.trim();
    if (!transcript) {
      showRuntimeNotice('Digite sua resposta antes de enviar.');
      return;
    }

    clearNoResponseTimer();
    stopVoiceMonitor();
    if (isOpeningStep) {
      setTextAnswer('');
      beginInterviewAfterOpening();
      return;
    }
    const nextAnswerId = activeAnswerId || buildAnswerId();
    if (!activeAnswerId) {
      resetCurrentAnswerAnalysis(nextAnswerId);
    }
    setFlowState('evaluating');
    setConversationState('processing');
    try {
      setTextAnswer('');
      const historyItem: HistoryItem = {
        answerId: nextAnswerId,
        questionId: currentQuestion.id,
        question: currentQuestion.title,
        section: currentQuestion.section,
        difficulty: currentQuestion.sourceDifficulty,
        transcript,
        clientRuntime: currentTurnRuntimeTraceRef.current || null,
      };
      await continueAfterAnswer(historyItem, {
        onHistoryCommitted: (nextHistory) => {
          queueDeferredAnswerInsight({
            answerId: nextAnswerId,
            questionText: currentQuestion.title,
            historySnapshot: nextHistory,
            transcript,
            mimeType: 'text/plain',
          });
        },
      });
    } catch (error) {
      console.warn(error);
      showRuntimeNotice('Nao foi possivel processar a resposta em texto.');
      setFlowState('awaiting_answer');
      setConversationState('listening');
    }
  }, [
    clearNoResponseTimer,
    continueAfterAnswer,
    buildAnswerId,
    currentQuestion,
    flowState,
    activeAnswerId,
    beginInterviewAfterOpening,
    resetCurrentAnswerAnalysis,
    isOpeningStep,
    showRuntimeNotice,
    stopVoiceMonitor,
    textAnswer,
    queueDeferredAnswerInsight,
  ]);

  useEffect(() => {
    stopRecordingFlowRef.current = stopRecordingFlow;
  }, [stopRecordingFlow]);

  useEffect(() => {
    handleNoResponseRef.current = handleNoResponse;
  }, [handleNoResponse]);

  useEffect(() => {
    liveCoachWsDisabledRef.current = false;
    closeLiveCoachSocket('session_reset');
    historyRef.current = [];
    setCurrentIndex(0);
    setIntroPending(true);
    setFlowState('idle');
    setConversationState('idle');
    setAnswerMode('audio');
    setTextAnswer('');
    setActiveAnswerId(null);
    setTimeLimitReached(false);
    setRemainingSeconds(totalSeconds);
    setQuestions(baseQuestions);
    setLiveCoachFeed([]);
    setPartialFeedback(null);
    setPartialTranscript('');
    setAvatarByQuestionId(initialAvatarByQuestionId);
    avatarCacheRef.current = initialAvatarByQuestionId;
    avatarRequestByQuestionIdRef.current.clear();
    pendingAnswerInsightsRef.current.clear();
    setCurrentAvatar(null);
    liveCoachFeedRef.current = [];
    partialTranscriptRef.current = '';
    partialFeedbackShownRef.current = false;
    currentSpeechMetricsRef.current = null;
    currentCommunicationAnalysisRef.current = null;
    answerMetricsRef.current = null;
    previousRuntimePhaseRef.current = null;
    runtimeLatencyRef.current = {
      questionDeliveryMs: null,
      analysisLatencyMs: null,
    };
    liveCoachChunkIndexRef.current = 0;
    startTimeRef.current = Date.now();
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }
    if (totalSeconds > 0) {
      timerRef.current = window.setInterval(() => {
        if (!startTimeRef.current) return;
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const remaining = Math.max(0, totalSeconds - elapsed);
        setRemainingSeconds(remaining);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      clearNoResponseTimer();
      clearRecordingFailsafeTimer();
      stopVoiceMonitor();
      closeLiveCoachSocket('session_cleanup');
    };
  }, [
    baseQuestions,
    clearNoResponseTimer,
    clearRecordingFailsafeTimer,
    closeLiveCoachSocket,
    initialAvatarByQuestionId,
    stopVoiceMonitor,
    totalSeconds,
  ]);

  useEffect(() => {
    avatarCacheRef.current = avatarByQuestionId;
  }, [avatarByQuestionId]);

  useEffect(() => {
    setTextAnswer('');
    setLiveCoachInsight(null);
    setLiveCoachError(null);
    setLiveCoachLoading(false);
    setPartialFeedback(null);
    setPartialTranscript('');
    setActiveAnswerId(null);
    setCurrentAvatar(
      isOpeningStep
        ? avatarCacheRef.current.__opening__ || null
        : currentQuestion
          ? avatarCacheRef.current[currentQuestion.id] || null
          : null,
    );
    partialTranscriptRef.current = '';
    partialFeedbackShownRef.current = false;
    currentSpeechMetricsRef.current = null;
    currentCommunicationAnalysisRef.current = null;
    answerMetricsRef.current = null;
    liveCoachChunkInFlightRef.current = false;
    lastLiveCoachChunkAtRef.current = 0;
    liveCoachChunkIndexRef.current = 0;
  }, [currentQuestion?.id, isOpeningStep]);

  useEffect(() => {
    setCurrentAvatar(
      isOpeningStep
        ? avatarByQuestionId.__opening__ || null
        : currentQuestion
          ? avatarByQuestionId[currentQuestion.id] || null
          : null,
    );
  }, [avatarByQuestionId, currentQuestion?.id, isOpeningStep]);

  useEffect(() => {
    liveCoachChunkHandlerRef.current = handleLiveCoachChunk;
  }, [handleLiveCoachChunk]);

  useEffect(() => {
    liveCoachFeedRef.current = liveCoachFeed;
  }, [liveCoachFeed]);

  useEffect(() => {
    return () => {
      closeLiveCoachSocket('component_unmount');
    };
  }, [closeLiveCoachSocket]);

  useEffect(() => {
    if (timeLimitReached) return;
    if (totalSeconds <= 0) return;
    if (flowState === 'finished') return;
    if (remainingSeconds > 0) return;
    if (finishingRef.current) return;
    setTimeLimitReached(true);
    handleFinish();
  }, [flowState, handleFinish, remainingSeconds, timeLimitReached, totalSeconds]);

  useEffect(() => {
    if (flowState !== 'finished') return;
    setConversationState('idle');
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [flowState]);

  useEffect(() => {
    if (!currentQuestion) return;
    const run = async () => {
      if (isOpeningStep) {
        await askInterviewOpening();
        return;
      }
      await askCurrentQuestion();
    };

    run();

    return () => {
      stopTTS();
    };
  }, [askCurrentQuestion, askInterviewOpening, currentIndex, currentQuestion?.id, currentQuestion?.title, isOpeningStep, stopTTS]);

  useEffect(() => {
    if (flowState !== 'next_question') return;
    if (!questions.length) return;
    const id = window.setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
    }, NEXT_QUESTION_TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [flowState, questions.length]);

  useEffect(() => {
    const activeError = mediaError || recorderError;
    if (!activeError) return;
    showRuntimeNotice(activeError);
  }, [mediaError, recorderError, showRuntimeNotice]);

  useEffect(() => {
    if (!AUTO_MODE) return;
    if (flowState !== 'awaiting_answer') return;
    if (answerMode !== 'audio') return;
    if (!isMediaReady) return;
    if (flowState === 'no_response') return;
    if (isRecorderActive) return;
    startRecordingFlow();
  }, [answerMode, flowState, isMediaReady, isRecorderActive, startRecordingFlow]);

  const isRecording = flowState === 'recording' || isRecorderActive;
  const isLoading = flowState === 'idle' || !currentQuestion;
  const isAvatarSpeaking = isSpeaking || flowState === 'asking' || conversationState === 'ai_speaking';
  const isFinished = flowState === 'finished';
  const isTextMode = answerMode === 'text';
  const textModeInteractive = isTextMode && !isFinished && flowState !== 'finalizing' && flowState !== 'no_response';
  const textEntryEnabled = flowState === 'awaiting_answer' || flowState === 'evaluating';
  const canSubmitText = isTextMode && flowState === 'awaiting_answer' && textAnswer.trim().length > 0;

  const canStartRecording = flowState === 'awaiting_answer' && isMediaReady && !isTextMode;
  const actionDisabled =
    isFinished ||
    flowState === 'evaluating' ||
    flowState === 'finalizing' ||
    flowState === 'no_response' ||
    !(canStartRecording || flowState === 'recording');

  const actionLabel =
    flowState === 'finalizing'
      ? 'FINALIZANDO'
      : flowState === 'evaluating'
      ? DEFER_ANSWER_REVIEW_TO_FINAL
        ? 'PROCESSANDO'
        : 'AVALIANDO'
      : isFinished
        ? 'ENCERRADO'
        : isRecording
          ? 'PARAR GRAVACAO'
          : 'COMECAR RESPOSTA';

  const latestHistoryItem = historyRef.current[historyRef.current.length - 1];
  const latestEvaluation =
    latestHistoryItem?.questionId && latestHistoryItem.questionId === currentQuestion?.id
      ? latestHistoryItem.evaluation
      : null;
  const responseQuality =
    latestEvaluation?.criteriaScores?.technicalPrecision ??
    latestEvaluation?.scores?.technical ??
    null;
  const confidenceScore =
    latestEvaluation?.criteriaScores?.communication ??
    latestEvaluation?.scores?.communication ??
    null;

  const responseQualityLabel =
    typeof responseQuality === 'number' ? responseQuality.toFixed(1) : '--';
  const confidenceLabel =
    typeof confidenceScore === 'number' ? confidenceScore.toFixed(1) : '--';
  const hasMeasuredSpeechSignals =
    typeof responseQuality === 'number' || typeof confidenceScore === 'number';
  const conversationStateLabelMap: Record<ConversationState, string> = {
    idle: 'aguardando',
    listening: 'escutando',
    processing: 'processando',
    ai_speaking: 'ia falando',
    candidate_speaking: 'candidato falando',
  };
  const conversationStateLabel = conversationStateLabelMap[conversationState];
  const avatarInterviewState: AvatarInterviewState =
    conversationState === 'ai_speaking'
      ? 'avatar_speaking'
      : conversationState === 'processing'
        ? 'avatar_thinking'
        : conversationState === 'listening' || conversationState === 'candidate_speaking'
          ? 'avatar_listening'
          : 'idle';
  const audioTransportState =
    audioCapture.state === 'paused'
      ? 'paused'
      : audioCapture.uploadState === 'retry_pending'
        ? 'retry_pending'
        : audioCapture.uploadState === 'uploading'
          ? 'uploading'
          : audioCapture.state;

  const sideStatusText =
    audioCapture.state === 'paused'
      ? 'Gravacao pausada. Retome quando estiver pronto para continuar a resposta.'
      : flowState === 'finalizing'
        ? (t.generatingReport || 'Finalizando seu relatorio...')
      : isOpeningStep
        ? `${candidateFirstName}, responda a saudacao inicial para comecarmos a entrevista.`
      : conversationState === 'processing'
      ? DEFER_ANSWER_REVIEW_TO_FINAL
        ? 'Preparando a proxima etapa da entrevista...'
        : 'IA analisando sua resposta...'
      : conversationState === 'ai_speaking'
        ? `Entrevistadora conduzindo a pergunta para ${candidateFirstName}.`
        : conversationState === 'candidate_speaking'
          ? isCandidateCoachingMode
            ? `${candidateFirstName}, voce esta respondendo. Continue com exemplos concretos.`
            : `${candidateFirstName}, voce esta respondendo. A sessao segue em modo avaliativo.`
          : conversationState === 'listening'
            ? isCandidateCoachingMode
              ? `${candidateFirstName}, pode responder quando estiver pronto.`
              : `${candidateFirstName}, pode responder quando estiver pronto. O entrevistador vai apenas observar sua resposta.`
            : flowState === 'next_question'
        ? 'Proxima pergunta em instantes.'
        : flowState === 'awaiting_answer' || flowState === 'recording'
          ? isCandidateCoachingMode
            ? `${candidateFirstName}, responda quando estiver pronto.`
            : `${candidateFirstName}, responda quando estiver pronto. Esta entrevista esta em modo de avaliacao.`
          : flowState === 'asking'
            ? 'Escute a pergunta e prepare sua resposta.'
            : isFinished
              ? 'Entrevista encerrada.'
              : 'Preparando entrevista...';
  const inlineCoachEnabled = isCandidateCoachingMode && !DEFER_ANSWER_REVIEW_TO_FINAL;
  const partialFeedbackVisible = Boolean(partialFeedback && inlineCoachEnabled);
  const showLiveCoachPanel = inlineCoachEnabled && !isFinished && (liveCoachLoading || liveCoachInsight || liveCoachError);
  const showPartialTranscript = inlineCoachEnabled && !isFinished && flowState === 'recording' && Boolean(partialTranscript);
  const stageElapsedMs = Math.max(0, runtimeClockMs - stageStartedAtRef.current);
  const sessionElapsedSeconds =
    totalSeconds > 0
      ? Math.max(0, totalSeconds - remainingSeconds)
      : startTimeRef.current
        ? Math.max(0, Math.floor((runtimeClockMs - startTimeRef.current) / 1000))
        : 0;
  const runtimeState = useMemo(
    () =>
      deriveInterviewRuntimeState({
        flowState,
        conversationState,
        isOpeningStep,
        isTextMode,
        isFinished,
        isMediaReady,
        isMicrophoneReady: audioCapture.isMicrophoneReady,
        isCandidateCoachingMode,
        questionAudioFallbackActive,
        runtimeNotice,
        timeLimitReached,
        textEntryEnabled,
        candidateFirstName,
        audioCaptureState: audioCapture.state,
        audioUploadState: audioCapture.uploadState,
        pendingChunkCount: audioCapture.pendingChunkCount,
        partialTranscriptActive: showPartialTranscript,
        partialFeedbackVisible,
        showLiveCoachPanel,
        liveCoachLoading,
        liveCoachError,
        hasLiveCoachInsight: Boolean(liveCoachInsight?.suggestion || liveCoachInsight?.keyPoints?.length),
        liveCoachFeedCount: liveCoachFeed.length,
        currentQuestionIndex: currentIndex,
        totalQuestions: fallbackMaxQuestions,
        stageElapsedMs,
        sessionElapsedSeconds,
        questionDeliveryLatencyMs: runtimeLatencyRef.current.questionDeliveryMs,
        analysisLatencyMs: runtimeLatencyRef.current.analysisLatencyMs,
      }),
    [
      audioCapture.isMicrophoneReady,
      audioCapture.pendingChunkCount,
      audioCapture.state,
      audioCapture.uploadState,
      candidateFirstName,
      conversationState,
      currentIndex,
      fallbackMaxQuestions,
      flowState,
      isCandidateCoachingMode,
      isFinished,
      isMediaReady,
      isOpeningStep,
      isTextMode,
      liveCoachError,
      liveCoachFeed.length,
      liveCoachInsight,
      liveCoachLoading,
      partialFeedbackVisible,
      questionAudioFallbackActive,
      runtimeNotice,
      sessionElapsedSeconds,
      showPartialTranscript,
      showLiveCoachPanel,
      stageElapsedMs,
      textEntryEnabled,
      timeLimitReached,
    ],
  );
  const currentTurnRuntimeTrace = useMemo<SessionClientRuntimeTrace>(
    () => ({
      headline: runtimeState.headline,
      tone: runtimeState.tone,
      questionDeliveryLatencyMs: runtimeLatencyRef.current.questionDeliveryMs,
      analysisLatencyMs: runtimeLatencyRef.current.analysisLatencyMs,
      stageElapsedMs,
      sessionElapsedSeconds,
      pendingChunkCount: audioCapture.pendingChunkCount,
      partialTranscriptActive: showPartialTranscript,
      partialFeedbackVisible,
      showLiveCoachPanel,
      transportState: runtimeState.metrics.find((item) => item.label === 'Transporte')?.value || null,
      progressState: runtimeState.metrics.find((item) => item.label === 'Progresso')?.value || null,
      avatarState: runtimeState.signals.find((item) => item.label === 'Avatar')?.value || null,
      coachState: runtimeState.signals.find((item) => item.label === 'Coach')?.value || null,
    }),
    [
      audioCapture.pendingChunkCount,
      partialFeedbackVisible,
      runtimeState,
      sessionElapsedSeconds,
      showLiveCoachPanel,
      showPartialTranscript,
      stageElapsedMs,
    ],
  );
  useEffect(() => {
    currentTurnRuntimeTraceRef.current = currentTurnRuntimeTrace;
  }, [currentTurnRuntimeTrace]);
  const textModePrompt = isOpeningStep
    ? 'Responda algo breve para confirmar que podemos comecar.'
    : currentQuestion?.title ?? 'A pergunta atual vai aparecer aqui assim que a IA concluir a transicao.';
  const actionPrompt = isFinished
    ? 'Entrevista encerrada.'
    : questionAudioFallbackActive
      ? 'Audio indisponivel. Leia a pergunta em texto e responda quando estiver pronto.'
    : isTextMode
      ? textEntryEnabled
        ? interviewModeLevel === 1
          ? interviewModeLevelMeta.roomHint
          : 'Leia a pergunta e envie sua resposta quando estiver pronto.'
        : 'Aguarde a IA concluir a pergunta para liberar a resposta em texto.'
      : flowState === 'recording'
        ? 'Sua resposta esta em gravacao. Pause ou finalize quando concluir.'
        : flowState === 'awaiting_answer'
          ? interviewModeLevel === 3
            ? 'Responda com base no que voce ouviu. Use o modo texto se precisar revisar o enunciado.'
            : interviewModeLevel === 1
              ? interviewModeLevelMeta.roomHint
              : 'Sua vez. Toque em comecar resposta quando estiver pronto.'
            : flowState === 'asking'
              ? interviewModeLevel === 3
                ? 'A IA esta conduzindo a pergunta por voz para simular a entrevista real.'
                : 'A IA esta conduzindo a pergunta.'
              : flowState === 'next_question' || conversationState === 'processing'
                ? 'Preparando a proxima etapa da entrevista.'
                : 'A entrevista sera liberada assim que a IA concluir a abertura.';

  const topStacks = (config.stacks || []).slice(0, 3);
  const interviewRoleLabel = plan.roleTitleGuess || config.track || 'Entrevista';
  const roleSummaryItems = [
    { label: 'Candidato', value: candidateFirstName, priority: 'primary' as const },
    { label: 'Trilha', value: interviewRoleLabel, priority: 'primary' as const },
    { label: 'Modo', value: interviewModeLabel, priority: 'primary' as const },
    { label: 'Formato', value: interviewModeLevelMeta.label, priority: 'secondary' as const },
    {
      label: 'Ritmo',
      value: `${FIXED_INTERVIEW_QUESTION_COUNT} perguntas / ${FIXED_INTERVIEW_DURATION_MINUTES} min`,
      priority: 'secondary' as const,
    },
    {
      label: 'Stack',
      value: topStacks.length ? topStacks.join(', ') : 'Nao informado',
      priority: 'secondary' as const,
    },
  ];
  const isAudioConfigExpanded = showMicrophoneSelector || !audioCapture.isMicrophoneReady;

  const handlePrimaryAction = async () => {
    if (!currentQuestion) return;
    if (flowState === 'evaluating' || flowState === 'finalizing' || isFinished) return;

    if (flowState === 'awaiting_answer') {
      await startRecordingFlow();
      return;
    }

    if (flowState === 'recording') {
      await stopRecordingFlow('manual');
    }
  };

  const handlePauseAnswer = () => {
    if (flowState !== 'recording') return;
    audioCapture.pause();
    if (answerMetricsRef.current) {
      answerMetricsRef.current.lastTickAtMs = Date.now();
      answerMetricsRef.current.silenceStartedAtMs = null;
      answerMetricsRef.current.wasSpeaking = false;
    }
    clearNoResponseTimer();
    clearRecordingFailsafeTimer();
    stopVoiceMonitor();
    setConversationState('listening');
  };

  const handleResumeAnswer = async () => {
    if (audioCapture.state !== 'paused') return;
    audioCapture.resume();
    setConversationState('candidate_speaking');
    if (answerMetricsRef.current) {
      answerMetricsRef.current.lastTickAtMs = Date.now();
      answerMetricsRef.current.silenceStartedAtMs = null;
    }
    lastSoundAtRef.current = Date.now();
    autoStopRef.current = false;
    startVoiceMonitor();
    clearNoResponseTimer();
    clearRecordingFailsafeTimer();
    noResponseTimerRef.current = window.setTimeout(() => {
      if (!hasSpokenRef.current) {
        void handleNoResponseRef.current?.();
      }
    }, NO_RESPONSE_MS);
    recordingFailsafeTimerRef.current = window.setTimeout(() => {
      if (!stopInProgressRef.current) {
        void stopRecordingFlowRef.current?.('auto');
      }
    }, MAX_RECORDING_MS);
  };

  const handleModeChange = (nextMode: AnswerMode) => {
    if (isFinished || flowState === 'evaluating' || flowState === 'recording' || audioCapture.state === 'paused') return;
    setAnswerMode(nextMode);
    clearNoResponseTimer();
    setConversationState('listening');
    resetCurrentAnswerAnalysis(null);
    if (nextMode === 'text') {
      stopVoiceMonitor();
    }
  };

  return (
    <div className={styles.room} aria-label="Tela de entrevista">
      <header className={styles.brandHeader}>
        <div className={styles.brandRow}>
          <div className={styles.brandLogo}>
            <img src="/img/logo.png" alt="Dev Interview AI" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h1 className={styles.brandTitle}>
            Dev Interview <strong>AI</strong>
          </h1>
        </div>
        <div className={styles.brandSummary} aria-label="Resumo da entrevista">
          {roleSummaryItems.map((item) => (
            <div
              key={item.label}
              className={`${styles.brandSummaryItem} ${
                item.priority === 'secondary' ? styles.brandSummaryItemSecondary : ''
              }`}
            >
              <span className={styles.brandSummaryLabel}>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </header>

      <div className={styles.topBarArea}>
        <div className={styles.topBarInner}>
          <TopBar
            timer={timerLabel}
            stage={stageLabel}
            backLabel="VOLTAR"
            onBack={onBack}
            finishLabel="FINALIZAR ENTREVISTA"
            onFinish={handleFinish}
            showMeta={true}
          />
        </div>
      </div>

      <section className={styles.content} aria-label="Sala de entrevista">
        <div className={styles.grid}>
          {isCompactLayout ? (
            <div className={styles.mobileStage}>
              <AvatarInterview
                avatar={currentAvatar}
                state={avatarInterviewState}
                mouthOpen={isAvatarSpeaking ? mouthOpen : 0}
              />
              <div className={styles.mobileSelfView}>
                <UserCameraCard
                  label="Voce"
                  isReady={isMediaReady}
                  stream={videoStream}
                  isRecording={isRecording}
                  error={mediaError || recorderError}
                  compact
                />
              </div>
              <div
                className={`${styles.flowStateBar} ${getRuntimeToneClassName(runtimeState.tone)}`}
                aria-live="polite"
                aria-label="Estado atual da entrevista"
              >
                <span className={styles.flowStateDot} />
                <span className={styles.flowStateHeadline}>{runtimeState.headline}</span>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.leftColumn}>
                <AvatarInterview
                  avatar={currentAvatar}
                  state={avatarInterviewState}
                  mouthOpen={isAvatarSpeaking ? mouthOpen : 0}
                />
              </div>
              <div className={styles.centerColumn}>
                <div className={styles.presentationChip} aria-label="Tela de apresentacao">
                  {chipLabel}
                </div>
                <QuestionVisualCard
                  title={questionCardTitle}
                  bullets={questionCardBullets}
                  isLoading={isLoading}
                  topic={isOpeningStep ? undefined : currentQuestion?.topic}
                  contextLabel={contextLabel}
                />
                <div
                  className={`${styles.flowStateBar} ${getRuntimeToneClassName(runtimeState.tone)}`}
                  aria-live="polite"
                  aria-label="Estado atual da entrevista"
                >
                  <span className={styles.flowStateDot} />
                  <span className={styles.flowStateHeadline}>{runtimeState.headline}</span>
                  {runtimeState.summary && (
                    <span className={styles.flowStateSummary}>{runtimeState.summary}</span>
                  )}
                </div>
              </div>
            </>
          )}

          <div className={styles.rightColumn}>
            {!isCompactLayout && (
              <div className={styles.cameraSlot}>
                <UserCameraCard
                  label="Voce"
                  isReady={isMediaReady}
                  stream={videoStream}
                  isRecording={isRecording}
                  error={mediaError || recorderError}
                  compact
                />
              </div>
            )}

            {!audioCapture.isMicrophoneReady && (
              <AudioPermissionCard
                state={audioCapture.state}
                error={audioCapture.error}
                onRequestPermission={() => {
                  void audioCapture.requestPermission();
                }}
              />
            )}

            <div className={styles.audioConfigCard}>
              <button
                type="button"
                className={styles.audioConfigToggle}
                aria-expanded={isAudioConfigExpanded}
                onClick={() => setShowMicrophoneSelector((current) => !current)}
              >
                <span className={styles.audioConfigTitle}>Entrada de audio</span>
                <span className={styles.audioConfigValue}>
                  {audioCapture.isMicrophoneReady ? 'Microfone pronto' : 'Permissao pendente'}
                </span>
              </button>
              {isAudioConfigExpanded && (
                <div className={styles.audioConfigBody}>
                  <MicrophoneSelector
                    devices={audioCapture.devices}
                    value={audioCapture.selectedDeviceId}
                    disabled={flowState === 'recording' || audioCapture.state === 'paused'}
                    onChange={(deviceId) => {
                      void audioCapture.selectMicrophone(deviceId);
                    }}
                  />
                </div>
              )}
            </div>

            {agentRuntimeEntries.length > 0 && (
              <div className={styles.runtimeCard} aria-label="Contexto ativo da entrevista">
                <div className={styles.runtimeHeader}>
                  <div>
                    <span className={styles.runtimeEyebrow}>Contexto ativo</span>
                    <h3 className={styles.runtimeTitle}>Motor de contexto inicial</h3>
                  </div>
                  <span className={styles.runtimeBadge}>
                    {contextRuntimeSummary.qualityLabel}
                    {contextRuntimeSummary.averageConfidence != null
                      ? ` ${formatRuntimeConfidence(contextRuntimeSummary.averageConfidence)}`
                      : ''}
                  </span>
                </div>

                <p className={styles.runtimeSummary}>
                  {contextRuntimeSummary.activeCount} blocos ativos, {contextRuntimeSummary.evidenceCount} evidencias
                  aproveitadas para montar a entrevista.
                </p>

                <ul className={styles.runtimeList}>
                  {agentRuntimeEntries.map((entry) => (
                    <li key={entry.name} className={styles.runtimeItem}>
                      <div className={styles.runtimeItemTop}>
                        <strong className={styles.runtimeItemName}>
                          {AGENT_RUNTIME_LABELS[entry.name] || entry.name}
                        </strong>
                        <div className={styles.runtimeMetaRow}>
                          <span className={styles.runtimeMetaChip}>
                            {AGENT_RUNTIME_STATUS_LABELS[entry.status] || entry.status}
                          </span>
                          <span className={styles.runtimeMetaChip}>
                            {AGENT_RUNTIME_SOURCE_LABELS[entry.source] || entry.source}
                          </span>
                          <span className={styles.runtimeMetaChip}>
                            {formatRuntimeConfidence(entry.confidence)}
                          </span>
                        </div>
                      </div>
                      {entry.summary && <p className={styles.runtimeItemSummary}>{entry.summary}</p>}
                      {entry.evidence && entry.evidence.length > 0 && (
                        <p className={styles.runtimeEvidence}>Base: {entry.evidence.slice(0, 3).join(', ')}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div
              className={`${styles.runtimePulseCard} ${getRuntimeToneClassName(runtimeState.tone)}`}
              aria-label="Estado ao vivo da entrevista"
            >
              <div className={styles.runtimePulseHeader}>
                <div>
                  <span className={styles.runtimePulseEyebrow}>Runtime ao vivo</span>
                  <h3 className={styles.runtimePulseTitle}>Estado da sessao</h3>
                </div>
                <span
                  className={`${styles.runtimePulseBadge} ${getRuntimeToneClassName(runtimeState.tone)}`}
                >
                  {runtimeState.headline}
                </span>
              </div>

              <p className={styles.runtimePulseSummary}>{runtimeState.summary}</p>

              <div className={styles.runtimeMetricsGrid}>
                {runtimeState.metrics.map((item) => (
                  <div key={item.label} className={`${styles.runtimeMetricCard} ${getRuntimeToneClassName(item.tone)}`}>
                    <span className={styles.runtimeMetricLabel}>{item.label}</span>
                    <strong className={styles.runtimeMetricValue}>{item.value}</strong>
                    {item.hint && <span className={styles.runtimeMetricHint}>{item.hint}</span>}
                  </div>
                ))}
              </div>

              <div className={styles.runtimeSignalsRow} aria-label="Sinais do pipeline">
                {runtimeState.signals.map((item) => (
                  <div key={item.label} className={`${styles.runtimeSignalChip} ${getRuntimeToneClassName(item.tone)}`}>
                    <span className={styles.runtimeSignalLabel}>{item.label}</span>
                    <strong className={styles.runtimeSignalValue}>{item.value}</strong>
                  </div>
                ))}
              </div>

              <div className={styles.runtimePulseGrid}>
                {runtimeState.statuses.map((item) => (
                  <div
                    key={item.label}
                    className={`${styles.runtimePulseTile} ${getRuntimeToneClassName(item.tone)}`}
                  >
                    <span className={styles.runtimePulseLabel}>{item.label}</span>
                    <strong className={styles.runtimePulseValue}>{item.value}</strong>
                  </div>
                ))}
              </div>

              <ul className={styles.runtimeTimeline} aria-label="Etapas do runtime">
                {runtimeState.timeline.map((item) => (
                  <li
                    key={item.key}
                    className={`${styles.runtimeTimelineItem} ${getRuntimeToneClassName(item.tone)}`}
                  >
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.sideStatusCard}>
              <div className={styles.sideCardTitle}>
                {DEFER_ANSWER_REVIEW_TO_FINAL
                  ? 'Avaliacao final'
                  : isCandidateCoachingMode
                    ? 'Coaching e feedback'
                    : 'Avaliacao silenciosa'}
              </div>
              <div className={styles.statusSignalRow}>
                <span className={styles.statusSignalChip}>Conversa: {conversationStateLabel}</span>
                <span className={styles.statusSignalChip}>Audio: {audioTransportState}</span>
              </div>
              {hasMeasuredSpeechSignals && (
                <div className={styles.signalMetricGrid}>
                  <div className={styles.signalMetricCard}>
                    <span>Qualidade</span>
                    <strong>{responseQualityLabel}</strong>
                  </div>
                  <div className={styles.signalMetricCard}>
                    <span>Confianca</span>
                    <strong>{confidenceLabel}</strong>
                  </div>
                </div>
              )}
              <p className={styles.nextHint}>{sideStatusText}</p>
            </div>

            {partialFeedbackVisible && partialFeedback && (
              <div className={styles.partialFeedbackCard}>
                <div className={styles.partialFeedbackLabel}>Insight parcial</div>
                <p className={styles.partialFeedbackText}>{partialFeedback.message}</p>
              </div>
            )}

            {showPartialTranscript && (
              <div className={styles.partialFeedbackCard}>
                <div className={styles.partialFeedbackLabel}>Transcricao parcial</div>
                <p className={styles.partialFeedbackText}>{partialTranscript}</p>
              </div>
            )}

            {showLiveCoachPanel && (
              <div className={styles.liveCoachCard}>
                <div className={styles.liveCoachHeader}>
                  <span className={styles.liveCoachTitle}>Live Coach</span>
                  {liveCoachInsight?.questionType && (
                    <span className={styles.liveCoachBadge}>{liveCoachInsight.questionType}</span>
                  )}
                </div>

                {liveCoachLoading && <p className={styles.liveCoachText}>Analisando contexto da pergunta...</p>}
                {!liveCoachLoading && liveCoachError && <p className={styles.liveCoachError}>{liveCoachError}</p>}
                {!liveCoachLoading && !liveCoachError && liveCoachInsight?.suggestion && (
                  <p className={styles.liveCoachText}>{liveCoachInsight.suggestion}</p>
                )}
                {!liveCoachLoading && !liveCoachError && !!liveCoachInsight?.keyPoints?.length && (
                  <ul className={styles.liveCoachList}>
                    {liveCoachInsight.keyPoints.slice(0, 3).map((point, idx) => (
                      <li key={`${idx}-${point}`}>{point}</li>
                    ))}
                  </ul>
                )}
                {liveCoachFeed.length > 0 && (
                  <div className={styles.liveCoachFeed}>
                    <p className={styles.liveCoachFeedTitle}>Ultimos insights</p>
                    <ul className={styles.liveCoachFeedList}>
                      {liveCoachFeed.slice(0, 3).map((item) => (
                        <li key={item.id} className={styles.liveCoachFeedItem}>
                          <div className={styles.liveCoachFeedMeta}>
                            <span>{item.questionType || 'general'}</span>
                            <span>
                              {new Date(item.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className={styles.liveCoachFeedText}>{item.suggestion}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={styles.actionArea}>
        <div className={styles.actionStack}>
          <RecordingStatusBadge
            captureState={audioCapture.state}
            uploadState={audioCapture.uploadState}
            pendingChunkCount={audioCapture.pendingChunkCount}
          />
          {!isFinished && <p className={styles.actionPrompt}>{actionPrompt}</p>}
          {!isFinished && (
            <div className={styles.modeSwitch} role="group" aria-label="Modo de resposta">
              <button
                type="button"
                className={`${styles.modeButton} ${!isTextMode ? styles.modeButtonActive : ''}`}
                onClick={() => handleModeChange('audio')}
                disabled={isRecorderActive || flowState === 'evaluating'}
              >
                Voz
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${isTextMode ? styles.modeButtonActive : ''}`}
                onClick={() => handleModeChange('text')}
                disabled={isRecorderActive || flowState === 'evaluating'}
              >
                Texto
              </button>
            </div>
          )}
          {!isFinished && !isTextMode && (flowState === 'recording' || audioCapture.state === 'paused') && (
            <div className={styles.audioControlsRow}>
              {audioCapture.state === 'paused' ? (
                <button type="button" className={styles.audioControlButton} onClick={() => void handleResumeAnswer()}>
                  Retomar gravacao
                </button>
              ) : (
                <button type="button" className={styles.audioControlButton} onClick={handlePauseAnswer}>
                  Pausar gravacao
                </button>
              )}
              <button
                type="button"
                className={styles.audioControlButton}
                onClick={() => {
                  void stopRecordingFlow('manual');
                }}
              >
                Finalizar resposta
              </button>
              {audioCapture.pendingChunkCount > 0 && (
                <button
                  type="button"
                  className={styles.audioControlButton}
                  onClick={() => {
                    void audioCapture.retryPending();
                  }}
                >
                  Reenviar chunks
                </button>
              )}
            </div>
          )}
          {textModeInteractive && (
            <div className={styles.textAnswerPanel}>
              <div className={styles.promptSummaryCard}>
                <span className={styles.promptSummaryLabel}>Pergunta atual</span>
                <p className={styles.promptSummaryText}>{textModePrompt}</p>
              </div>
              <label htmlFor="text-answer-input" className={styles.textAnswerLabel}>
                Sua resposta em texto
              </label>
              <textarea
                id="text-answer-input"
                value={textAnswer}
                onChange={(event) => setTextAnswer(event.target.value)}
                className={styles.textAnswerInput}
                placeholder="Digite sua resposta aqui..."
                rows={4}
                disabled={!textEntryEnabled || flowState === 'evaluating'}
              />
              {!textEntryEnabled && (
                <p className={styles.textAnswerHelper}>
                  O campo libera assim que a IA concluir a pergunta e passar a vez.
                </p>
              )}
              <button
                type="button"
                className={styles.textAnswerSubmit}
                disabled={!canSubmitText || !textEntryEnabled || flowState === 'evaluating'}
                onClick={() => {
                  void submitTextAnswer();
                }}
              >
                {flowState === 'evaluating' ? 'Avaliando...' : 'Enviar resposta'}
              </button>
            </div>
          )}
          {runtimeNotice && (
            <div className={styles.errorNotice} role="status" aria-live="polite">
              <p className={styles.errorNoticeText}>{runtimeNotice}</p>
              <button
                type="button"
                className={styles.errorNoticeDismiss}
                onClick={() => setRuntimeNotice(null)}
              >
                Fechar
              </button>
            </div>
          )}
          {timeLimitReached && (
            <div className={styles.timeNotice} role="status">
              {t.timeLimitReached}
            </div>
          )}
          {flowState === 'no_response' && (
            <div className={styles.noResponsePanel} role="status" aria-live="polite">
              <p className={styles.noResponseTitle}>{t.noResponseDetected}</p>
              <p className={styles.noResponseText}>{t.noResponseQuestion}</p>
              <div className={styles.noResponseActions}>
                <button
                  type="button"
                  className={styles.noResponsePrimary}
                  onClick={async () => {
                    if (timeLimitReached) {
                      await handleFinish();
                      return;
                    }
                    await askCurrentQuestion();
                  }}
                >
                  {t.continueInterview}
                </button>
                <button
                  type="button"
                  className={styles.noResponseSecondary}
                  onClick={handleFinish}
                >
                  {t.cancelInterview}
                </button>
              </div>
            </div>
          )}
          {!AUTO_MODE && !isTextMode && (
            <PrimaryActionButton
              label={actionLabel}
              variant={isRecording ? 'recording' : 'idle'}
              disabled={actionDisabled}
              onClick={handlePrimaryAction}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default InterviewRoomLayout;
