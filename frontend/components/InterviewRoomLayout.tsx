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

type InterviewFlowState =
  | 'idle'
  | 'asking'
  | 'awaiting_answer'
  | 'recording'
  | 'evaluating'
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

const buildUiQuestions = (plan: InterviewPlan): UiQuestion[] => {
  const baseBullets = (plan.mustHaveSkills ?? []).slice(0, 3);
  return (plan.questions ?? []).map((question, index) => ({
    id: question.id || `q${index + 1}`,
    title: question.prompt,
    type: 'open',
    difficulty: mapDifficultyToLevel(question.difficulty),
    topic: mapSectionToTopic(question.section),
    bullets: baseBullets,
    section: question.section,
    sourceDifficulty: question.difficulty,
  }));
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
}

const InterviewRoomLayout: React.FC<InterviewRoomLayoutProps> = ({ config, plan, onFinish }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flowState, setFlowState] = useState<InterviewFlowState>('idle');
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const finishingRef = useRef(false);

  const { stream, status: mediaStatus, error: mediaError } = useUserMedia(MEDIA_CONSTRAINTS);
  const {
    start: startRecording,
    stop: stopRecording,
    isRecording: isRecorderActive,
    error: recorderError,
  } = useAudioRecorder(stream);

  const { mouthOpen, isSpeaking } = useLipSync(audioEl);

  const uiQuestions = useMemo(() => buildUiQuestions(plan), [plan]);
  const sanitizedConfig = useMemo(() => {
    const { difficultyLevel, ...rest } = config;
    return rest;
  }, [config]);
  const selectedLevel = config.difficultyLevel ?? 3;
  const filteredQuestions = useMemo(
    () => uiQuestions.filter((question) => question.difficulty === selectedLevel),
    [uiQuestions, selectedLevel],
  );
  const activeQuestions = filteredQuestions.length ? filteredQuestions : uiQuestions;
  const currentQuestion = activeQuestions[currentIndex] ?? activeQuestions[0];
  const contextLabel = useMemo(
    () => deriveContextLabel(currentQuestion, config.stacks),
    [currentQuestion, config.stacks],
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
      }
    },
    [audioEl, config.interviewLanguage, stopTTS],
  );

  const finalizeInterview = useCallback(
    async (history: HistoryItem[]) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setFlowState('finished');
      stopTTS();
      try {
        const report = await BackendApi.finalReport({ config: sanitizedConfig, history });
        onFinish?.(report);
      } catch (error) {
        console.warn('Falha ao gerar report', error);
        onFinish?.(buildFallbackReport(history, config, plan));
      } finally {
        finishingRef.current = false;
      }
    },
    [config, onFinish, plan, sanitizedConfig, stopTTS],
  );

  useEffect(() => {
    historyRef.current = [];
    setCurrentIndex(0);
    setFlowState('idle');
  }, [plan, selectedLevel]);

  useEffect(() => {
    if (!currentQuestion) return;
    let cancelled = false;

    const run = async () => {
      setFlowState('asking');
      if (!audioEl) {
        setFlowState('awaiting_answer');
        return;
      }
      await speakQuestion(currentQuestion.title);
      if (!cancelled) {
        setFlowState('awaiting_answer');
      }
    };

    run();

    return () => {
      cancelled = true;
      stopTTS();
    };
  }, [audioEl, currentQuestion?.id, currentQuestion?.title, speakQuestion, stopTTS]);

  useEffect(() => {
    if (flowState !== 'next_question') return;
    if (!activeQuestions.length) return;
    const id = window.setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, activeQuestions.length - 1));
    }, 1200);
    return () => window.clearTimeout(id);
  }, [flowState, activeQuestions.length]);

  const isRecording = flowState === 'recording' || isRecorderActive;
  const isLoading = flowState === 'idle' || !currentQuestion;
  const isAvatarSpeaking = isSpeaking || flowState === 'asking';
  const isMediaReady = mediaStatus === 'ready';
  const isFinished = flowState === 'finished';

  const canStartRecording = flowState === 'awaiting_answer' && isMediaReady;
  const actionDisabled = isFinished || flowState === 'evaluating' || !(canStartRecording || flowState === 'recording');

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
      try {
        startRecording();
        setFlowState('recording');
      } catch (error) {
        console.warn(error);
      }
      return;
    }

    if (flowState === 'recording') {
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

        const isLastQuestion = currentIndex >= activeQuestions.length - 1;
        if (isLastQuestion) {
          await finalizeInterview(nextHistory);
        } else {
          setFlowState('next_question');
        }
      } catch (error) {
        console.warn(error);
        setFlowState('awaiting_answer');
      }
    }
  };

  const handleFinish = async () => {
    if (isRecorderActive) {
      try {
        await stopRecording();
      } catch {}
    }
    await finalizeInterview(historyRef.current);
  };

  return (
    <div className={styles.room} aria-label="Tela de entrevista">
      <div className={styles.topBarArea}>
        <div className={styles.topBarInner}>
          <TopBar
            timer="00:12"
            stage="INTRODUCAO"
            finishLabel="FINALIZAR CONSULTA"
            onFinish={handleFinish}
            showMeta={false}
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
              APRESENTACAO
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
        <PrimaryActionButton
          label={actionLabel}
          variant={isRecording ? 'recording' : 'idle'}
          disabled={actionDisabled}
          onClick={handlePrimaryAction}
        />
      </div>
    </div>
  );
};

export default InterviewRoomLayout;
