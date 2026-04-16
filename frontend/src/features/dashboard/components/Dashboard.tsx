import React, { useEffect, useMemo, useState } from 'react';
import { BackendApi } from '../../../shared/services/backendApi';
import type {
  AgentRuntimeRecord,
  AnalysisTrace,
  CandidateProfile,
  InterviewHistoryItem,
  KnowledgeRetrievalContext,
  SessionAnalysisTraceResponse,
  SessionAnalysisTraceSnapshot,
  SessionClientRuntimeTrace,
  SessionEvidenceHighlight,
  SessionReportEvidenceTrace,
  SessionToolCallTrace,
  SessionTurnEvidenceTrace,
  User,
} from '../../../shared/types';
import styles from './Dashboard.module.css';

interface DashboardProps {
  user: User;
  candidateProfile?: CandidateProfile | null;
  onStartInterview: () => void;
  onOpenProfile: () => void;
  onOpenInterviewReport: (sessionId: string) => void;
  onDeleteInterview: (sessionId: string) => void;
}

type RuntimeEntry = AgentRuntimeRecord & {
  key: string;
  label: string;
};

const AGENT_RUNTIME_ORDER = ['candidate_agent', 'job_agent', 'match_agent', 'candidate_memory'] as const;

const AGENT_RUNTIME_LABELS: Record<string, string> = {
  candidate_agent: 'Perfil do candidato',
  job_agent: 'Leitura da vaga',
  match_agent: 'Match tecnico',
  candidate_memory: 'Memoria da jornada',
};

const AGENT_RUNTIME_SOURCE_LABELS: Record<string, string> = {
  system: 'Sistema',
  heuristic: 'Heuristica',
  ai: 'IA',
  hybrid: 'Hibrido',
};

const AGENT_RUNTIME_STATUS_LABELS: Record<string, string> = {
  completed: 'Ativo',
  fallback: 'Fallback',
  skipped: 'Pendente',
  error: 'Erro',
};

const TRACE_QUALITY_LABELS: Record<string, string> = {
  strong: 'Forte',
  good: 'Bom',
  moderate: 'Moderado',
  initial: 'Inicial',
};

const TRACE_RETRIEVAL_MODE_LABELS: Record<string, string> = {
  semantic: 'Semantico',
};

const normalizeSource = (
  value: string | null | undefined,
  fallback: AgentRuntimeRecord['source'] = 'heuristic',
): AgentRuntimeRecord['source'] => {
  if (value === 'system' || value === 'heuristic' || value === 'ai' || value === 'hybrid') {
    return value;
  }
  return fallback;
};

const normalizeStatus = (
  value: string | null | undefined,
  fallback: AgentRuntimeRecord['status'] = 'completed',
): AgentRuntimeRecord['status'] => {
  if (value === 'completed' || value === 'fallback' || value === 'skipped' || value === 'error') {
    return value;
  }
  return fallback;
};

const formatRuntimeConfidence = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'sem score';
  return `${Math.round(value * 100)}%`;
};

const formatRetrievalQuality = (value?: string | null) => {
  if (!value) return 'Sem score';
  return TRACE_QUALITY_LABELS[value] || value;
};

const formatRetrievalMode = (value?: string | null) => {
  if (!value) return 'Modo indefinido';
  return TRACE_RETRIEVAL_MODE_LABELS[value] || value;
};

const formatToolCallStatus = (value?: string | null) => {
  if (!value) return 'Sem status';
  if (value === 'ready') return 'Ativo';
  if (value === 'empty') return 'Sem dado';
  if (value === 'error') return 'Erro';
  return value;
};

const formatToolCallTransport = (value?: string | null) => {
  if (!value) return 'transporte indefinido';
  if (value === 'local') return 'local';
  if (value === 'http') return 'http';
  return value;
};

const toTurnEvidenceEntries = (
  answers?: Record<string, SessionTurnEvidenceTrace> | null,
): Array<SessionTurnEvidenceTrace & { key: string }> =>
  Object.entries(answers || {})
    .map(([key, value]) => ({ key, ...(value || {}) }))
    .sort((left, right) => {
      const leftTime = left.capturedAt ? new Date(left.capturedAt).getTime() : 0;
      const rightTime = right.capturedAt ? new Date(right.capturedAt).getTime() : 0;
      return rightTime - leftTime;
    });

const renderHighlightSummary = (highlight?: SessionEvidenceHighlight | null) => {
  if (!highlight) return '';
  if (highlight.question) return highlight.question;
  if (highlight.transcriptSnippet) return highlight.transcriptSnippet;
  return highlight.answerId || '';
};

const formatRuntimeDuration = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '';
  if (value >= 10000) return `${Math.round(value / 1000)}s`;
  return `${(value / 1000).toFixed(1)}s`;
};

const renderClientRuntimeSummary = (runtime?: SessionClientRuntimeTrace | null) => {
  if (!runtime) return '';

  const parts = [
    runtime.questionDeliveryLatencyMs != null ? `entrega ${formatRuntimeDuration(runtime.questionDeliveryLatencyMs)}` : '',
    runtime.analysisLatencyMs != null ? `analise ${formatRuntimeDuration(runtime.analysisLatencyMs)}` : '',
    runtime.transportState ? runtime.transportState : '',
    runtime.avatarState ? `avatar ${runtime.avatarState}` : '',
    runtime.coachState ? `coach ${runtime.coachState}` : '',
    runtime.progressState ? runtime.progressState : '',
  ].filter(Boolean);

  if (parts.length > 0) {
    return `Runtime do turno: ${parts.join(' | ')}`;
  }
  return runtime.headline || '';
};

const toToolCallEntries = (items?: SessionToolCallTrace[] | null): SessionToolCallTrace[] =>
  (Array.isArray(items) ? items : []).filter(
    (item): item is SessionToolCallTrace => Boolean(item && item.toolName),
  );

const runtimeBadgeTone = (label: 'ready' | 'active' | 'pending') => {
  if (label === 'ready') return styles.engineBadgeReady;
  if (label === 'active') return styles.engineBadgeActive;
  return styles.engineBadgePending;
};

const buildProfileRuntime = (
  candidateProfile?: CandidateProfile | null,
  interviews: InterviewHistoryItem[] = [],
): Record<string, AgentRuntimeRecord> => {
  const profile = candidateProfile || null;
  const resumeTrace = profile?.lastResumeAnalysisTrace || null;
  const jobTrace = profile?.lastJobAnalysisTrace || null;
  const primarySkills = profile?.primarySkills || [];
  const weakSkills = profile?.weakSkills || [];
  const hasResumeSignal = Boolean((profile?.resumeSummary || '').trim() || primarySkills.length > 0);
  const hasJobSignal = Boolean((profile?.jobDescription || '').trim());
  const hasMemory = interviews.length > 0;
  const normalizedMatchScore =
    typeof profile?.lastMatchScore === 'number' ? Math.max(0, Math.min(1, profile.lastMatchScore / 100)) : null;

  return {
    candidate_agent: {
      name: 'candidate_agent',
      status: hasResumeSignal ? 'completed' : 'skipped',
      source: normalizeSource(resumeTrace?.source, hasResumeSignal ? 'heuristic' : 'system'),
      confidence: resumeTrace?.confidence ?? (hasResumeSignal ? 0.72 : 0.24),
      promptVersion: resumeTrace?.promptVersion ?? null,
      aiProvider: resumeTrace?.aiProvider ?? null,
      aiModel: resumeTrace?.aiModel ?? null,
      evidence: [
        (profile?.resumeSummary || '').trim() ? 'profile.resumeSummary' : '',
        primarySkills.length > 0 ? 'profile.primarySkills' : '',
        resumeTrace ? 'profile.lastResumeAnalysisTrace' : '',
      ].filter(Boolean),
      summary: hasResumeSignal
        ? 'Perfil tecnico pronto para orientar perguntas e feedback.'
        : 'Falta resumo tecnico ou skills principais para personalizar a entrevista.',
    },
    job_agent: {
      name: 'job_agent',
      status: hasJobSignal ? 'completed' : 'skipped',
      source: normalizeSource(jobTrace?.source, hasJobSignal ? 'heuristic' : 'system'),
      confidence: jobTrace?.confidence ?? (hasJobSignal ? 0.68 : 0.22),
      promptVersion: jobTrace?.promptVersion ?? null,
      aiProvider: jobTrace?.aiProvider ?? null,
      aiModel: jobTrace?.aiModel ?? null,
      evidence: [
        (profile?.jobDescription || '').trim() ? 'profile.jobDescription' : '',
        profile?.targetRole ? 'profile.targetRole' : '',
        jobTrace ? 'profile.lastJobAnalysisTrace' : '',
      ].filter(Boolean),
      summary: hasJobSignal
        ? 'A vaga alvo esta pronta para refinar dificuldade, foco e cobertura.'
        : 'Defina a vaga para reduzir perguntas genericas e melhorar o match.',
    },
    match_agent: {
      name: 'match_agent',
      status: hasResumeSignal && hasJobSignal ? 'completed' : 'skipped',
      source: 'heuristic',
      confidence: normalizedMatchScore ?? (hasResumeSignal && hasJobSignal ? 0.63 : 0.28),
      evidence: [
        primarySkills.length > 0 ? 'profile.primarySkills' : '',
        weakSkills.length > 0 ? 'profile.weakSkills' : '',
        hasJobSignal ? 'profile.jobDescription' : '',
        normalizedMatchScore !== null ? 'profile.lastMatchScore' : '',
      ].filter(Boolean),
      summary:
        hasResumeSignal && hasJobSignal
          ? 'O cruzamento tecnico ja consegue priorizar gaps e cobertura.'
          : 'O match tecnico melhora quando curriculo e vaga estao preenchidos.',
    },
    candidate_memory: {
      name: 'candidate_memory',
      status: hasMemory ? 'completed' : 'skipped',
      source: 'system',
      confidence: hasMemory ? 1 : 0,
      evidence: hasMemory ? ['user.interviews'] : [],
      summary: hasMemory
        ? `${interviews.length} sessao(oes) prontas para consolidar memoria de progresso.`
        : 'Ainda sem historico para consolidar memoria de lacunas e evolucao.',
    },
  };
};

const toRuntimeEntries = (runtime?: Record<string, AgentRuntimeRecord> | null): RuntimeEntry[] =>
  AGENT_RUNTIME_ORDER.reduce<RuntimeEntry[]>((items, key) => {
    const entry = runtime?.[key];
    if (!entry) return items;
    items.push({
      key,
      label: AGENT_RUNTIME_LABELS[key] || entry.name || key,
      name: entry.name || key,
      status: normalizeStatus(entry.status, 'completed'),
      source: normalizeSource(entry.source, 'heuristic'),
      confidence: entry.confidence ?? null,
      promptVersion: entry.promptVersion ?? null,
      aiProvider: entry.aiProvider ?? null,
      aiModel: entry.aiModel ?? null,
      usedTools: entry.usedTools || [],
      evidence: entry.evidence || [],
      summary: entry.summary ?? null,
    });
    return items;
  }, []);

const summarizeRuntimeHealth = (entries: RuntimeEntry[]) => {
  if (!entries.length) {
    return {
      label: 'Pendente',
      tone: 'pending' as const,
      description: 'Ainda nao ha sinais suficientes para exibir o motor aplicado.',
    };
  }

  const blockingCount = entries.filter((entry) => entry.status === 'skipped' || entry.status === 'error').length;
  const confidenceValues = entries
    .map((entry) => entry.confidence)
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
  const avgConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0;

  if (blockingCount === 0 && avgConfidence >= 0.72) {
    return {
      label: 'Pronto',
      tone: 'ready' as const,
      description: 'Perfil, vaga e memoria estao alinhados para uma simulacao mais precisa.',
    };
  }

  if (blockingCount <= 1 && avgConfidence >= 0.45) {
    return {
      label: 'Parcial',
      tone: 'active' as const,
      description: 'O motor ja tem contexto util, mas ainda pode ganhar mais sinal.',
    };
  }

  return {
    label: 'Pendente',
    tone: 'pending' as const,
    description: 'Faltam insumos para reduzir perguntas genericas e aumentar a personalizacao.',
  };
};

const Dashboard: React.FC<DashboardProps> = ({
  user,
  candidateProfile,
  onStartInterview,
  onOpenProfile,
  onOpenInterviewReport,
  onDeleteInterview,
}) => {
  const [expandedTraceSessionId, setExpandedTraceSessionId] = useState<string | null>(null);
  const [traceLoadingSessionId, setTraceLoadingSessionId] = useState<string | null>(null);
  const [traceMenuSessionId, setTraceMenuSessionId] = useState<string | null>(null);
  const [traceErrorBySessionId, setTraceErrorBySessionId] = useState<Record<string, string>>({});
  const [traceBySessionId, setTraceBySessionId] = useState<Record<string, SessionAnalysisTraceResponse | null>>({});

  const interviews = (user.interviews || []) as InterviewHistoryItem[];
  const firstName = user.name ? user.name.split(' ')[0] : 'Candidato';
  const lastInterview = interviews[0];
  const profilePrimarySkills = (candidateProfile?.primarySkills || []).slice(0, 4);
  const resumeSummary = (candidateProfile?.resumeSummary || '').trim();
  const hasResumeSummary = Boolean(resumeSummary);
  const hasJobDescription = Boolean((candidateProfile?.jobDescription || '').trim());

  const avgScore =
    interviews.length > 0
      ? Math.round((interviews.reduce((sum, item) => sum + (item.score || 0), 0) / interviews.length) * 10) / 10
      : null;

  const interviewCountLabel =
    interviews.length === 1 ? '1 entrevista' : `${interviews.length} entrevistas`;

  const formatDate = (value?: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const locale = typeof navigator !== 'undefined' ? navigator.language : 'pt-BR';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(parsed);
  };

  const formatTraceTimestamp = (value?: string | null) => {
    if (!value) return 'Sem data';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(parsed);
  };

  const sourceLabel = (source?: string | null) => {
    if (source === 'ai') return 'IA';
    if (source === 'hybrid') return 'Hibrido';
    return 'Heuristica';
  };

  const toggleTraceMenu = (sessionId: string) => {
    setTraceMenuSessionId((current) => (current === sessionId ? null : sessionId));
  };

  const handleToggleTrace = async (sessionId: string) => {
    setTraceMenuSessionId(null);

    if (expandedTraceSessionId === sessionId) {
      setExpandedTraceSessionId(null);
      return;
    }

    setExpandedTraceSessionId(sessionId);

    if (traceBySessionId[sessionId] || traceLoadingSessionId === sessionId) return;

    setTraceLoadingSessionId(sessionId);
    setTraceErrorBySessionId((prev) => ({ ...prev, [sessionId]: '' }));
    try {
      const trace = await BackendApi.getSessionAnalysisTrace(sessionId);
      setTraceBySessionId((prev) => ({ ...prev, [sessionId]: trace }));
    } catch (e: any) {
      setTraceErrorBySessionId((prev) => ({
        ...prev,
        [sessionId]: e?.message || 'Falha ao carregar trace da sessao.',
      }));
    } finally {
      setTraceLoadingSessionId((current) => (current === sessionId ? null : current));
    }
  };

  const heroStats = [
    { label: 'Creditos', value: `${user.credits ?? 0}` },
    { label: 'Media', value: avgScore !== null ? `${avgScore}` : '--' },
    { label: 'Ultima nota', value: lastInterview?.score !== undefined ? `${lastInterview.score}` : '--' },
  ];

  const lastInterviewId = lastInterview?.id || null;

  useEffect(() => {
    if (!lastInterviewId) return;
    if (traceBySessionId[lastInterviewId] || traceErrorBySessionId[lastInterviewId]) return;

    let cancelled = false;
    setTraceLoadingSessionId(lastInterviewId);
    setTraceErrorBySessionId((prev) => ({ ...prev, [lastInterviewId]: '' }));

    void BackendApi.getSessionAnalysisTrace(lastInterviewId)
      .then((trace) => {
        if (cancelled) return;
        setTraceBySessionId((prev) => ({ ...prev, [lastInterviewId]: trace }));
      })
      .catch((e: any) => {
        if (cancelled) return;
        setTraceErrorBySessionId((prev) => ({
          ...prev,
          [lastInterviewId]: e?.message || 'Falha ao carregar trace da sessao.',
        }));
      })
      .finally(() => {
        if (cancelled) return;
        setTraceLoadingSessionId((current) => (current === lastInterviewId ? null : current));
      });

    return () => {
      cancelled = true;
    };
  }, [lastInterviewId]);

  const latestTraceSnapshot = useMemo(() => {
    if (!lastInterviewId) return null;
    const trace = traceBySessionId[lastInterviewId];
    if (!trace?.hasTrace || !trace.analysisTraceSnapshot) return null;
    return trace.analysisTraceSnapshot;
  }, [lastInterviewId, traceBySessionId]);

  const profileRuntime = useMemo(() => buildProfileRuntime(candidateProfile, interviews), [candidateProfile, interviews]);
  const snapshotRuntime = latestTraceSnapshot?.agentRuntime || null;
  const engineRuntimeEntries = useMemo(
    () => toRuntimeEntries(snapshotRuntime && Object.keys(snapshotRuntime).length > 0 ? snapshotRuntime : profileRuntime),
    [profileRuntime, snapshotRuntime],
  );
  const engineSummary = useMemo(() => summarizeRuntimeHealth(engineRuntimeEntries), [engineRuntimeEntries]);
  const engineTraceMessage = !lastInterviewId
    ? 'Sem sessoes finalizadas ainda. Exibindo o preflight do perfil atual.'
    : traceLoadingSessionId === lastInterviewId
      ? 'Carregando o ultimo trace da sessao para enriquecer o painel.'
      : traceErrorBySessionId[lastInterviewId]
        ? 'Nao foi possivel carregar o ultimo trace. Exibindo o preflight do perfil atual.'
        : latestTraceSnapshot
          ? `Snapshot capturado em ${formatTraceTimestamp(latestTraceSnapshot.capturedAt)}.`
          : 'Trace indisponivel. Exibindo o preflight do perfil atual.';
  const engineSourceLabel = latestTraceSnapshot ? 'Snapshot da ultima sessao' : 'Preflight do perfil atual';

  return (
    <div className={styles.page}>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.shell}>
        <section className={styles.hero} data-tour-id="dashboard-hero">
          <div className={styles.heroCopy}>
            <span className={styles.heroEyebrow}>Painel rapido</span>
            <h2>Bem-vindo de volta, {firstName}!</h2>
            <p>Prepare sua proxima entrevista tecnica com IA e entre mais rapido na sua proxima simulacao.</p>
          </div>

          <div className={styles.heroStats} aria-label="Resumo rapido da dashboard">
            {heroStats.map((item) => (
              <div key={item.label} className={styles.heroStat}>
                <span className={styles.heroStatLabel}>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              onClick={onStartInterview}
              data-tour-id="dashboard-start-card"
              className={`${styles.heroActionButton} ${styles.heroPrimaryAction}`}
            >
              Comecar entrevista
            </button>
            <button
              type="button"
              onClick={onOpenProfile}
              className={`${styles.heroActionButton} ${styles.heroSecondaryAction}`}
            >
              Ajustar perfil
            </button>
          </div>
        </section>

        <section className={styles.quickGrid}>
          <button
            type="button"
            onClick={onOpenProfile}
            data-tour-id="dashboard-resume-card"
            className={styles.quickCard}
          >
            <div className={styles.quickCardHeader}>
              <span className={styles.quickIcon}>CV</span>
              <span className={`${styles.quickStatus} ${hasResumeSummary ? styles.quickStatusReady : styles.quickStatusPending}`}>
                {hasResumeSummary ? 'Pronto' : 'Completar'}
              </span>
            </div>
            <h3>Curriculo</h3>
            <p>
              {hasResumeSummary
                ? 'Revise seu resumo, skills e gaps antes da proxima simulacao.'
                : 'Adicione seu resumo tecnico para entrevistas mais alinhadas.'}
            </p>
            <span className={styles.quickAction}>Abrir perfil</span>
          </button>

          <button type="button" onClick={onOpenProfile} data-tour-id="dashboard-job-card" className={styles.quickCard}>
            <div className={styles.quickCardHeader}>
              <span className={styles.quickIcon}>JD</span>
              <span className={`${styles.quickStatus} ${hasJobDescription ? styles.quickStatusReady : styles.quickStatusPending}`}>
                {hasJobDescription ? 'Pronta' : 'Definir'}
              </span>
            </div>
            <h3>Vaga alvo</h3>
            <p>
              {hasJobDescription
                ? 'Mantenha a descricao atualizada para refinar perguntas e feedback.'
                : 'Cole a vaga para cruzar requisitos com o seu perfil.'}
            </p>
            <span className={styles.quickAction}>Editar vaga</span>
          </button>
        </section>

        <section className={styles.panelGrid}>
          <article className={styles.mainPanel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Proximo passo</h3>
              <span className={styles.panelMeta}>{hasResumeSummary && hasJobDescription ? 'Pronto' : 'Revisar'}</span>
            </div>
            <p className={styles.panelLead}>
              Entre direto na simulacao quando curriculo e vaga estiverem alinhados. Se algo estiver pendente, ajuste antes.
            </p>

            <div className={styles.readinessGrid}>
              <div className={`${styles.readinessItem} ${hasResumeSummary ? styles.readinessItemReady : styles.readinessItemPending}`}>
                <span>Curriculo</span>
                <strong>{hasResumeSummary ? 'Pronto' : 'Pendente'}</strong>
              </div>
              <div className={`${styles.readinessItem} ${hasJobDescription ? styles.readinessItemReady : styles.readinessItemPending}`}>
                <span>Vaga alvo</span>
                <strong>{hasJobDescription ? 'Pronta' : 'Pendente'}</strong>
              </div>
            </div>

            <div className={styles.focusSummary}>
              <div>
                <span className={styles.focusLabel}>Foco atual</span>
                <strong>
                  {candidateProfile?.targetRole
                    ? `${candidateProfile.targetRole} - ${candidateProfile?.experienceLevel || 'nivel nao definido'}`
                    : 'Perfil ainda sem cargo alvo'}
                </strong>
              </div>
              <p>
                {profilePrimarySkills.length > 0
                  ? profilePrimarySkills.join(', ')
                  : 'Adicione suas principais tecnologias para melhorar as perguntas.'}
              </p>
            </div>

            <div className={styles.panelActions}>
              <button type="button" className={styles.panelPrimaryAction} onClick={onStartInterview}>
                Comecar entrevista
              </button>
              <button type="button" className={styles.profileReviewAction} onClick={onOpenProfile}>
                Revisar perfil
              </button>
            </div>
          </article>

          <aside className={styles.sidePanel} data-tour-id="dashboard-history-panel">
            <details className={styles.engineDetails}>
              <summary className={styles.engineDetailsSummary}>
                <span>Motor de IA</span>
                <strong>{engineSummary.label}</strong>
              </summary>

              <article className={styles.enginePanel}>
              <div className={styles.engineHeader}>
                <div className={styles.engineHeaderCopy}>
                  <span className={styles.engineEyebrow}>Applied AI Engine</span>
                  <h3 className={styles.panelTitle}>Motor de IA aplicado</h3>
                </div>
                <span className={`${styles.engineBadge} ${runtimeBadgeTone(engineSummary.tone)}`}>{engineSummary.label}</span>
              </div>

              <p className={styles.engineLead}>{engineSummary.description}</p>

              <div className={styles.engineMetaRow}>
                <span className={styles.engineMetaChip}>{engineSourceLabel}</span>
                <span className={styles.engineMetaChip}>{engineRuntimeEntries.length} bloco(s)</span>
              </div>

              <p className={styles.engineMetaCaption}>{engineTraceMessage}</p>

              <div className={styles.engineRuntimeList}>
                {engineRuntimeEntries.map((entry) => (
                  <article key={entry.key} className={styles.engineRuntimeItem}>
                    <div className={styles.engineRuntimeTop}>
                      <strong>{entry.label}</strong>
                      <span className={styles.engineRuntimeStatus}>
                        {AGENT_RUNTIME_STATUS_LABELS[entry.status] || entry.status}
                      </span>
                    </div>

                    <div className={styles.engineMetaRow}>
                      <span className={styles.engineMetaChip}>
                        {AGENT_RUNTIME_SOURCE_LABELS[entry.source] || entry.source}
                      </span>
                      <span className={styles.engineMetaChip}>Confianca {formatRuntimeConfidence(entry.confidence)}</span>
                      {(entry.aiProvider || entry.aiModel) && (
                        <span className={styles.engineMetaChip}>
                          {entry.aiProvider || 'IA'}
                          {entry.aiModel ? ` / ${entry.aiModel}` : ''}
                        </span>
                      )}
                    </div>

                    {entry.summary && <p className={styles.engineRuntimeSummary}>{entry.summary}</p>}

                    {entry.evidence && entry.evidence.length > 0 && (
                      <p className={styles.engineEvidence}>Base: {entry.evidence.join(' • ')}</p>
                    )}
                  </article>
                ))}
              </div>
              </article>
            </details>

            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Atividade recente</h3>
              <span className={styles.panelMeta}>{interviewCountLabel}</span>
            </div>

            {interviews.length === 0 && (
              <div className={styles.emptyState}>
                <p className={styles.emptyText}>Nenhuma entrevista registrada. Comece por uma simulacao guiada.</p>
                <button type="button" onClick={onStartInterview} className={styles.emptyStateAction}>
                  Iniciar agora
                </button>
              </div>
            )}

            {interviews.slice(0, 3).map((item) => {
              const isMenuOpen = traceMenuSessionId === item.id;
              const isTraceOpen = expandedTraceSessionId === item.id;

              return (
                <div key={item.id} className={styles.activityItem}>
                  <div className={styles.activityTop}>
                    <div className={styles.activityCopy}>
                      <p className={styles.activityRole}>{item.role}</p>
                      <p className={styles.activityDate}>{formatDate(item.date)}</p>
                    </div>
                    <span className={styles.scoreBadge}>{item.score}</span>
                  </div>

                  <div className={styles.activityPrimaryActions}>
                    <button type="button" className={styles.activityPrimaryButton} onClick={() => onOpenInterviewReport(item.id)}>
                      Ver relatorio
                    </button>
                    <button
                      type="button"
                      className={styles.activityMoreButton}
                      aria-expanded={isMenuOpen}
                      aria-label={`Mais acoes da entrevista de ${formatDate(item.date)}`}
                      onClick={() => toggleTraceMenu(item.id)}
                    >
                      {isMenuOpen ? 'x' : '+'}
                    </button>
                  </div>

                  {isMenuOpen && (
                    <div className={styles.activityOverflowActions}>
                      <button type="button" onClick={() => void handleToggleTrace(item.id)}>
                        {isTraceOpen ? 'Ocultar trace' : 'Ver trace'}
                      </button>
                      <button
                        type="button"
                        className={styles.activityDangerAction}
                        onClick={() => onDeleteInterview(item.id)}
                      >
                        Excluir entrevista
                      </button>
                    </div>
                  )}

                  {isTraceOpen && (
                    <div className={styles.traceBox}>
                      {traceLoadingSessionId === item.id && <p>Carregando trace da sessao...</p>}

                      {!traceLoadingSessionId && traceErrorBySessionId[item.id] && (
                        <p className={styles.traceError}>{traceErrorBySessionId[item.id]}</p>
                      )}

                      {!traceLoadingSessionId && !traceErrorBySessionId[item.id] && (() => {
                        const trace = traceBySessionId[item.id];
                        if (!trace || !trace.hasTrace || !trace.analysisTraceSnapshot) {
                          return <p>Sessao sem snapshot de trace.</p>;
                        }

                        const snapshot = trace.analysisTraceSnapshot as SessionAnalysisTraceSnapshot;
                        const resumeTrace = snapshot?.lastResumeAnalysisTrace as AnalysisTrace | null | undefined;
                        const jobTrace = snapshot?.lastJobAnalysisTrace as AnalysisTrace | null | undefined;
                        const runtimeEntries = toRuntimeEntries(snapshot?.agentRuntime || null);
                        const knowledgeRetrieval = snapshot?.knowledgeRetrieval as KnowledgeRetrievalContext | null | undefined;
                        const contextToolCalls = toToolCallEntries(snapshot?.contextToolCalls);
                        const turnEvidenceEntries = toTurnEvidenceEntries(snapshot?.turnEvidenceTimeline?.answers);
                        const reportEvidence = snapshot?.reportEvidence as SessionReportEvidenceTrace | null | undefined;
                        const capturedAt = formatTraceTimestamp(snapshot?.capturedAt);

                        return (
                          <div className={styles.traceData}>
                            <p>
                              <strong>Capturado em:</strong> {capturedAt}
                            </p>
                            {resumeTrace && (
                              <p>
                                <strong>Resume:</strong> {sourceLabel(resumeTrace.source)}{' '}
                                {resumeTrace.aiProvider
                                  ? `(${resumeTrace.aiProvider}${resumeTrace.aiModel ? ` / ${resumeTrace.aiModel}` : ''})`
                                  : ''}
                              </p>
                            )}
                            {jobTrace && (
                              <p>
                                <strong>Job:</strong> {sourceLabel(jobTrace.source)}{' '}
                                {jobTrace.aiProvider
                                  ? `(${jobTrace.aiProvider}${jobTrace.aiModel ? ` / ${jobTrace.aiModel}` : ''})`
                                  : ''}
                              </p>
                            )}
                            {runtimeEntries.length > 0 && (
                              <div className={styles.traceRuntimeList}>
                                {runtimeEntries.map((entry) => (
                                  <p key={entry.key}>
                                    <strong>{entry.label}:</strong> {AGENT_RUNTIME_STATUS_LABELS[entry.status] || entry.status}
                                    {' • '}
                                    {AGENT_RUNTIME_SOURCE_LABELS[entry.source] || entry.source}
                                    {' • '}
                                    {formatRuntimeConfidence(entry.confidence)}
                                  </p>
                                ))}
                              </div>
                            )}
                            {knowledgeRetrieval && (
                              <section className={styles.traceSection}>
                                <p className={styles.traceSectionTitle}>Retrieval inicial</p>
                                <p>{knowledgeRetrieval.summary || 'Contexto inicial recuperado para abrir a sessao.'}</p>
                                <div className={styles.engineMetaRow}>
                                  <span className={styles.engineMetaChip}>
                                    {formatRetrievalQuality(knowledgeRetrieval.quality)}
                                  </span>
                                  <span className={styles.engineMetaChip}>
                                    {formatRetrievalMode(knowledgeRetrieval.retrievalMode)}
                                  </span>
                                  {knowledgeRetrieval.indexStats?.chunks ? (
                                    <span className={styles.engineMetaChip}>
                                      {knowledgeRetrieval.indexStats.chunks} chunk(s)
                                    </span>
                                  ) : null}
                                </div>
                                {!!knowledgeRetrieval.sources?.length && (
                                  <div className={styles.traceEvidenceList}>
                                    {knowledgeRetrieval.sources.slice(0, 3).map((source) => (
                                      <article key={source.id} className={styles.traceEvidenceItem}>
                                        <p className={styles.traceEvidenceQuestion}>{source.title}</p>
                                        <p className={styles.traceEvidenceCopy}>{source.snippet}</p>
                                        <p className={styles.traceEvidenceMeta}>
                                          {source.sourceType} • {Math.round((source.score || 0) * 100)}%
                                        </p>
                                      </article>
                                    ))}
                                  </div>
                                )}
                              </section>
                            )}
                            {contextToolCalls.length > 0 && (
                              <section className={styles.traceSection}>
                                <p className={styles.traceSectionTitle}>Tools do contexto inicial</p>
                                <div className={styles.traceEvidenceList}>
                                  {contextToolCalls.map((call, index) => (
                                    <article
                                      key={`${call.toolName || 'tool'}-${call.calledAt || index}`}
                                      className={styles.traceEvidenceItem}
                                    >
                                      <p className={styles.traceEvidenceQuestion}>{call.toolName}</p>
                                      <div className={styles.engineMetaRow}>
                                        <span className={styles.engineMetaChip}>{formatToolCallStatus(call.status)}</span>
                                        <span className={styles.engineMetaChip}>{formatToolCallTransport(call.transport)}</span>
                                        {call.contractVersion ? (
                                          <span className={styles.engineMetaChip}>{call.contractVersion}</span>
                                        ) : null}
                                      </div>
                                      {call.summary ? (
                                        <p className={styles.traceEvidenceCopy}>{call.summary}</p>
                                      ) : null}
                                    </article>
                                  ))}
                                </div>
                              </section>
                            )}
                            {turnEvidenceEntries.length > 0 && (
                              <section className={styles.traceSection}>
                                <p className={styles.traceSectionTitle}>Timeline de evidencias</p>
                                <div className={styles.traceEvidenceList}>
                                  {turnEvidenceEntries.slice(0, 3).map((entry) => (
                                    <article key={entry.key} className={styles.traceEvidenceItem}>
                                      <p className={styles.traceEvidenceQuestion}>
                                        {entry.question || `Resposta ${entry.answerId}`}
                                      </p>
                                      {entry.transcriptSnippet ? (
                                        <p className={styles.traceEvidenceCopy}>{entry.transcriptSnippet}</p>
                                      ) : null}
                                      <div className={styles.engineMetaRow}>
                                        <span className={styles.engineMetaChip}>
                                          {formatTraceTimestamp(entry.capturedAt)}
                                        </span>
                                        <span className={styles.engineMetaChip}>
                                          {formatRetrievalMode(entry.nextQuestionContext?.retrievalMode)}
                                        </span>
                                        <span className={styles.engineMetaChip}>
                                          {formatRetrievalQuality(entry.nextQuestionContext?.quality)}
                                        </span>
                                      </div>
                                      {(entry.improvements?.length || entry.strengths?.length) && (
                                        <p className={styles.traceEvidenceMeta}>
                                          {entry.improvements?.length
                                            ? `Melhorar: ${entry.improvements.join(', ')}`
                                            : ''}
                                          {entry.improvements?.length && entry.strengths?.length ? ' • ' : ''}
                                          {entry.strengths?.length ? `Forcas: ${entry.strengths.join(', ')}` : ''}
                                        </p>
                                      )}
                                      {entry.clientRuntime ? (
                                        <p className={styles.traceEvidenceMeta}>
                                          {renderClientRuntimeSummary(entry.clientRuntime)}
                                        </p>
                                      ) : null}
                                      {!!entry.nextQuestionContext?.sources?.length && (
                                        <p className={styles.traceEvidenceMeta}>
                                          Proxima pergunta guiada por:{' '}
                                          {entry.nextQuestionContext.sources
                                            .map((source) => source.title)
                                            .filter(Boolean)
                                            .join(', ')}
                                        </p>
                                      )}
                                      {!!entry.nextQuestionContext?.toolCalls?.length && (
                                        <p className={styles.traceEvidenceMeta}>
                                          Tools acionadas:{' '}
                                          {entry.nextQuestionContext.toolCalls
                                            .map((call) => {
                                              const parts = [
                                                call.toolName,
                                                formatToolCallTransport(call.transport),
                                                formatToolCallStatus(call.status),
                                              ].filter(Boolean);
                                              return parts.join(' / ');
                                            })
                                            .join(', ')}
                                        </p>
                                      )}
                                    </article>
                                  ))}
                                </div>
                              </section>
                            )}
                            {reportEvidence && (
                              <section className={styles.traceSection}>
                                <p className={styles.traceSectionTitle}>Contexto do relatorio final</p>
                                <div className={styles.engineMetaRow}>
                                  <span className={styles.engineMetaChip}>
                                    {formatRetrievalMode(reportEvidence.retrievalMode)}
                                  </span>
                                  <span className={styles.engineMetaChip}>
                                    {formatRetrievalQuality(reportEvidence.quality)}
                                  </span>
                                  {reportEvidence.capturedAt ? (
                                    <span className={styles.engineMetaChip}>
                                      {formatTraceTimestamp(reportEvidence.capturedAt)}
                                    </span>
                                  ) : null}
                                </div>
                                {!!reportEvidence.sources?.length && (
                                  <p className={styles.traceEvidenceMeta}>
                                    Fontes principais: {reportEvidence.sources.map((source) => source.title).filter(Boolean).join(', ')}
                                  </p>
                                )}
                                {!!reportEvidence.episodeHighlights?.length && (
                                  <p className={styles.traceEvidenceMeta}>
                                    Evidencias usadas: {reportEvidence.episodeHighlights.map((item) => renderHighlightSummary(item)).filter(Boolean).join(' • ')}
                                  </p>
                                )}
                                {!!reportEvidence.episodeHighlights?.length &&
                                reportEvidence.episodeHighlights.some((item) => Boolean(renderClientRuntimeSummary(item.clientRuntime))) ? (
                                  <p className={styles.traceEvidenceMeta}>
                                    Runtime observado:{' '}
                                    {reportEvidence.episodeHighlights
                                      .map((item) => renderClientRuntimeSummary(item.clientRuntime))
                                      .filter(Boolean)
                                      .join(' | ')}
                                  </p>
                                ) : null}
                                {!!reportEvidence.toolCalls?.length && (
                                  <p className={styles.traceEvidenceMeta}>
                                    Tools acionadas:{' '}
                                    {reportEvidence.toolCalls
                                      .map((call) => {
                                        const parts = [
                                          call.toolName,
                                          formatToolCallTransport(call.transport),
                                          formatToolCallStatus(call.status),
                                        ].filter(Boolean);
                                        return parts.join(' / ');
                                      })
                                      .join(', ')}
                                  </p>
                                )}
                              </section>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </aside>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
