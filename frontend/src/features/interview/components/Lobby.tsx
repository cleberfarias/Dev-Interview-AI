import React, { useState, useEffect, useRef } from 'react';
import type { AvatarResponse, CandidateProfile, InterviewConfig, InterviewPlan } from '../../../shared/types';
import type { DifficultyLevel } from '../../../shared/types/interview';
import type { Track } from '../../../shared/types';
import { clampDuration } from '../../../shared/constants';
import { BackendApi } from '../../../shared/services/backendApi';
import {
  getMissingCandidateProfileFields,
  hasCandidateJobProfileAnalysis,
  isCandidateProfileComplete,
} from '../../../shared/utils/candidateProfile';
import styles from './Lobby.module.css';

interface Props {
  config: InterviewConfig;
  userCredits: number;
  candidateProfile?: CandidateProfile | null;
  onOpenProfile?: () => void;
  onStart: (
    plan: InterviewPlan,
    sessionId: string,
    credits: number,
    difficultyLevel?: DifficultyLevel,
    initialAvatar?: AvatarResponse | null,
  ) => void;
  onBack: () => void;
}

const PLAN_GENERATE_TIMEOUT_MS = 8000;

const TRACK_LABELS: Record<Track, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Fullstack',
  mobile: 'Mobile',
  devops: 'DevOps',
  data: 'Data',
};

const MODE_LABELS = {
  candidate_coaching_mode: 'Coaching do candidato',
  hiring_assessment_mode: 'Avaliacao de contratacao',
} as const;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
};

const starterPrompt = (language: string): string => {
  const prompts: Record<string, string> = {
    'pt-BR':
      'Para aquecer, conte sobre um projeto recente e qual foi o desafio tecnico mais dificil que voce resolveu.',
    en: 'To warm up, tell me about a recent project and the hardest technical challenge you solved.',
    es: 'Para empezar, cuentame sobre un proyecto reciente y cual fue el desafio tecnico mas dificil que resolviste.',
  };
  return prompts[language] || prompts['pt-BR'];
};

const starterDifficulty = (level: DifficultyLevel): number => {
  if (level <= 1) return 2;
  if (level === 2) return 3;
  return 4;
};

const buildStarterPlan = (config: InterviewConfig, level: DifficultyLevel): InterviewPlan => ({
  roleTitleGuess: config.track || 'Entrevista',
  seniorityGuess: config.seniority,
  mustHaveSkills: config.stacks || [],
  blueprint: { hr: 15, technical: 50, design: 20, behavioral: 15 },
  questions: [
    {
      id: 'q1',
      section: 'technical',
      difficulty: starterDifficulty(level),
      prompt: starterPrompt(config.interviewLanguage),
    },
  ],
});

const Lobby: React.FC<Props> = ({ config, userCredits, candidateProfile, onOpenProfile, onStart, onBack }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showNoJobModal, setShowNoJobModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<DifficultyLevel>(config.difficultyLevel ?? 3);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioIntervalRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasCredits = userCredits > 0;
  const profileMissingFields = getMissingCandidateProfileFields(candidateProfile);
  const profileCompleteFromCache = candidateProfile ? isCandidateProfileComplete(candidateProfile) : false;
  const hasJobAnalysisFromCache = hasCandidateJobProfileAnalysis(candidateProfile);
  const startBlockedByProfile = Boolean(candidateProfile && !profileCompleteFromCache);

  useEffect(() => {
    let cancelled = false;

    async function setupMedia() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = s;
        setStream(s);
        setError(null);
        if (videoRef.current) videoRef.current.srcObject = s;

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(s);
        source.connect(analyser);
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average);
          audioIntervalRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch (err) {
        console.error(err);
        setError('Nao foi possivel acessar camera/microfone. Libere as permissoes e tente novamente.');
      }
    }

    setupMedia();

    return () => {
      cancelled = true;
      if (audioIntervalRef.current) {
        cancelAnimationFrame(audioIntervalRef.current);
        audioIntervalRef.current = null;
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx) {
        void ctx.close().catch(() => null);
      }
      setStream(null);
    };
  }, []);

  const startInterviewSession = async () => {
    setLoading(true);
    setError(null);

    try {
      const { difficultyLevel, ...restConfig } = config;
      const effectiveConfig = { ...restConfig, duration: clampDuration(config.duration, config.plan) };
      const orchestratedStart = await BackendApi.orchestratorStart({
        config: effectiveConfig,
        jobDescription: effectiveConfig.jobDescription,
        includeContext: true,
        difficultyLevel: selectedLevel,
      });
      const res = orchestratedStart.session;

      const nextRes = orchestratedStart.initialNextQuestion;
      if (nextRes?.question && !nextRes.shouldFinish) {
        const planStub: InterviewPlan = {
          roleTitleGuess: effectiveConfig.track || 'Entrevista',
          seniorityGuess: effectiveConfig.seniority,
          mustHaveSkills: effectiveConfig.stacks || [],
          blueprint: { hr: 15, technical: 50, design: 20, behavioral: 15 },
          questions: [nextRes.question],
        };
        onStart(planStub, res.sessionId, res.credits, selectedLevel, orchestratedStart.initialAvatar || null);
        return;
      }

      try {
        const generated = await withTimeout(
          BackendApi.generatePlan(res.sessionId),
          PLAN_GENERATE_TIMEOUT_MS,
        );
        if (generated?.plan?.questions?.length) {
          onStart(generated.plan, generated.sessionId, generated.credits, selectedLevel, null);
          return;
        }
      } catch (planErr) {
        console.warn('Plan generation fallback failed', planErr);
      }

      onStart(buildStarterPlan(effectiveConfig, selectedLevel), res.sessionId, res.credits, selectedLevel, null);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Erro ao iniciar sessao.';
      setError(message);
      setLoading(false);
    }
  };

  const handleEnter = async () => {
    if (!hasCredits || loading) return;
    setError(null);

    const resolvedProfile =
      candidateProfile ||
      (await BackendApi.getCandidateProfile().catch(() => null));

    const missingProfileFields = getMissingCandidateProfileFields(resolvedProfile);
    if (missingProfileFields.length > 0) {
      setError(
        `Antes de iniciar a entrevista, complete o perfil do candidato. Faltando: ${missingProfileFields.join(', ')}.`,
      );
      return;
    }

    if (!hasCandidateJobProfileAnalysis(resolvedProfile)) {
      setShowNoJobModal(true);
      return;
    }

    await startInterviewSession();
  };

  const handleConfirmStartWithoutJob = async () => {
    setShowNoJobModal(false);
    await startInterviewSession();
  };

  const roleLabel = TRACK_LABELS[config.track as Track] || config.track || 'Entrevista tecnica';
  const modeLabel = MODE_LABELS[config.interviewMode || 'candidate_coaching_mode'];

  return (
    <div className={styles.page}>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.hero}>
          <h1>Prepare sua entrevista</h1>
          <p>
            Revise camera, microfone e inicie sua simulacao com IA.
          </p>
        </header>

        {error && <div className={styles.alert}>{error}</div>}

        <div className={styles.grid}>
          <section className={styles.mainCard}>
            <div className={styles.previewFrame} data-tour-id="lobby-preview">
              <video ref={videoRef} autoPlay muted playsInline className={styles.video} />
              <div className={styles.videoShade} />

              {!stream && (
                <div className={styles.loadingState}>
                  <div className={styles.spinner} />
                  <span>Ativando camera e microfone...</span>
                </div>
              )}

              <div className={styles.previewTop}>
                <div className={styles.liveBadge}>
                  <span />
                  <strong>Preview ao vivo</strong>
                </div>

                <div className={styles.micBadge}>
                  <div className={styles.micBars}>
                    {[12, 24, 36].map((limit) => (
                      <i key={limit} className={audioLevel > limit ? styles.micBarOn : ''} />
                    ))}
                  </div>
                  <strong>Mic ativo</strong>
                </div>
              </div>

              <div className={styles.previewBottom}>
                <span>Entrevista para {roleLabel}</span>
                <span>Nivel {selectedLevel}</span>
              </div>
            </div>

            <div className={styles.statusRow}>
              <span className={`${styles.statusChip} ${stream ? styles.statusOk : styles.statusWarn}`}>
                Camera {stream ? 'pronta' : 'pendente'}
              </span>
              <span className={`${styles.statusChip} ${audioLevel > 6 ? styles.statusOk : styles.statusWarn}`}>
                Microfone {audioLevel > 6 ? 'pronto' : 'pendente'}
              </span>
              <button
                type="button"
                className={styles.settingsButton}
                onClick={() => setError('Ajuste permissoes de camera e microfone nas configuracoes do navegador.')}
                data-tour-id="lobby-settings"
              >
                Configuracoes
              </button>
            </div>

            <div className={styles.metaRow}>
              <span>Custo: 1 credito</span>
              <span>Saldo: {userCredits}</span>
              <span>Duracao aprox: {config.duration} min</span>
            </div>

            <div className={styles.metaRow}>
              <span>Modo: {modeLabel}</span>
              <span>Idioma: {config.interviewLanguage}</span>
              <span>Estilo: {config.style}</span>
            </div>

            {candidateProfile && !profileCompleteFromCache && (
              <div className={styles.warningBox}>
                Complete o perfil do candidato antes de iniciar a entrevista.
                <div className={styles.warningDetail}>
                  Faltando: {profileMissingFields.join(', ')}.
                </div>
                {onOpenProfile && (
                  <button type="button" onClick={onOpenProfile} className={styles.warningAction}>
                    Ir para perfil
                  </button>
                )}
              </div>
            )}

            {candidateProfile && profileCompleteFromCache && !hasJobAnalysisFromCache && (
              <div className={styles.warningBox}>
                Perfil do candidato pronto. A analise da vaga ainda nao foi feita e sera confirmada ao iniciar.
              </div>
            )}

            {!hasCredits && (
              <div className={styles.warningBox}>
                Creditos insuficientes. Voce precisa de pelo menos 1 credito para iniciar.
              </div>
            )}

            <div className={styles.levelBlock} data-tour-id="lobby-level">
              <p>Nivel da entrevista</p>
              <div className={styles.levelButtons}>
                {([1, 2, 3] as DifficultyLevel[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSelectedLevel(level)}
                    aria-pressed={selectedLevel === level}
                    className={`${styles.levelButton} ${selectedLevel === level ? styles.levelButtonActive : ''}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.actionRow}>
              <button type="button" onClick={onBack} className={styles.backButton}>
                Voltar
              </button>
              <button
                type="button"
                onClick={handleEnter}
                disabled={loading || !stream || !hasCredits || startBlockedByProfile}
                data-tour-id="lobby-start"
                className={styles.startButton}
              >
                {loading ? 'Iniciando...' : 'Iniciar entrevista'}
              </button>
            </div>
          </section>

          <aside className={styles.sideCard}>
            <h3>Checklist da entrevista</h3>
            <ul className={styles.checkList}>
              <li>Teste camera e microfone antes de comecar.</li>
              <li>Revise descricao da vaga e stack principal.</li>
              <li>Escolha um nivel de dificuldade adequado.</li>
              <li>Tenha exemplos reais de projetos para responder.</li>
            </ul>

            <div className={styles.sideMeta}>
              <p><strong>Trilha:</strong> {roleLabel}</p>
              <p><strong>Senioridade:</strong> {config.seniority}</p>
              <p><strong>Idioma:</strong> {config.interviewLanguage}</p>
              <p><strong>Modo:</strong> {modeLabel}</p>
            </div>
          </aside>
        </div>

        {showNoJobModal && (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="no-job-modal-title">
            <div className={styles.modalCard}>
              <h3 id="no-job-modal-title">Iniciar sem perfil da vaga?</h3>
              <p>
                Voce ainda nao analisou a vaga. Deseja continuar mesmo assim?
                A entrevista pode ficar menos personalizada.
              </p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowNoJobModal(false)}
                  className={styles.modalCancelButton}
                  disabled={loading}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleConfirmStartWithoutJob();
                  }}
                  className={styles.modalConfirmButton}
                  disabled={loading}
                >
                  {loading ? 'Iniciando...' : 'Iniciar assim mesmo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Lobby;
