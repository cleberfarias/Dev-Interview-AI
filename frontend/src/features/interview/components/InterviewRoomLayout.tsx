import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './InterviewRoomLayout.module.css';
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
  AnswerEvaluation,
  AvatarResponse,
  CommunicationAnalysis,
  FinalReport,
  InterviewConfig,
  InterviewMode,
  InterviewPlan,
  LiveCoachProcessResponse,
  PartialFeedback,
  SpeechMetrics,
  User,
} from '../../../shared/types';
import {
  blobToBase64,
  buildFallbackReport,
  buildNoResponsePrompt,
  buildSpokenPrompt,
  buildUiQuestions,
  deriveContextLabel,
  getLocalFallbackPrompt,
  normalizeQuestionPrompt,
  toUiQuestion,
  type HistoryItem,
  type UiQuestion,
} from './interviewRoomUtils';

type InterviewFlowState =
  | 'idle'
  | 'asking'
  | 'awaiting_answer'
  | 'recording'
  | 'evaluating'
  | 'no_response'
  | 'next_question'
  | 'finished';

type ConversationState = 'idle' | 'listening' | 'processing' | 'ai_speaking' | 'candidate_speaking';
type AvatarInterviewState = 'idle' | 'avatar_listening' | 'avatar_thinking' | 'avatar_speaking';

type AnswerMode = 'audio' | 'text';

const VIDEO_MEDIA_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: false };
const NO_RESPONSE_MS = 5000;
const SILENCE_STOP_MS = 1500;
const SILENCE_THRESHOLD = 0.02;
const AUTO_MODE = true;
const MAX_RECORDING_MS = 90000;
const LIVE_COACH_CHUNK_TIMESLICE_MS = 3000;
const LIVE_COACH_CHUNK_INTERVAL_MS = 8000;
const LIVE_COACH_WS_RESPONSE_TIMEOUT_MS = 7000;
const LONG_PAUSE_MS = 1200;
const PARTIAL_FEEDBACK_ENABLED = true;

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

const countTranscriptWords = (value?: string | null): number =>
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const hasMeaningfulAudioAnswer = (transcript: string, speechMetrics?: SpeechMetrics | null): boolean => {
  const wordCount = countTranscriptWords(transcript);
  if (wordCount >= 4) return true;

  if (!speechMetrics) return false;
  const totalDurationMs = Math.max(0, Number(speechMetrics.totalDurationMs) || 0);
  const silenceDurationMs = Math.max(0, Number(speechMetrics.silenceDurationMs) || 0);
  const silenceRatio = totalDurationMs > 0 ? silenceDurationMs / totalDurationMs : 1;
  const startedSpeaking = Number(speechMetrics.timeToFirstSpeechMs || 0) > 0;

  return wordCount >= 2 && startedSpeaking && silenceRatio < 0.9;
};

interface InterviewRoomLayoutProps {
  config: InterviewConfig;
  plan: InterviewPlan;
  sessionId?: string;
  initialAvatar?: AvatarResponse | null;
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

const InterviewRoomLayout: React.FC<InterviewRoomLayoutProps> = ({
  config,
  plan,
  sessionId,
  initialAvatar,
  user,
  onFinish,
  onBack,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flowState, setFlowState] = useState<InterviewFlowState>('idle');
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  const [answerMode, setAnswerMode] = useState<AnswerMode>('audio');
  const [textAnswer, setTextAnswer] = useState('');
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.round((config.duration ?? 0) * 60)),
  );
  const [timeLimitReached, setTimeLimitReached] = useState(false);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
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
  const liveCoachChunkHandlerRef = useRef<(chunk: Blob) => Promise<void>>(() => Promise.resolve());
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

  const selectedLevel = config.difficultyLevel ?? 3;
  const candidateFirstName = useMemo(() => getPreferredCandidateName(user?.name), [user?.name]);
  const interviewMode: InterviewMode = config.interviewMode || 'candidate_coaching_mode';
  const isCandidateCoachingMode = interviewMode === 'candidate_coaching_mode';
  const interviewModeLabel =
    interviewMode === 'candidate_coaching_mode' ? 'Coaching do candidato' : 'Avaliacao de contratacao';
  const baseBullets = useMemo(() => (plan.mustHaveSkills ?? []).slice(0, 3), [plan]);
  const baseQuestions = useMemo(() => {
    const all = buildUiQuestions(plan);
    const filtered = all.filter((question) => question.difficulty === selectedLevel);
    const source = filtered.length ? filtered : all;
    return source.slice(0, FIXED_INTERVIEW_QUESTION_COUNT);
  }, [plan, selectedLevel]);
  const initialAvatarByQuestionId = useMemo<Record<string, AvatarResponse>>(() => {
    const firstQuestion = baseQuestions[0];
    if (!initialAvatar || !firstQuestion?.id) return {};
    return { [firstQuestion.id]: initialAvatar };
  }, [baseQuestions, initialAvatar]);
  const [questions, setQuestions] = useState<UiQuestion[]>(() => baseQuestions);
  const sanitizedConfig = useMemo(() => {
    const { difficultyLevel, ...rest } = config;
    return rest;
  }, [config]);
  const currentQuestion = questions[currentIndex] ?? questions[0];
  const audioCapture = useAudioCapture({
    autoRequest: true,
    answerId: activeAnswerId || undefined,
    sessionId,
    questionId: currentQuestion?.id,
    userId: user.uid,
    chunkTimesliceMs: LIVE_COACH_CHUNK_TIMESLICE_MS,
    onChunkCaptured: async (chunk) => {
      void liveCoachChunkHandlerRef.current(chunk);
    },
  });
  const isRecorderActive = audioCapture.isRecordingSessionActive;
  const recorderError = audioCapture.error;

  useEffect(() => {
    isRecorderActiveRef.current = isRecorderActive;
  }, [isRecorderActive]);

  const contextLabel = useMemo(
    () => deriveContextLabel(currentQuestion, config.stacks),
    [currentQuestion, config.stacks],
  );
  const fallbackMaxQuestions = FIXED_INTERVIEW_QUESTION_COUNT;
  const totalSeconds = useMemo(
    () => Math.max(0, Math.round((config.duration ?? 0) * 60)),
    [config.duration],
  );
  const t = I18N[config.uiLanguage];

  const stageLabel = useMemo(() => {
    const total = fallbackMaxQuestions;
    if (!total) return t.introLabel ?? 'INTRODUCAO';
    const current = Math.min(currentIndex + 1, total);
    const template = t.stepLabel ?? 'Stage {current} of {total}';
    return template.replace('{current}', String(current)).replace('{total}', String(total));
  }, [currentIndex, fallbackMaxQuestions, t.introLabel, t.stepLabel]);

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
  const isMediaReady = mediaStatus === 'ready' && audioCapture.isMicrophoneReady;

  const showRuntimeNotice = useCallback((message: string) => {
    setRuntimeNotice(message);
  }, []);

  const buildAnswerId = useCallback(() => {
    const questionToken = currentQuestion?.id || `q${currentIndex + 1}`;
    return [sessionId || 'session', questionToken, Date.now().toString(36)].join('__');
  }, [currentIndex, currentQuestion?.id, sessionId]);

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
      requestLiveCoachViaWebSocket,
      sessionId,
    ],
  );

  const handleLiveCoachChunk = useCallback(
    async (chunk: Blob) => {
      if (flowState !== 'recording' || answerMode !== 'audio') return;
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
    [activeAnswerId, answerMode, computeSpeechMetrics, currentQuestion?.title, flowState, requestLiveCoachInsight],
  );

  const stopTTS = useCallback(() => {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl.removeAttribute('src');
    audioEl.load();
  }, [audioEl]);

  const playAudioPayload = useCallback(
    async (payload: { audioBase64: string; mimeType: string }) => {
      if (!audioEl) return;
      if (!payload.audioBase64) return;

      stopTTS();
      audioEl.src = `data:${payload.mimeType};base64,${payload.audioBase64}`;

      const playPromise = audioEl.play();
      if (playPromise) {
        await playPromise;
      }

      await new Promise<void>((resolve, reject) => {
        const handleEnd = () => {
          audioEl.removeEventListener('ended', handleEnd);
          audioEl.removeEventListener('error', handleError);
          resolve();
        };

        const handleError = () => {
          audioEl.removeEventListener('ended', handleEnd);
          audioEl.removeEventListener('error', handleError);
          reject(new Error('Falha ao tocar o audio.'));
        };

        audioEl.addEventListener('ended', handleEnd);
        audioEl.addEventListener('error', handleError);
      });
    },
    [audioEl, stopTTS],
  );

  const speakQuestion = useCallback(
    async (text: string, voiceId?: string) => {
      if (!audioEl) return;

      stopTTS();

      try {
        const response = await BackendApi.tts(text, config.interviewLanguage, voiceId);
        await playAudioPayload({ audioBase64: response.audioBase64, mimeType: response.mimeType });
      } catch (error) {
        console.warn('TTS falhou', error);
        showRuntimeNotice('Audio da pergunta indisponivel no momento.');
      }
    },
    [audioEl, config.interviewLanguage, playAudioPayload, showRuntimeNotice, stopTTS],
  );

  const resolveAvatarForQuestion = useCallback(
    async (questionId: string, prompt: string): Promise<AvatarResponse | null> => {
      const cached = avatarByQuestionId[questionId];
      if (cached) return cached;
      try {
        const avatar = await BackendApi.avatarRespond({
          text: prompt,
          language: config.interviewLanguage,
          sessionId,
        });
        setAvatarByQuestionId((prev) => ({ ...prev, [questionId]: avatar }));
        return avatar;
      } catch (error) {
        console.warn('Avatar respond fallback to regular TTS', error);
        return null;
      }
    },
    [avatarByQuestionId, config.interviewLanguage, sessionId],
  );

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
      setFlowState('finished');
      setConversationState('idle');
      clearNoResponseTimer();
      clearRecordingFailsafeTimer();
      stopVoiceMonitor();
      stopTTS();
      try {
        const finalized = await BackendApi.orchestratorFinalize({ config: sanitizedConfig, sessionId, history });
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

        onFinish?.(report);
      } catch (error) {
        console.warn('Falha ao gerar report', error);
        showRuntimeNotice('Falha no servidor ao gerar relatorio. Exibindo versao local.');
        onFinish?.(buildFallbackReport(history, config, plan));
      } finally {
        finishingRef.current = false;
      }
    },
    [clearNoResponseTimer, clearRecordingFailsafeTimer, config, onFinish, plan, sanitizedConfig, sessionId, showRuntimeNotice, stopTTS],
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
      );
      const avatarPayload = await resolveAvatarForQuestion(currentQuestion.id, prompt);
      if (avatarPayload) {
        setCurrentAvatar(avatarPayload);
      }

      if (avatarPayload?.audio) {
        try {
          await playAudioPayload({ audioBase64: avatarPayload.audio, mimeType: avatarPayload.mimeType });
        } catch (error) {
          console.warn('Avatar audio playback failed, using fallback TTS', error);
          await speakQuestion(prompt);
        }
      } else {
        await speakQuestion(prompt);
      }
      setFlowState('awaiting_answer');
      setConversationState('listening');
    },
    [
      audioEl,
      config.interviewLanguage,
      config.style,
      candidateFirstName,
      currentIndex,
      currentQuestion,
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
    setFlowState('no_response');
    setConversationState('ai_speaking');
    try {
      await speakQuestion(buildNoResponsePrompt(config.interviewLanguage));
    } catch {}
    setConversationState('listening');
  }, [
    audioCapture,
    clearNoResponseTimer,
    clearRecordingFailsafeTimer,
    config.interviewLanguage,
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

  const continueWithTurnResult = useCallback(
    async (turnResult: {
      evaluation: AnswerEvaluation;
      nextQuestion: {
        shouldFinish: boolean;
        question?: { id?: string; section?: string; difficulty?: number; prompt?: string };
      };
      coach?: { tips?: string[] };
      avatar?: AvatarResponse | null;
      communicationAnalysis?: CommunicationAnalysis | null;
    }) => {
      const response = turnResult.evaluation;
      const communicationAnalysis = turnResult.communicationAnalysis || currentCommunicationAnalysisRef.current || null;
      const nextHistory = [
        ...historyRef.current,
        {
          questionId: currentQuestion.id,
          question: currentQuestion.title,
          section: currentQuestion.section,
          difficulty: currentQuestion.sourceDifficulty,
          evaluation: response,
          communicationAnalysis,
        },
      ];
      historyRef.current = nextHistory;

      const nextIndex = currentIndex + 1;
      const hasPlannedNext = Boolean(questions[nextIndex]);
      if (remainingSeconds <= 0 || timeLimitReached) {
        await finalizeInterview(nextHistory);
        return;
      }

      try {
        const nextRes = turnResult.nextQuestion;

        if (nextRes.shouldFinish || !nextRes.question) {
          await finalizeInterview(nextHistory);
          return;
        }

        const fallbackPrompt = getLocalFallbackPrompt(config.track, config.interviewLanguage, nextIndex);
        const nextPrompt = String(nextRes.question.prompt || fallbackPrompt || '').trim();
        if (!nextPrompt) {
          await finalizeInterview(nextHistory);
          return;
        }

        let mapped = toUiQuestion(
          {
            ...nextRes.question,
            prompt: nextPrompt,
          },
          nextIndex,
          baseBullets,
        );
        const repeatedPrompt =
          normalizeQuestionPrompt(mapped.title) === normalizeQuestionPrompt(currentQuestion.title);
        if (repeatedPrompt) {
          if (
            fallbackPrompt &&
            normalizeQuestionPrompt(fallbackPrompt) !== normalizeQuestionPrompt(currentQuestion.title)
          ) {
            mapped = toUiQuestion(
              {
                id: `fallback-q${nextIndex + 1}`,
                prompt: fallbackPrompt,
                section: nextRes.question.section || currentQuestion.section || 'technical',
                difficulty: nextRes.question.difficulty || currentQuestion.sourceDifficulty || 3,
              },
              nextIndex,
              baseBullets,
            );
          } else {
            mapped = {
              ...mapped,
              id: `${mapped.id || `q${nextIndex + 1}`}-next-${nextIndex + 1}`,
            };
          }
        } else if (questions.some((question, index) => index !== nextIndex && question.id === mapped.id)) {
          mapped = {
            ...mapped,
            id: `${mapped.id || `q${nextIndex + 1}`}-${nextIndex + 1}`,
          };
        }
        if (turnResult.avatar) {
          setAvatarByQuestionId((prev) => ({ ...prev, [mapped.id]: turnResult.avatar as AvatarResponse }));
        }
        setQuestions((prev) => {
          const next = [...prev];
          if (next[nextIndex]) {
            next[nextIndex] = mapped;
          } else {
            next.push(mapped);
          }
          return next;
        });

        setFlowState('next_question');
        setConversationState('processing');
      } catch (error) {
        console.warn(error);
        if (hasPlannedNext) {
          setFlowState('next_question');
          setConversationState('processing');
        } else {
          showRuntimeNotice('Conexao instavel. Tentando manter a entrevista ativa.');
          const shouldFallbackLocally = nextIndex < fallbackMaxQuestions;
          if (shouldFallbackLocally) {
            const prompt = getLocalFallbackPrompt(config.track, config.interviewLanguage, nextIndex);
            if (prompt) {
              const localQuestion = toUiQuestion(
                {
                  id: `local-q${nextIndex + 1}`,
                  prompt,
                  section: currentQuestion.section || 'technical',
                  difficulty: currentQuestion.sourceDifficulty || 3,
                },
                nextIndex,
                baseBullets,
              );
              setQuestions((prev) => {
                const next = [...prev];
                if (next[nextIndex]) {
                  next[nextIndex] = localQuestion;
                } else {
                  next.push(localQuestion);
                }
                return next;
              });
              setFlowState('next_question');
              setConversationState('processing');
              return;
            }
          }
          await finalizeInterview(nextHistory);
        }
      }
    },
    [
      baseBullets,
      config.interviewLanguage,
      config.track,
      currentIndex,
      currentQuestion.id,
      currentQuestion.section,
      currentQuestion.sourceDifficulty,
      currentQuestion.title,
      fallbackMaxQuestions,
      finalizeInterview,
      questions,
      remainingSeconds,
      setAvatarByQuestionId,
      showRuntimeNotice,
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
        const base64Audio = await blobToBase64(blob);
        const transcript = partialTranscriptRef.current;
        const speechMetrics = computeSpeechMetrics(
          transcript,
          answerMetricsRef.current ? Date.now() - answerMetricsRef.current.startedAtMs : undefined,
        );
        if (!hasMeaningfulAudioAnswer(transcript, speechMetrics)) {
          resetCurrentAnswerAnalysis(null);
          setFlowState('no_response');
          setConversationState('ai_speaking');
          try {
            await speakQuestion(buildNoResponsePrompt(config.interviewLanguage));
          } catch {}
          setConversationState('listening');
          return;
        }
        void requestLiveCoachInsight({
          audioBase64: base64Audio,
          answerId: activeAnswerId || undefined,
          mimeType: blob.type || 'audio/webm',
          transcript,
          speechMetrics,
        });
        const turnResult = await BackendApi.orchestratorTurn({
          config: sanitizedConfig,
          sessionId,
          history: historyRef.current,
          question: currentQuestion.title,
          remainingSeconds,
          difficultyLevel: selectedLevel,
          confirmedName: candidateFirstName,
          answerId: activeAnswerId || undefined,
          interviewMode,
          speechMetrics: speechMetrics || undefined,
          audioBase64: base64Audio,
          mimeType: blob.type || 'audio/webm',
        });
        await continueWithTurnResult(turnResult);
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
      continueWithTurnResult,
      flowState,
      remainingSeconds,
      sanitizedConfig,
      selectedLevel,
      showRuntimeNotice,
      audioCapture,
      activeAnswerId,
      computeSpeechMetrics,
      stopVoiceMonitor,
      candidateFirstName,
      config.interviewLanguage,
      requestLiveCoachInsight,
      currentQuestion.title,
      interviewMode,
      resetCurrentAnswerAnalysis,
      sessionId,
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
    const nextAnswerId = activeAnswerId || buildAnswerId();
    if (!activeAnswerId) {
      resetCurrentAnswerAnalysis(nextAnswerId);
    }
    setFlowState('evaluating');
    setConversationState('processing');
    try {
      void requestLiveCoachInsight({
        audioBase64: '',
        answerId: nextAnswerId,
        transcript,
        mimeType: 'text/plain',
      });
      const turnResult = await BackendApi.orchestratorTurn({
        config: sanitizedConfig,
        sessionId,
        history: historyRef.current,
        question: currentQuestion.title,
        remainingSeconds,
        difficultyLevel: selectedLevel,
        confirmedName: candidateFirstName,
        answerId: nextAnswerId,
        interviewMode,
        transcript,
      });
      setTextAnswer('');
      await continueWithTurnResult(turnResult);
    } catch (error) {
      console.warn(error);
      showRuntimeNotice('Nao foi possivel processar a resposta em texto.');
      setFlowState('awaiting_answer');
      setConversationState('listening');
    }
  }, [
    clearNoResponseTimer,
    continueWithTurnResult,
    buildAnswerId,
    currentQuestion,
    flowState,
    remainingSeconds,
    activeAnswerId,
    resetCurrentAnswerAnalysis,
    sanitizedConfig,
    selectedLevel,
    showRuntimeNotice,
    stopVoiceMonitor,
    textAnswer,
    candidateFirstName,
    requestLiveCoachInsight,
    interviewMode,
    sessionId,
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
    setCurrentAvatar(baseQuestions[0] ? initialAvatarByQuestionId[baseQuestions[0].id] || null : null);
    liveCoachFeedRef.current = [];
    partialTranscriptRef.current = '';
    partialFeedbackShownRef.current = false;
    currentSpeechMetricsRef.current = null;
    currentCommunicationAnalysisRef.current = null;
    answerMetricsRef.current = null;
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
    setTextAnswer('');
    setLiveCoachInsight(null);
    setLiveCoachError(null);
    setLiveCoachLoading(false);
    setPartialFeedback(null);
    setPartialTranscript('');
    setActiveAnswerId(null);
    setCurrentAvatar(currentQuestion ? avatarByQuestionId[currentQuestion.id] || null : null);
    partialTranscriptRef.current = '';
    partialFeedbackShownRef.current = false;
    currentSpeechMetricsRef.current = null;
    currentCommunicationAnalysisRef.current = null;
    answerMetricsRef.current = null;
    liveCoachChunkInFlightRef.current = false;
    lastLiveCoachChunkAtRef.current = 0;
    liveCoachChunkIndexRef.current = 0;
  }, [avatarByQuestionId, currentQuestion]);

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
      await askCurrentQuestion();
    };

    run();

    return () => {
      stopTTS();
    };
  }, [askCurrentQuestion, currentIndex, currentQuestion?.id, currentQuestion?.title, stopTTS]);

  useEffect(() => {
    if (flowState !== 'next_question') return;
    if (!questions.length) return;
    const id = window.setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
    }, 1200);
    return () => window.clearTimeout(id);
  }, [flowState, questions.length]);

  useEffect(() => {
    const activeError = mediaError || recorderError;
    if (!activeError) return;
    showRuntimeNotice(activeError);
  }, [mediaError, recorderError, showRuntimeNotice]);

  useEffect(() => {
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
  const canSubmitText = isTextMode && flowState === 'awaiting_answer' && textAnswer.trim().length > 0;

  const canStartRecording = flowState === 'awaiting_answer' && isMediaReady && !isTextMode;
  const actionDisabled =
    isFinished ||
    flowState === 'evaluating' ||
    flowState === 'no_response' ||
    !(canStartRecording || flowState === 'recording');

  const actionLabel =
    flowState === 'evaluating'
      ? 'AVALIANDO'
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
  const conversationStateLabelMap: Record<ConversationState, string> = {
    idle: 'idle',
    listening: 'listening',
    processing: 'processing',
    ai_speaking: 'ai_speaking',
    candidate_speaking: 'candidate_speaking',
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
      : conversationState === 'processing'
      ? 'IA analisando sua resposta...'
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
  const partialFeedbackVisible = Boolean(partialFeedback && isCandidateCoachingMode);
  const showLiveCoachPanel = isCandidateCoachingMode && !isFinished && (liveCoachLoading || liveCoachInsight || liveCoachError);

  const topStacks = (config.stacks || []).slice(0, 3);
  const roleSummary = `Candidato: ${candidateFirstName} | ${plan.roleTitleGuess || config.track || 'Entrevista'} | ${interviewModeLabel} | ${FIXED_INTERVIEW_QUESTION_COUNT} perguntas | ${FIXED_INTERVIEW_DURATION_MINUTES} min | Stack: ${topStacks.length ? topStacks.join(', ') : 'Nao informado'}`;

  const handlePrimaryAction = async () => {
    if (!currentQuestion) return;
    if (flowState === 'evaluating' || isFinished) return;

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
        <p className={styles.brandSubtitle}>{roleSummary}</p>
      </header>

      <div className={styles.topBarArea}>
        <div className={styles.topBarInner}>
          <TopBar
            timer={timerLabel}
            stage={stageLabel}
            backLabel="VOLTAR"
            onBack={onBack}
            finishLabel="FINALIZAR CONSULTA"
            onFinish={handleFinish}
            showMeta={true}
          />
        </div>
      </div>

      <audio ref={setAudioEl} className={styles.ttsAudio} />

      <section className={styles.content} aria-label="Sala de entrevista">
        <div className={styles.grid}>
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
              title={currentQuestion?.title ?? 'Carregando pergunta...'}
              bullets={currentQuestion?.bullets ?? []}
              isLoading={isLoading}
              topic={currentQuestion?.topic}
              contextLabel={contextLabel}
            />
          </div>

          <div className={styles.rightColumn}>
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

            {!audioCapture.isMicrophoneReady && (
              <AudioPermissionCard
                state={audioCapture.state}
                error={audioCapture.error}
                onRequestPermission={() => {
                  void audioCapture.requestPermission();
                }}
              />
            )}

            <MicrophoneSelector
              devices={audioCapture.devices}
              value={audioCapture.selectedDeviceId}
              disabled={flowState === 'recording' || audioCapture.state === 'paused'}
              onChange={(deviceId) => {
                void audioCapture.selectMicrophone(deviceId);
              }}
            />

            <div className={styles.sideStatusCard}>
              <div className={styles.sideCardTitle}>
                {isCandidateCoachingMode ? 'Coaching e feedback' : 'Avaliacao silenciosa'}
              </div>
              <div className={styles.scoreLine}>
                <span>Qualidade da resposta</span>
                <strong>{responseQualityLabel}</strong>
              </div>
              <div className={styles.scoreLine}>
                <span>Confianca ao falar</span>
                <strong>{confidenceLabel}</strong>
              </div>
              <div className={styles.scoreLine}>
                <span>Estado da conversa</span>
                <strong>{conversationStateLabel}</strong>
              </div>
              <div className={styles.scoreLine}>
                <span>Estado do audio</span>
                <strong>{audioTransportState}</strong>
              </div>
              <p className={styles.nextHint}>{sideStatusText}</p>
            </div>

            {partialFeedbackVisible && partialFeedback && (
              <div className={styles.partialFeedbackCard}>
                <div className={styles.partialFeedbackLabel}>Insight parcial</div>
                <p className={styles.partialFeedbackText}>{partialFeedback.message}</p>
              </div>
            )}

            {isCandidateCoachingMode && !isFinished && flowState === 'recording' && partialTranscript && (
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
          {isTextMode && (flowState === 'awaiting_answer' || flowState === 'evaluating') && (
            <div className={styles.textAnswerPanel}>
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
                disabled={flowState === 'evaluating'}
              />
              <button
                type="button"
                className={styles.textAnswerSubmit}
                disabled={!canSubmitText || flowState === 'evaluating'}
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
          {!AUTO_MODE && (
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
