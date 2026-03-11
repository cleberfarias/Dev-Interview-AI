import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './InterviewRoomLayout.module.css';
import { useUserMedia } from '../../../../hooks/useUserMedia';
import { useAudioRecorder } from '../../../../hooks/useAudioRecorder';
import { useLipSync } from '../../../hooks/useLipSync';
import {
  AvatarInterviewerCard,
  PrimaryActionButton,
  QuestionVisualCard,
  TopBar,
  UserCameraCard,
} from '../../../shared/components';
import { I18N } from '../../../shared/constants';
import { BackendApi } from '../../../shared/services/backendApi';
import type {
  AnswerEvaluation,
  FinalReport,
  InterviewConfig,
  InterviewPlan,
  LiveCoachProcessResponse,
} from '../../../shared/types';
import {
  blobToBase64,
  buildFallbackReport,
  buildNoResponsePrompt,
  buildSpokenPrompt,
  buildUiQuestions,
  deriveContextLabel,
  getLocalFallbackPrompt,
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

type AnswerMode = 'audio' | 'text';

const MEDIA_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: true };
const NO_RESPONSE_MS = 5000;
const SILENCE_STOP_MS = 1500;
const SILENCE_THRESHOLD = 0.02;
const AUTO_MODE = true;
const LIVE_COACH_CHUNK_TIMESLICE_MS = 3000;
const LIVE_COACH_CHUNK_INTERVAL_MS = 8000;
const LIVE_COACH_WS_RESPONSE_TIMEOUT_MS = 7000;


interface InterviewRoomLayoutProps {
  config: InterviewConfig;
  plan: InterviewPlan;
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

const InterviewRoomLayout: React.FC<InterviewRoomLayoutProps> = ({ config, plan, onFinish, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flowState, setFlowState] = useState<InterviewFlowState>('idle');
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
  const historyRef = useRef<HistoryItem[]>([]);
  const liveCoachFeedRef = useRef<LiveCoachFeedItem[]>([]);
  const finishingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const noResponseTimerRef = useRef<number | null>(null);
  const stopInProgressRef = useRef(false);
  const liveCoachChunkInFlightRef = useRef(false);
  const lastLiveCoachChunkAtRef = useRef(0);
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
        timeoutId: number;
      }
    >(),
  );
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

  const { stream, status: mediaStatus, error: mediaError } = useUserMedia(MEDIA_CONSTRAINTS);
  const {
    start: startRecording,
    stop: stopRecording,
    isRecording: isRecorderActive,
    error: recorderError,
  } = useAudioRecorder(stream, {
    timesliceMs: LIVE_COACH_CHUNK_TIMESLICE_MS,
    onChunk: (chunk) => {
      void liveCoachChunkHandlerRef.current(chunk);
    },
  });

  const { mouthOpen, isSpeaking } = useLipSync(audioEl);

  const selectedLevel = config.difficultyLevel ?? 3;
  const baseBullets = useMemo(() => (plan.mustHaveSkills ?? []).slice(0, 3), [plan]);
  const baseQuestions = useMemo(() => {
    const all = buildUiQuestions(plan);
    const filtered = all.filter((question) => question.difficulty === selectedLevel);
    return filtered.length ? filtered : all;
  }, [plan, selectedLevel]);
  const [questions, setQuestions] = useState<UiQuestion[]>(() => baseQuestions);
  const sanitizedConfig = useMemo(() => {
    const { difficultyLevel, ...rest } = config;
    return rest;
  }, [config]);
  const currentQuestion = questions[currentIndex] ?? questions[0];
  const contextLabel = useMemo(
    () => deriveContextLabel(currentQuestion, config.stacks),
    [currentQuestion, config.stacks],
  );
  const fallbackMaxQuestions = useMemo(() => {
    const duration = Math.max(10, Number(config.duration || 10));
    return Math.max(5, Math.min(12, Math.round(duration / 2)));
  }, [config.duration]);
  const totalSeconds = useMemo(
    () => Math.max(0, Math.round((config.duration ?? 0) * 60)),
    [config.duration],
  );
  const t = I18N[config.uiLanguage];

  const stageLabel = useMemo(() => {
    const total = questions.length;
    if (!total) return t.introLabel ?? 'INTRODUCAO';
    const current = Math.min(currentIndex + 1, total);
    const template = t.stepLabel ?? 'Stage {current} of {total}';
    return template.replace('{current}', String(current)).replace('{total}', String(total));
  }, [questions.length, currentIndex, t.introLabel, t.stepLabel]);

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
  const isMediaReady = mediaStatus === 'ready';

  const showRuntimeNotice = useCallback((message: string) => {
    setRuntimeNotice(message);
  }, []);

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

          liveCoachWsPendingRef.current.delete(requestId);
          window.clearTimeout(pending.timeoutId);

          if (payload?.type === 'insight' && payload?.payload) {
            pending.resolve(payload.payload as LiveCoachProcessResponse);
            return;
          }

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
    async (payload: { audioBase64: string; mimeType?: string; context?: Record<string, unknown> }) => {
      const ws = await ensureLiveCoachSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) return null;

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      return new Promise<LiveCoachProcessResponse | null>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          liveCoachWsPendingRef.current.delete(requestId);
          reject(new Error('live_coach_socket_timeout'));
        }, LIVE_COACH_WS_RESPONSE_TIMEOUT_MS);

        liveCoachWsPendingRef.current.set(requestId, { resolve, reject, timeoutId });

        try {
          ws.send(
            JSON.stringify({
              type: 'process',
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
      input: { audioBase64: string; mimeType?: string; transcript?: string },
      options: { background?: boolean; silent?: boolean } = {},
    ) => {
      if (!currentQuestion?.title) return;
      const background = Boolean(options.background);
      const silent = Boolean(options.silent);
      if (!background) {
        setLiveCoachLoading(true);
        setLiveCoachError(null);
      }
      const recentHistory = historyRef.current.slice(-3).map((item) => ({
        question: item.question,
        section: item.section,
        scores: item.evaluation?.criteriaScores || item.evaluation?.scores || {},
        improvements: (item.evaluation?.improvements || []).slice(0, 2),
      }));
      const recentTips = liveCoachFeedRef.current.slice(0, 3).map((item) => item.suggestion);
      const requestPayload = {
        audioBase64: input.audioBase64,
        mimeType: input.mimeType || 'audio/webm',
        context: {
          source: 'interview-room',
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
          response = await requestLiveCoachViaWebSocket(requestPayload);
        } catch (wsError) {
          console.warn('Live coach websocket fallback to HTTP', wsError);
        }

        if (!response) {
          response = await BackendApi.liveCoachProcess(requestPayload);
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
        }
      }
    },
    [
      appendLiveCoachFeed,
      config.jobDescription,
      config.stacks,
      config.track,
      currentQuestion?.title,
      requestLiveCoachViaWebSocket,
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
        await requestLiveCoachInsight(
          {
            audioBase64: base64Audio,
            mimeType: chunk.type || 'audio/webm',
          },
          { background: true, silent: true },
        );
      } catch (error) {
        console.warn('Live coach chunk failed', error);
      } finally {
        liveCoachChunkInFlightRef.current = false;
      }
    },
    [answerMode, currentQuestion?.title, flowState, requestLiveCoachInsight],
  );

  const stopTTS = useCallback(() => {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl.removeAttribute('src');
    audioEl.load();
  }, [audioEl]);

  const speakQuestion = useCallback(
    async (text: string, voiceId?: string) => {
      if (!audioEl) return;

      stopTTS();

      try {
        const response = await BackendApi.tts(text, config.interviewLanguage, voiceId);
        audioEl.src = `data:${response.mimeType};base64,${response.audioBase64}`;

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
      } catch (error) {
        console.warn('TTS falhou', error);
        showRuntimeNotice('Audio da pergunta indisponivel no momento.');
      }
    },
    [audioEl, config.interviewLanguage, showRuntimeNotice, stopTTS],
  );

  const clearNoResponseTimer = useCallback(() => {
    if (noResponseTimerRef.current) {
      window.clearTimeout(noResponseTimerRef.current);
      noResponseTimerRef.current = null;
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
    if (!stream) return;
    stopVoiceMonitor();

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const data = new Uint8Array(analyser.fftSize);

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const baselineStart = Date.now();
      const baselineSamples: number[] = [];

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);

        if (!baselineDoneRef.current) {
          baselineSamples.push(rms);
          if (Date.now() - baselineStart >= 400) {
            const avg =
              baselineSamples.reduce((acc, val) => acc + val, 0) / Math.max(baselineSamples.length, 1);
            noiseThresholdRef.current = Math.max(SILENCE_THRESHOLD, avg * 2.5);
            baselineDoneRef.current = true;
          }
        }

        if (baselineDoneRef.current && rms > noiseThresholdRef.current) {
          hasSpokenRef.current = true;
          lastSoundAtRef.current = Date.now();
        }

        if (hasSpokenRef.current && !autoStopRef.current) {
          if (Date.now() - lastSoundAtRef.current > SILENCE_STOP_MS) {
            autoStopRef.current = true;
            void stopRecordingFlow('auto');
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
  }, [showRuntimeNotice, stream, stopVoiceMonitor]);

  const finalizeInterview = useCallback(
    async (history: HistoryItem[]) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setFlowState('finished');
      clearNoResponseTimer();
      stopVoiceMonitor();
      stopTTS();
      try {
        const report = await BackendApi.finalReport({ config: sanitizedConfig, history });
        onFinish?.(report);
      } catch (error) {
        console.warn('Falha ao gerar report', error);
        showRuntimeNotice('Falha no servidor ao gerar relatorio. Exibindo versao local.');
        onFinish?.(buildFallbackReport(history, config, plan));
      } finally {
        finishingRef.current = false;
      }
    },
    [config, onFinish, plan, sanitizedConfig, showRuntimeNotice, stopTTS],
  );

  const handleFinish = useCallback(async () => {
    if (isRecorderActive) {
      try {
        await stopRecording();
      } catch {}
    }
    clearNoResponseTimer();
    stopVoiceMonitor();
    await finalizeInterview(historyRef.current);
  }, [clearNoResponseTimer, finalizeInterview, isRecorderActive, stopRecording, stopVoiceMonitor]);

  const askCurrentQuestion = useCallback(
    async (overridePrompt?: string) => {
      if (!currentQuestion) return;
      setFlowState('asking');
      if (!audioEl) {
        setFlowState('awaiting_answer');
        return;
      }
      const prompt = overridePrompt || buildSpokenPrompt(
        currentQuestion.title,
        currentIndex,
        config.style,
        config.interviewLanguage,
      );
      await speakQuestion(prompt);
      setFlowState('awaiting_answer');
    },
    [audioEl, config.interviewLanguage, config.style, currentIndex, currentQuestion, speakQuestion],
  );

  const handleNoResponse = useCallback(async () => {
    clearNoResponseTimer();
    stopVoiceMonitor();
    if (isRecorderActive) {
      try {
        await stopRecording();
      } catch {}
    }
    setFlowState('no_response');
    try {
      await speakQuestion(buildNoResponsePrompt(config.interviewLanguage));
    } catch {}
  }, [clearNoResponseTimer, config.interviewLanguage, isRecorderActive, speakQuestion, stopRecording, stopVoiceMonitor]);

  const startRecordingFlow = useCallback(async () => {
    if (flowState !== 'awaiting_answer') return;
    try {
      startRecording();
      setFlowState('recording');
      hasSpokenRef.current = false;
      lastSoundAtRef.current = Date.now();
      autoStopRef.current = false;
      baselineDoneRef.current = false;
      noiseThresholdRef.current = SILENCE_THRESHOLD;
      startVoiceMonitor();
      clearNoResponseTimer();
      noResponseTimerRef.current = window.setTimeout(() => {
        if (!hasSpokenRef.current) {
          void handleNoResponse();
        }
      }, NO_RESPONSE_MS);
    } catch (error) {
      console.warn(error);
      showRuntimeNotice('Nao foi possivel iniciar a gravacao. Verifique permissoes de microfone.');
    }
  }, [clearNoResponseTimer, flowState, handleNoResponse, showRuntimeNotice, startRecording, startVoiceMonitor]);

  const continueWithEvaluation = useCallback(
    async (response: AnswerEvaluation) => {
      const nextHistory = [
        ...historyRef.current,
        {
          questionId: currentQuestion.id,
          question: currentQuestion.title,
          section: currentQuestion.section,
          difficulty: currentQuestion.sourceDifficulty,
          evaluation: response,
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
        const nextRes = await BackendApi.nextQuestion({
          config: sanitizedConfig,
          history: nextHistory,
          remainingSeconds,
          difficultyLevel: selectedLevel,
        });

        if (nextRes.shouldFinish || !nextRes.question) {
          await finalizeInterview(nextHistory);
          return;
        }

        const mapped = toUiQuestion(nextRes.question, nextIndex, baseBullets);
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
      } catch (error) {
        console.warn(error);
        if (hasPlannedNext) {
          setFlowState('next_question');
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
      sanitizedConfig,
      selectedLevel,
      showRuntimeNotice,
      timeLimitReached,
    ],
  );

  const stopRecordingFlow = useCallback(
    async (_reason: 'manual' | 'auto') => {
      if (flowState !== 'recording') return;
      if (stopInProgressRef.current) return;
      stopInProgressRef.current = true;
      clearNoResponseTimer();
      stopVoiceMonitor();
      setFlowState('evaluating');
      try {
        const blob = await stopRecording();
        const base64Audio = await blobToBase64(blob);
        void requestLiveCoachInsight({
          audioBase64: base64Audio,
          mimeType: blob.type || 'audio/webm',
        });
        const response = await BackendApi.evaluateAudio({
          config: sanitizedConfig,
          question: currentQuestion.title,
          audioBase64: base64Audio,
          mimeType: blob.type || 'audio/webm',
        });
        await continueWithEvaluation(response);
      } catch (error) {
        console.warn(error);
        showRuntimeNotice('Nao foi possivel processar sua resposta. Tente novamente.');
        setFlowState('awaiting_answer');
      } finally {
        stopInProgressRef.current = false;
      }
    },
    [
      baseBullets,
      clearNoResponseTimer,
      config.interviewLanguage,
      config.track,
      continueWithEvaluation,
      flowState,
      sanitizedConfig,
      showRuntimeNotice,
      stopRecording,
      stopVoiceMonitor,
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
    setFlowState('evaluating');
    try {
      void requestLiveCoachInsight({
        audioBase64: '',
        transcript,
        mimeType: 'text/plain',
      });
      const response = await BackendApi.evaluateText({
        config: sanitizedConfig,
        question: currentQuestion.title,
        transcript,
      });
      setTextAnswer('');
      await continueWithEvaluation(response);
    } catch (error) {
      console.warn(error);
      showRuntimeNotice('Nao foi possivel processar a resposta em texto.');
      setFlowState('awaiting_answer');
    }
  }, [
    clearNoResponseTimer,
    continueWithEvaluation,
    currentQuestion,
    flowState,
    sanitizedConfig,
    showRuntimeNotice,
    stopVoiceMonitor,
    textAnswer,
    requestLiveCoachInsight,
  ]);

  useEffect(() => {
    liveCoachWsDisabledRef.current = false;
    closeLiveCoachSocket('session_reset');
    historyRef.current = [];
    setCurrentIndex(0);
    setFlowState('idle');
    setAnswerMode('audio');
    setTextAnswer('');
    setTimeLimitReached(false);
    setRemainingSeconds(totalSeconds);
    setQuestions(baseQuestions);
    setLiveCoachFeed([]);
    liveCoachFeedRef.current = [];
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
      stopVoiceMonitor();
      closeLiveCoachSocket('session_cleanup');
    };
  }, [baseQuestions, clearNoResponseTimer, closeLiveCoachSocket, stopVoiceMonitor, totalSeconds]);

  useEffect(() => {
    setTextAnswer('');
    setLiveCoachInsight(null);
    setLiveCoachError(null);
    setLiveCoachLoading(false);
    liveCoachChunkInFlightRef.current = false;
    lastLiveCoachChunkAtRef.current = 0;
  }, [currentQuestion?.id]);

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
  }, [askCurrentQuestion, currentQuestion?.id, stopTTS]);

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
  const isAvatarSpeaking = isSpeaking || flowState === 'asking';
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

  const handleModeChange = (nextMode: AnswerMode) => {
    if (isFinished || flowState === 'evaluating' || flowState === 'recording') return;
    setAnswerMode(nextMode);
    clearNoResponseTimer();
    if (nextMode === 'text') {
      stopVoiceMonitor();
    }
  };

  return (
    <div className={styles.room} aria-label="Tela de entrevista">
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
            <AvatarInterviewerCard
              isSpeaking={isAvatarSpeaking}
              mouthOpen={mouthOpen}
              avatarGender="male"
              showHeader={false}
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
          <div className={styles.cameraSlot}>
            <UserCameraCard
              label="Voce"
              isReady={isMediaReady}
              stream={stream}
              isRecording={isRecording}
              error={mediaError || recorderError}
              compact
            />
          </div>
        </div>
      </section>

      <div className={styles.actionArea}>
        <div className={styles.actionStack}>
          {!isFinished && (
            <div className={styles.modeSwitch} role="group" aria-label="Modo de resposta">
              <button
                type="button"
                className={`${styles.modeButton} ${!isTextMode ? styles.modeButtonActive : ''}`}
                onClick={() => handleModeChange('audio')}
                disabled={flowState === 'recording' || flowState === 'evaluating'}
              >
                Voz
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${isTextMode ? styles.modeButtonActive : ''}`}
                onClick={() => handleModeChange('text')}
                disabled={flowState === 'recording' || flowState === 'evaluating'}
              >
                Texto
              </button>
            </div>
          )}
          {!isFinished && (liveCoachLoading || liveCoachInsight || liveCoachError) && (
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
