import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './InterviewRoomLayout.module.css';
import TopBar from './TopBar';
import AvatarInterviewerCard from './AvatarInterviewerCard';
import QuestionVisualCard from './QuestionVisualCard';
import UserCameraCard from './UserCameraCard';
import PrimaryActionButton from './PrimaryActionButton';
import { useUserMedia } from '../hooks/useUserMedia';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { BackendApi } from '../services/backendApi';
import { useLipSync } from '../src/hooks/useLipSync';
import type { AnswerEvaluation, FinalReport, InterviewConfig, InterviewPlan } from '../types';
import type { DifficultyLevel, InterviewQuestion } from '../types/interview';
import { I18N } from '../constants';

type InterviewFlowState =
  | 'idle'
  | 'asking'
  | 'awaiting_answer'
  | 'recording'
  | 'evaluating'
  | 'no_response'
  | 'next_question'
  | 'finished';

type UiQuestion = InterviewQuestion & {
  section?: string;
  sourceDifficulty?: number;
};

type HistoryItem = {
  questionId: string;
  question: string;
  section?: string;
  difficulty?: number;
  evaluation: AnswerEvaluation;
};

const MEDIA_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: true };
const NO_RESPONSE_MS = 5000;
const SILENCE_STOP_MS = 1500;
const SILENCE_THRESHOLD = 0.02;
const AUTO_MODE = true;

const mapDifficultyToLevel = (value?: number): DifficultyLevel => {
  const diff = typeof value === 'number' ? value : 3;
  if (diff <= 2) return 1;
  if (diff <= 4) return 2;
  return 3;
};

const mapSectionToTopic = (section?: string): string => {
  switch ((section || '').toLowerCase()) {
    case 'design':
      return 'system_design';
    case 'technical':
      return 'algorithms';
    case 'behavioral':
      return 'default';
    case 'hr':
      return 'default';
    default:
      return 'scalability';
  }
};

const LOCAL_FALLBACK_QUESTIONS: Record<string, Record<string, string[]>> = {
  'pt-BR': {
    frontend: [
      'Como voce estruturaria um componente React para ser reutilizavel sem perder legibilidade?',
      'Quando usar memoizacao no frontend e quais sinais mostram que ela e necessaria?',
      'Como voce investigaria uma tela lenta em producao no navegador?',
      'Qual estrategia usaria para tratar estados de erro e loading em uma pagina complexa?',
      'Como voce organizaria testes para garantir confianca em um fluxo critico de UI?',
      'Como evitar regressao de performance em bundles grandes de frontend?',
    ],
    backend: [
      'Como voce desenharia um endpoint resiliente para picos de requisicoes?',
      'Quando escolheria fila assincrona em vez de processamento sincrono?',
      'Como faria observabilidade de uma API para reduzir MTTR?',
      'Qual estrategia usaria para lidar com concorrencia em escrita de dados?',
      'Como voce decidiria entre cache local, Redis e CDN?',
      'Como protegeria endpoints criticos contra abuso e replay?',
    ],
    default: [
      'Descreva um desafio tecnico recente e como voce decidiu a solucao.',
      'Como voce prioriza trade-offs entre prazo, qualidade e manutencao?',
      'Quais metricas voce acompanha para validar impacto de uma entrega?',
      'Como voce faria rollout seguro de uma mudanca com risco alto?',
      'Como voce se prepara para debugar problemas intermitentes em producao?',
      'Qual foi uma decisao tecnica dificil e o que voce aprendeu?',
    ],
  },
  en: {
    frontend: [
      'How would you structure a reusable React component without hurting readability?',
      'When should you use memoization in frontend and what signals indicate it?',
      'How would you investigate a slow production screen in the browser?',
      'How do you handle loading and error states in a complex page?',
      'How would you design tests for a critical UI flow?',
      'How do you prevent performance regressions in large frontend bundles?',
    ],
    backend: [
      'How would you design a resilient API endpoint for traffic spikes?',
      'When would you choose async queues over synchronous processing?',
      'How would you implement observability to reduce MTTR?',
      'What strategy would you use for concurrent write operations?',
      'How do you choose between in-memory cache, Redis and CDN?',
      'How would you protect critical endpoints from abuse and replay?',
    ],
    default: [
      'Describe a recent technical challenge and how you chose the solution.',
      'How do you prioritize trade-offs between speed, quality and maintenance?',
      'Which metrics do you track to validate delivery impact?',
      'How would you do a safe rollout for a high-risk change?',
      'How do you prepare to debug intermittent production issues?',
      'Tell me about a hard technical decision and what you learned.',
    ],
  },
  es: {
    frontend: [
      'Como estructurarias un componente React reutilizable sin perder claridad?',
      'Cuando usarias memoizacion en frontend y que senales lo justifican?',
      'Como investigarias una pantalla lenta en produccion en el navegador?',
      'Como manejas estados de carga y error en una pagina compleja?',
      'Como organizarias pruebas para un flujo critico de UI?',
      'Como evitas regresiones de rendimiento en bundles grandes?',
    ],
    backend: [
      'Como disenarias un endpoint resiliente para picos de trafico?',
      'Cuando elegirias colas asincronas sobre procesamiento sincrono?',
      'Como implementarias observabilidad para reducir MTTR?',
      'Que estrategia usarias para escrituras concurrentes?',
      'Como eliges entre cache local, Redis y CDN?',
      'Como protegerias endpoints criticos contra abuso y replay?',
    ],
    default: [
      'Describe un desafio tecnico reciente y como elegiste la solucion.',
      'Como priorizas trade-offs entre velocidad, calidad y mantenimiento?',
      'Que metricas sigues para validar impacto de una entrega?',
      'Como harias un rollout seguro para un cambio de alto riesgo?',
      'Como te preparas para depurar fallas intermitentes en produccion?',
      'Cuentame una decision tecnica dificil y que aprendiste.',
    ],
  },
};

const getLocalFallbackPrompt = (track: string, language: string, index: number): string | null => {
  const byLanguage = LOCAL_FALLBACK_QUESTIONS[language] || LOCAL_FALLBACK_QUESTIONS['pt-BR'];
  const list = byLanguage[track] || byLanguage.default;
  if (!list?.length) return null;
  return list[index % list.length];
};

const toUiQuestion = (
  question: { id?: string; prompt: string; section?: string; difficulty?: number },
  index: number,
  bullets: string[],
): UiQuestion => ({
  id: question.id || `q${index + 1}`,
  title: question.prompt,
  type: 'open',
  difficulty: mapDifficultyToLevel(question.difficulty),
  topic: mapSectionToTopic(question.section),
  bullets,
  section: question.section,
  sourceDifficulty: question.difficulty,
});

const buildUiQuestions = (plan: InterviewPlan): UiQuestion[] => {
  const baseBullets = (plan.mustHaveSkills ?? []).slice(0, 3);
  return (plan.questions ?? []).map((question, index) =>
    toUiQuestion(question, index, baseBullets),
  );
};

const pickVariant = (items: string[], index: number): string =>
  items.length ? items[index % items.length] : '';

const buildSpokenPrompt = (
  question: string,
  index: number,
  style: string,
  language: string,
): string => {
  const script: Record<string, any> = {
    'pt-BR': {
      friendly: {
        intro: ['Oi! Vamos comecar.', 'Tudo certo? Vamos iniciar.'],
        next: ['Legal, vamos para a proxima.', 'Beleza, proxima pergunta.'],
        suffix: ['Pode ficar a vontade.', 'Sem pressa.'],
      },
      neutral: {
        intro: ['Vamos iniciar a entrevista.', 'Comecando agora.'],
        next: ['Proxima pergunta.', 'Seguinte.'],
        suffix: [''],
      },
      strict: {
        intro: ['Vamos direto ao ponto.', 'Comecemos sem rodeios.'],
        next: ['Responda objetivamente.', 'Proxima pergunta.'],
        suffix: ['Seja direto.'],
      },
    },
    en: {
      friendly: {
        intro: ['Hi! Let us get started.', 'Ready? Let us begin.'],
        next: ['Great, onto the next one.', 'Awesome, next question.'],
        suffix: ['Take your time.', 'No rush.'],
      },
      neutral: {
        intro: ['Starting the interview now.', 'Let us begin.'],
        next: ['Next question.', 'Moving on.'],
        suffix: [''],
      },
      strict: {
        intro: ['Let us go straight to it.', 'We will begin now.'],
        next: ['Answer directly.', 'Next question.'],
        suffix: ['Be concise.'],
      },
    },
    es: {
      friendly: {
        intro: ['Hola, vamos a empezar.', 'Todo listo? Comencemos.'],
        next: ['Bien, vamos a la siguiente.', 'Perfecto, siguiente pregunta.'],
        suffix: ['Toma tu tiempo.', 'Sin prisa.'],
      },
      neutral: {
        intro: ['Iniciamos la entrevista.', 'Empecemos ahora.'],
        next: ['Siguiente pregunta.', 'Continuamos.'],
        suffix: [''],
      },
      strict: {
        intro: ['Vamos directo al punto.', 'Comencemos sin rodeos.'],
        next: ['Responde de forma objetiva.', 'Siguiente pregunta.'],
        suffix: ['Se conciso.'],
      },
    },
  };

  const langKey = script[language] ? language : 'pt-BR';
  const styleKey = script[langKey][style] ? style : 'neutral';
  const variants = script[langKey][styleKey];
  const intro = pickVariant(variants.intro, index);
  const next = pickVariant(variants.next, index);
  const suffix = pickVariant(variants.suffix, index);
  const opener = index === 0 ? intro : next;
  const spacer = opener ? `${opener} ` : '';
  const tail = suffix ? ` ${suffix}` : '';
  return `${spacer}${question}${tail}`.trim();
};

const buildNoResponsePrompt = (language: string): string => {
  const map: Record<string, string> = {
    'pt-BR': 'Nao detectei resposta. Voce quer continuar ou cancelar?',
    en: "I didn't detect a response. Do you want to continue or cancel?",
    es: 'No detecte respuesta. Â¿Quieres continuar o cancelar?',
  };
  return map[language] || map['pt-BR'];
};

const deriveContextLabel = (
  question: UiQuestion | undefined,
  stacks: string[] = [],
): string | undefined => {
  if (!question) return undefined;
  const text = `${question.title} ${(question.bullets ?? []).join(' ')}`.toLowerCase();
  const keywordMap: Array<{ keywords: string[]; label: string }> = [
    { keywords: ['javascript', 'js'], label: 'JavaScript' },
    { keywords: ['typescript', 'ts'], label: 'TypeScript' },
    { keywords: ['react', 'jsx'], label: 'React' },
    { keywords: ['vue'], label: 'Vue' },
    { keywords: ['angular'], label: 'Angular' },
    { keywords: ['node', 'node.js', 'nodejs'], label: 'Node.js' },
    { keywords: ['api', 'rest', 'graphql'], label: 'APIs' },
    { keywords: ['cache', 'redis'], label: 'Cache' },
    { keywords: ['cdn'], label: 'CDN' },
    { keywords: ['load balancer', 'balanceamento'], label: 'Load Balancer' },
    { keywords: ['sql', 'banco de dados', 'database'], label: 'Banco de Dados' },
    { keywords: ['seguranca', 'oauth', 'jwt', 'auth'], label: 'Segurança' },
  ];

  for (const entry of keywordMap) {
    if (entry.keywords.some((keyword) => text.includes(keyword))) {
      return entry.label;
    }
  }

  for (const stack of stacks) {
    const normalized = stack.toLowerCase();
    if (normalized && text.includes(normalized)) {
      return stack;
    }
  }

  if (question.topic) {
    return question.topic.replace(/_/g, ' ');
  }

  return undefined;
};

const summarizeScores = (history: HistoryItem[]) => {
  if (!history.length) return { overall: 0, summary: undefined };
  const totals = { communication: 0, technical: 0, problemSolving: 0, presence: 0 };
  let count = 0;
  history.forEach((item) => {
    const scores = item.evaluation?.scores;
    if (!scores) return;
    totals.communication += scores.communication ?? 0;
    totals.technical += scores.technical ?? 0;
    totals.problemSolving += scores.problemSolving ?? 0;
    totals.presence += scores.presence ?? 0;
    count += 1;
  });
  if (!count) return { overall: 0, summary: undefined };
  const summary = {
    communication: Number((totals.communication / count).toFixed(2)),
    technical: Number((totals.technical / count).toFixed(2)),
    problemSolving: Number((totals.problemSolving / count).toFixed(2)),
    presence: Number((totals.presence / count).toFixed(2)),
  };
  const overall =
    (summary.communication + summary.technical + summary.problemSolving + summary.presence) / 4;
  return { overall: Number(overall.toFixed(2)), summary };
};

const buildFallbackReport = (
  history: HistoryItem[],
  config: InterviewConfig,
  plan: InterviewPlan,
): FinalReport => {
  const { overall, summary } = summarizeScores(history);
  const strengths = history.flatMap((item) => item.evaluation?.strengths ?? []);
  const improvements = history.flatMap((item) => item.evaluation?.improvements ?? []);
  return {
    overallScore: overall,
    levelEstimate: config.seniority,
    jobMatch: {
      covered: plan.mustHaveSkills ?? [],
      gaps: [],
    },
    feedback: {
      posture: [],
      communication: improvements.slice(0, 5),
      technical: strengths.slice(0, 5),
      language: [],
    },
    plan7Days: [],
    scoresSummary: summary,
  };
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler audio.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};

interface InterviewRoomLayoutProps {
  config: InterviewConfig;
  plan: InterviewPlan;
  onFinish?: (report: FinalReport) => void;
  onBack?: () => void;
}

const InterviewRoomLayout: React.FC<InterviewRoomLayoutProps> = ({ config, plan, onFinish, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flowState, setFlowState] = useState<InterviewFlowState>('idle');
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.round((config.duration ?? 0) * 60)),
  );
  const [timeLimitReached, setTimeLimitReached] = useState(false);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const finishingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const noResponseTimerRef = useRef<number | null>(null);
  const stopInProgressRef = useRef(false);
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
  } = useAudioRecorder(stream);

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
        const response = await BackendApi.evaluateAudio({
          config: sanitizedConfig,
          question: currentQuestion.title,
          audioBase64: base64Audio,
          mimeType: blob.type || 'audio/webm',
        });

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
      currentIndex,
      currentQuestion?.id,
      currentQuestion?.section,
      currentQuestion?.sourceDifficulty,
      currentQuestion?.title,
      fallbackMaxQuestions,
      finalizeInterview,
      flowState,
      showRuntimeNotice,
      questions,
      remainingSeconds,
      sanitizedConfig,
      selectedLevel,
      stopRecording,
      stopVoiceMonitor,
      timeLimitReached,
    ],
  );

  useEffect(() => {
    historyRef.current = [];
    setCurrentIndex(0);
    setFlowState('idle');
    setTimeLimitReached(false);
    setRemainingSeconds(totalSeconds);
    setQuestions(baseQuestions);
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
    };
  }, [baseQuestions, clearNoResponseTimer, stopVoiceMonitor, totalSeconds]);

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
    if (!isMediaReady) return;
    if (flowState === 'no_response') return;
    if (isRecorderActive) return;
    startRecordingFlow();
  }, [flowState, isMediaReady, isRecorderActive, startRecordingFlow]);

  const isRecording = flowState === 'recording' || isRecorderActive;
  const isLoading = flowState === 'idle' || !currentQuestion;
  const isAvatarSpeaking = isSpeaking || flowState === 'asking';
  const isFinished = flowState === 'finished';

  const canStartRecording = flowState === 'awaiting_answer' && isMediaReady;
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
