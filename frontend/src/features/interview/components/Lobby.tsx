import React, { useState, useEffect, useRef } from 'react';
import type {
  AvatarResponse,
  CandidateProfile,
  InterviewConfig,
  InterviewPlan,
  InterviewStyle,
  LanguageCode,
  Seniority,
} from '../../../shared/types';
import type { DifficultyLevel, InterviewModeLevel } from '../../../shared/types/interview';
import type { Track } from '../../../shared/types';
import { clampDuration } from '../../../shared/constants';
import { BackendApi } from '../../../shared/services/backendApi';
import {
  deriveTechnicalDifficultyLevel,
  getInterviewModeLevelMeta,
  normalizeInterviewModeLevel,
} from '../../../shared/utils/interviewMode';
import {
  getMissingCandidateProfileFields,
  hasCandidateJobProfileAnalysis,
  isCandidateProfileComplete,
} from '../../../shared/utils/candidateProfile';
import { primeSharedTtsAudio } from '../../../shared/utils/audioPlayback';
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
    interviewModeLevel?: InterviewModeLevel,
    initialAvatar?: AvatarResponse | null,
  ) => void;
  onBack: () => void;
}

const PLAN_GENERATE_TIMEOUT_MS = 12000;
const INTERVIEW_SESSION_MIN_CREDITS = 2;

const TRACK_LABELS: Record<Track, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Fullstack',
  mobile: 'Mobile',
  devops: 'DevOps',
  data: 'Data',
};

const SENIORITY_LABELS: Record<Seniority, string> = {
  intern: 'Estagio',
  junior: 'Junior',
  mid: 'Pleno',
  senior: 'Senior',
  staff: 'Staff',
};

const STYLE_LABELS: Record<InterviewStyle, string> = {
  friendly: 'Amigavel',
  neutral: 'Neutro',
  strict: 'Rigoroso',
};

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  'pt-BR': 'Portugues',
  en: 'English',
  es: 'Espanol',
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

const buildStarterPlan = (config: InterviewConfig, technicalLevel: DifficultyLevel): InterviewPlan => ({
  roleTitleGuess: config.track || 'Entrevista',
  seniorityGuess: config.seniority,
  mustHaveSkills: config.stacks || [],
  blueprint: { hr: 15, technical: 50, design: 20, behavioral: 15 },
  questions: [
    {
      id: 'q1',
      section: 'technical',
      difficulty: starterDifficulty(technicalLevel),
      prompt: starterPrompt(config.interviewLanguage),
    },
  ],
});

const Lobby: React.FC<Props> = ({ config, userCredits, candidateProfile, onOpenProfile, onStart, onBack }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showNoJobModal, setShowNoJobModal] = useState(false);
  const [selectedModeLevel, setSelectedModeLevel] = useState<InterviewModeLevel>(
    normalizeInterviewModeLevel(config.interviewModeLevel),
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioIntervalRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasCredits = userCredits >= INTERVIEW_SESSION_MIN_CREDITS;
  const profileMissingFields = getMissingCandidateProfileFields(candidateProfile);
  const profileCompleteFromCache = candidateProfile ? isCandidateProfileComplete(candidateProfile) : false;
  const hasJobAnalysisFromCache = hasCandidateJobProfileAnalysis(candidateProfile);
  const startBlockedByProfile = Boolean(candidateProfile && !profileCompleteFromCache);
  const cameraReady = Boolean(stream);
  const microphonePermissionReady = Boolean(stream?.getAudioTracks().length);
  const microphoneSignalDetected = audioLevel > 6;
  const technicalDifficultyLevel = deriveTechnicalDifficultyLevel(config.seniority);
  const selectedModeMeta = getInterviewModeLevelMeta(selectedModeLevel);

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
    setLoadingStage('Criando sessao com IA...');
    setError(null);

    try {
      const effectiveConfig = {
        ...config,
        duration: clampDuration(config.duration, config.plan),
        interviewModeLevel: selectedModeLevel,
      };
      const orchestratedStart = await BackendApi.orchestratorStart({
        config: effectiveConfig,
        jobDescription: effectiveConfig.jobDescription,
        includeContext: true,
        difficultyLevel: technicalDifficultyLevel,
      });
      const res = orchestratedStart.session;

      setLoadingStage('Preparando roteiro da entrevista...');
      try {
        const generated = await withTimeout(
          BackendApi.generatePlan(res.sessionId),
          PLAN_GENERATE_TIMEOUT_MS,
        );
        if (generated?.plan?.questions?.length) {
          onStart(generated.plan, generated.sessionId, generated.credits, selectedModeLevel, null);
          return;
        }
      } catch (planErr) {
        console.warn('Plan generation fallback failed', planErr);
      }

      const nextRes = orchestratedStart.initialNextQuestion;
      if (nextRes?.question && !nextRes.shouldFinish) {
        setLoadingStage('Entrando com a primeira pergunta preparada...');
        const planStub: InterviewPlan = {
          roleTitleGuess: effectiveConfig.track || 'Entrevista',
          seniorityGuess: effectiveConfig.seniority,
          mustHaveSkills: effectiveConfig.stacks || [],
          blueprint: { hr: 15, technical: 50, design: 20, behavioral: 15 },
          questions: [nextRes.question],
        };
        onStart(planStub, res.sessionId, res.credits, selectedModeLevel, orchestratedStart.initialAvatar || null);
        return;
      }

      setLoadingStage('Usando roteiro inicial da sessao...');
      onStart(
        buildStarterPlan(effectiveConfig, technicalDifficultyLevel),
        res.sessionId,
        res.credits,
        selectedModeLevel,
        null,
      );
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Erro ao iniciar sessao.';
      setError(message);
      setLoading(false);
      setLoadingStage(null);
    }
  };

  const handleEnter = async () => {
    if (!hasCredits || loading) return;
    setError(null);
    await primeSharedTtsAudio().catch(() => false);

    if (!cameraReady) {
      setError('Libere a camera no navegador antes de iniciar a entrevista.');
      return;
    }

    if (!microphonePermissionReady) {
      setError('Libere o microfone no navegador antes de entrar na sala.');
      return;
    }

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
    await primeSharedTtsAudio().catch(() => false);
    await startInterviewSession();
  };

  const roleLabel = TRACK_LABELS[config.track as Track] || config.track || 'Entrevista tecnica';
  const modeLabel = MODE_LABELS[config.interviewMode || 'candidate_coaching_mode'];
  const seniorityLabel = SENIORITY_LABELS[config.seniority] || config.seniority;
  const styleLabel = STYLE_LABELS[config.style] || config.style;
  const languageLabel = LANGUAGE_LABELS[config.interviewLanguage] || config.interviewLanguage;
  const readinessComplete = cameraReady && microphonePermissionReady && hasCredits && !startBlockedByProfile;
  const readinessItems = [
    {
      label: 'Camera',
      value: cameraReady ? 'Pronta' : 'Permissao pendente',
      ready: cameraReady,
    },
    {
      label: 'Microfone',
      value: microphoneSignalDetected
        ? 'Captando'
        : microphonePermissionReady
          ? 'Liberado'
          : 'Permissao pendente',
      ready: microphonePermissionReady,
    },
    {
      label: 'Creditos',
      value: `${userCredits} disponiveis`,
      ready: hasCredits,
    },
    {
      label: 'Entrada',
      value: readinessComplete ? 'Liberada' : 'Revisar pendencias',
      ready: readinessComplete,
    },
  ];
  const sessionFacts = [
    { label: 'Trilha', value: roleLabel },
    { label: 'Senioridade', value: seniorityLabel },
    { label: 'Modo', value: modeLabel },
    { label: 'Formato', value: selectedModeMeta.label },
    { label: 'Idioma', value: languageLabel },
    { label: 'Estilo', value: styleLabel },
    { label: 'Duracao', value: `${config.duration} min` },
  ];
  const profileContextLabel = candidateProfile
    ? profileCompleteFromCache
      ? hasJobAnalysisFromCache
        ? 'Perfil e vaga conectados para personalizar a entrevista.'
        : 'Perfil pronto. A vaga ainda pode ser confirmada no inicio.'
      : `Perfil incompleto: ${profileMissingFields.join(', ')}.`
    : 'Seu perfil sera validado no inicio da sessao.';
  const checklistItems = [
    'Teste camera e microfone antes de entrar na sala.',
    hasJobAnalysisFromCache
      ? 'A descricao da vaga ja esta conectada ao contexto da entrevista.'
      : 'Sem analise de vaga, a entrevista segue com contexto mais generico.',
    'Escolha o formato que melhor representa o apoio visual desejado.',
    'Tenha um exemplo recente de projeto para abrir a conversa com seguranca.',
  ];
  const startHint = !hasCredits
    ? `Adicione pelo menos ${INTERVIEW_SESSION_MIN_CREDITS} creditos para iniciar e concluir a entrevista.`
    : startBlockedByProfile
      ? 'Finalize o perfil do candidato para liberar a entrevista.'
      : !cameraReady
        ? 'Libere a camera no navegador para seguir.'
        : !microphonePermissionReady
          ? 'Libere o microfone no navegador para seguir.'
          : !microphoneSignalDetected
            ? 'Microfone liberado. Se quiser testar antes, fale por alguns segundos.'
          : `Tudo certo. Formato selecionado: ${selectedModeMeta.label}.`;

  return (
    <div className={styles.page}>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.hero}>
          <span className={styles.heroEyebrow}>Pre-entrevista</span>
          <h1>Revise o setup e entre na sala</h1>
          <p>
            Em menos de 1 minuto voce valida camera, microfone, formato e o contexto da entrevista.
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
                <span>{roleLabel}</span>
                <span>Formato {selectedModeMeta.label}</span>
              </div>
            </div>

            <div className={styles.statusRow}>
              <span className={`${styles.statusChip} ${cameraReady ? styles.statusOk : styles.statusWarn}`}>
                Camera {cameraReady ? 'pronta' : 'pendente'}
              </span>
              <span className={`${styles.statusChip} ${microphonePermissionReady ? styles.statusOk : styles.statusWarn}`}>
                Microfone {microphoneSignalDetected ? 'captando' : microphonePermissionReady ? 'liberado' : 'pendente'}
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

            <div className={styles.readinessPanel}>
              <div className={styles.readinessHeader}>
                <div>
                  <span className={styles.panelEyebrow}>Checklist rapido</span>
                  <h2>Tudo pronto para entrar?</h2>
                </div>
                <span className={`${styles.readinessBadge} ${readinessComplete ? styles.readyBadge : styles.reviewBadge}`}>
                  {readinessComplete ? 'Pronto' : 'Revisar'}
                </span>
              </div>
              <div className={styles.readinessGrid}>
                {readinessItems.map((item) => (
                  <div key={item.label} className={styles.readinessItem}>
                    <span className={styles.readinessLabel}>{item.label}</span>
                    <strong className={item.ready ? styles.readinessValueOk : styles.readinessValueWarn}>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.factGrid} aria-label="Resumo da sessao">
              {sessionFacts.map((fact) => (
                <div key={fact.label} className={styles.factCard}>
                  <span className={styles.factLabel}>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
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
                Creditos insuficientes. Voce precisa de pelo menos {INTERVIEW_SESSION_MIN_CREDITS} creditos para gerar o roteiro e consolidar o relatorio final.
              </div>
            )}

            {cameraReady && microphonePermissionReady && !microphoneSignalDetected && (
              <div className={styles.warningBox}>
                Microfone liberado, mas ainda sem atividade detectada. Voce pode entrar mesmo assim ou falar por alguns segundos para testar antes de iniciar.
              </div>
            )}

            {loadingStage && (
              <div className={styles.loadingNotice} role="status" aria-live="polite">
                <div className={styles.loadingNoticeSpinner} aria-hidden="true" />
                <div>
                  <strong>{loadingStage}</strong>
                  <p>Estamos preparando a sessao da entrevista e sincronizando o contexto com a IA.</p>
                </div>
              </div>
            )}

            <div className={styles.levelBlock} data-tour-id="lobby-level">
              <p>Formato da entrevista</p>
              <div className={styles.levelButtons}>
                {([1, 2, 3] as InterviewModeLevel[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSelectedModeLevel(level)}
                    aria-pressed={selectedModeLevel === level}
                    className={`${styles.levelButton} ${selectedModeLevel === level ? styles.levelButtonActive : ''}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <p className={styles.actionHint}>{startHint}</p>

            <div className={styles.actionRow}>
              <button type="button" onClick={onBack} className={styles.backButton}>
                Voltar
              </button>
              <button
                type="button"
                onClick={handleEnter}
                disabled={loading || !stream || !hasCredits || startBlockedByProfile || !cameraReady || !microphonePermissionReady}
                data-tour-id="lobby-start"
                className={styles.startButton}
              >
                {loading ? 'Preparando...' : 'Iniciar entrevista'}
              </button>
            </div>
          </section>

          <aside className={styles.sideCard}>
            <h3>Antes de entrar</h3>
            <p className={styles.sideLead}>{profileContextLabel}</p>
            <ul className={styles.checkList}>
              {checklistItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
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
