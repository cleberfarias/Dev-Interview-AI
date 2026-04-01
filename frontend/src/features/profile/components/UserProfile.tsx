import React, { useEffect, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { BackendApi } from '../../../shared/services/backendApi';
import type {
  AnalysisTrace,
  CandidateProfile,
  InterviewConfig,
  KnowledgeRetrievalContext,
  MCPToolDebuggerItem,
  MCPToolDebuggerResponse,
  SessionAnalysisTraceResponse,
  SessionAnalysisTraceSnapshot,
  SessionClientRuntimeTrace,
  SessionEvidenceHighlight,
  SessionReportEvidenceTrace,
  SessionToolCallTrace,
  SessionTurnEvidenceTrace,
  User,
} from '../../../shared/types';
import CandidateProfilePanel from './CandidateProfilePanel';
import { LiveCoachPreviewCard } from '../../live-coach';
import styles from './UserProfile.module.css';

interface Props {
  user: User;
  config: InterviewConfig;
  onBack: () => void;
  onOpenTour?: () => void;
  onLogout: () => void;
  onAddCredits: (amount: number) => void;
  onOpenInterviewReport: (sessionId: string) => void;
  onDeleteInterview: (sessionId: string) => void;
  onUserUpdated?: (user: User) => void;
  onCandidateProfileUpdated?: (profile: CandidateProfile) => void;
}

const HISTORY_PAGE_SIZE = 5;
const TRACE_QUALITY_LABELS: Record<string, string> = {
  strong: 'Forte',
  good: 'Bom',
  moderate: 'Moderado',
  initial: 'Inicial',
};

const TRACE_RETRIEVAL_MODE_LABELS: Record<string, string> = {
  semantic: 'Semantico',
};

const DEBUGGER_STATUS_LABELS: Record<string, string> = {
  ready: 'Ativo',
  empty: 'Sem dado',
  pending: 'Pendente',
  error: 'Erro',
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

const toStringList = (value: unknown, limit = 5): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit);
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const debuggerStatusLabel = (value?: string | null) => {
  if (!value) return 'Indefinido';
  return DEBUGGER_STATUS_LABELS[value] || value;
};

const formatTraceTimestampValue = (value?: string | null) => {
  if (!value) return 'Sem data';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
};

const renderDebuggerDetails = (item: MCPToolDebuggerItem) => {
  const data = toRecord(item.data);
  if (!data) return null;

  if (item.name === 'get_candidate_memory') {
    const memory = toRecord(data.memory);
    if (!memory) return null;
    const strongSkills = toStringList(memory.strongSkills);
    const gaps = toStringList(memory.recurringGaps);
    return (
      <div className={styles.debuggerDetailList}>
        {strongSkills.length > 0 && <p><strong>Skills fortes:</strong> {strongSkills.join(', ')}</p>}
        {gaps.length > 0 && <p><strong>Gaps recorrentes:</strong> {gaps.join(', ')}</p>}
      </div>
    );
  }

  if (item.name === 'get_resume_analysis') {
    const analysis = toRecord(data.analysis);
    if (!analysis) return null;
    const technologies = toStringList(analysis.technologies);
    const match = toRecord(analysis.match);
    const missingSkills = toStringList(match?.missingSkills);
    return (
      <div className={styles.debuggerDetailList}>
        {analysis.experienceLevel && <p><strong>Nivel:</strong> {String(analysis.experienceLevel)}</p>}
        {technologies.length > 0 && <p><strong>Tecnologias:</strong> {technologies.join(', ')}</p>}
        {missingSkills.length > 0 && <p><strong>Skills faltantes:</strong> {missingSkills.join(', ')}</p>}
      </div>
    );
  }

  if (item.name === 'get_job_analysis') {
    const analysis = toRecord(data.analysis);
    if (!analysis) return null;
    const requiredSkills = toStringList(analysis.requiredSkills);
    const interviewFocus = toStringList(analysis.interviewFocus);
    return (
      <div className={styles.debuggerDetailList}>
        {analysis.roleTitleGuess && <p><strong>Role:</strong> {String(analysis.roleTitleGuess)}</p>}
        {requiredSkills.length > 0 && <p><strong>Required skills:</strong> {requiredSkills.join(', ')}</p>}
        {interviewFocus.length > 0 && <p><strong>Foco tecnico:</strong> {interviewFocus.join(', ')}</p>}
      </div>
    );
  }

  if (item.name === 'get_session_trace') {
    const snapshot = toRecord(data.analysisTraceSnapshot);
    const workflowSummary = toRecord(data.workflowSummary);
    const turnEvidenceTimeline = toRecord(snapshot?.turnEvidenceTimeline);
    const answers = toRecord(turnEvidenceTimeline?.answers);
    const answerCount = answers ? Object.keys(answers).length : 0;
    const stages = Array.isArray(workflowSummary?.stages)
      ? workflowSummary.stages.filter((stage): stage is Record<string, unknown> => Boolean(stage && typeof stage === 'object'))
      : [];
    const lastRuntime = toRecord(workflowSummary?.lastRuntime);
    return (
      <div className={styles.debuggerDetailList}>
        {data.sessionId && <p><strong>Sessao:</strong> {String(data.sessionId)}</p>}
        {snapshot?.capturedAt && <p><strong>Capturado em:</strong> {formatTraceTimestampValue(String(snapshot.capturedAt))}</p>}
        {workflowSummary?.currentStageLabel && <p><strong>Etapa atual:</strong> {String(workflowSummary.currentStageLabel)}</p>}
        <p><strong>Evidencias gravadas:</strong> {answerCount}</p>
        {(workflowSummary?.retrievalMode || workflowSummary?.retrievalQuality) && (
          <p>
            <strong>Retrieval:</strong> {formatRetrievalMode(String(workflowSummary?.retrievalMode || ''))}
            {workflowSummary?.retrievalQuality ? ` • ${formatRetrievalQuality(String(workflowSummary.retrievalQuality))}` : ''}
          </p>
        )}
        {lastRuntime && (
          <p><strong>Runtime recente:</strong> {renderClientRuntimeSummary(lastRuntime as SessionClientRuntimeTrace)}</p>
        )}
        {stages.length > 0 && (
          <div className={styles.traceMetaRow}>
            {stages.map((stage, index) => (
              <span key={`${String(stage.key || stage.label || 'stage')}-${index}`} className={styles.traceMetaChip}>
                {String(stage.label || 'Etapa')}: {debuggerStatusLabel(String(stage.status || ''))}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item.name === 'search_rubric_knowledge') {
    const focus = toStringList(data.focus);
    const goodSignals = toStringList(data.goodSignals);
    const redFlags = toStringList(data.redFlags);
    return (
      <div className={styles.debuggerDetailList}>
        {focus.length > 0 && <p><strong>Foco:</strong> {focus.join(', ')}</p>}
        {goodSignals.length > 0 && <p><strong>Bons sinais:</strong> {goodSignals.join(', ')}</p>}
        {redFlags.length > 0 && <p><strong>Red flags:</strong> {redFlags.join(', ')}</p>}
      </div>
    );
  }

  return null;
};

const UserProfile: React.FC<Props> = ({
  user,
  config,
  onBack,
  onOpenTour,
  onLogout,
  onAddCredits: _onAddCredits,
  onOpenInterviewReport,
  onDeleteInterview,
  onUserUpdated,
  onCandidateProfileUpdated,
}) => {
  const [buying, setBuying] = useState(false);
  const [expandedTraceSessionId, setExpandedTraceSessionId] = useState<string | null>(null);
  const [expandedHistoryMenuSessionId, setExpandedHistoryMenuSessionId] = useState<string | null>(null);
  const [traceLoadingSessionId, setTraceLoadingSessionId] = useState<string | null>(null);
  const [traceErrorBySessionId, setTraceErrorBySessionId] = useState<Record<string, string>>({});
  const [traceBySessionId, setTraceBySessionId] = useState<Record<string, SessionAnalysisTraceResponse | null>>({});
  const [toolDebugger, setToolDebugger] = useState<MCPToolDebuggerResponse | null>(null);
  const [toolDebuggerLoading, setToolDebuggerLoading] = useState(false);
  const [toolDebuggerError, setToolDebuggerError] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.name || '');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_PAGE_SIZE);

  const checkoutLinks = {
    pack3: 'https://pay.kiwify.com.br/pe3fE5y',
    pack10: 'https://pay.kiwify.com.br/FztuPgO',
    pack100: 'https://pay.kiwify.com.br/MPMmAmL',
  };

  const averageScore =
    user.interviews.length > 0
      ? (user.interviews.reduce((acc, curr) => acc + curr.score, 0) / user.interviews.length).toFixed(1)
      : '0';

  const stats = [
    { label: 'Sessoes', value: user.interviews.length },
    { label: 'Creditos', value: user.credits },
    { label: 'Media AI', value: averageScore },
  ];

  const firstName = user.name ? user.name.split(' ')[0] : 'Candidato';
  const latestSessionId = user.interviews[0]?.id || null;
  const debuggerStackKey = config.stacks.join('|');

  useEffect(() => {
    if (!isEditingName) {
      setNameDraft(user.name || '');
    }
  }, [isEditingName, user.name]);

  useEffect(() => {
    setVisibleHistoryCount((current) => {
      if (user.interviews.length === 0) return HISTORY_PAGE_SIZE;
      return Math.min(Math.max(current, HISTORY_PAGE_SIZE), user.interviews.length);
    });
  }, [user.interviews.length]);

  useEffect(() => {
    let cancelled = false;
    setToolDebuggerLoading(true);
    setToolDebuggerError('');

    void BackendApi.getMcpToolDebugger({
      sessionId: latestSessionId,
      track: config.track,
      seniority: config.seniority,
      stacks: config.stacks,
    })
      .then((response) => {
        if (cancelled) return;
        setToolDebugger(response);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setToolDebuggerError(error?.message || 'Falha ao carregar o debugger MCP.');
      })
      .finally(() => {
        if (cancelled) return;
        setToolDebuggerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config.seniority, config.track, debuggerStackKey, latestSessionId]);

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

  const handleRecharge = async (amount: number) => {
    try {
      setBuying(true);
      const url =
        amount === 3 ? checkoutLinks.pack3 :
        amount === 10 ? checkoutLinks.pack10 :
        checkoutLinks.pack100;
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setBuying(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    setExpandedHistoryMenuSessionId(null);
    const ok = window.confirm('Deseja excluir esta entrevista?');
    if (!ok) return;
    await onDeleteInterview(sessionId);
  };

  const handleStartNameEdit = () => {
    setNameDraft(user.name || '');
    setNameError('');
    setIsEditingName(true);
  };

  const handleCancelNameEdit = () => {
    setNameDraft(user.name || '');
    setNameError('');
    setIsEditingName(false);
  };

  const handleSaveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = nameDraft.replace(/\s+/g, ' ').trim();
    if (nextName.length < 2) {
      setNameError('Digite um nome com pelo menos 2 caracteres.');
      return;
    }
    if (nextName === user.name) {
      handleCancelNameEdit();
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setNameError('Sua sessao expirou. Faca login novamente.');
      return;
    }

    setSavingName(true);
    setNameError('');
    try {
      await updateProfile(currentUser, { displayName: nextName });
      let refreshedToken: string | null = null;
      try {
        refreshedToken = await currentUser.getIdToken(true);
      } catch (tokenError) {
        console.warn('Nao foi possivel atualizar o token apos editar o nome.', tokenError);
      }
      const updatedProfile = await BackendApi.updateMeName(nextName, refreshedToken);
      onUserUpdated?.(updatedProfile);
      setNameDraft(updatedProfile.name);
      setIsEditingName(false);
    } catch (e: any) {
      setNameError(e?.message || 'Nao foi possivel atualizar o nome.');
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleTrace = async (sessionId: string) => {
    setExpandedHistoryMenuSessionId(null);
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

  const visibleInterviews = user.interviews.slice(0, visibleHistoryCount);
  const hasMoreHistory = visibleHistoryCount < user.interviews.length;

  return (
    <div className={styles.page}>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.topBar}>
          <div className={styles.topBarCopy}>
            <span className={styles.pageEyebrow}>Conta e preparo</span>
            <h1 className={styles.pageTitle}>Perfil do candidato</h1>
            <p className={styles.pageIntro}>
              Revise seu nome, seu foco de vaga e os sinais que orientam a IA antes da proxima simulacao.
            </p>
          </div>

          <div className={styles.topBarActions}>
            {onOpenTour && (
              <button type="button" onClick={onOpenTour} className={styles.backTopButton}>
                Tour
              </button>
            )}
            <button type="button" onClick={onBack} className={styles.backTopButton}>
              Voltar
            </button>
          </div>
        </header>

        <section className={styles.heroCard}>
          <div className={styles.heroUser}>
            <div className={styles.avatarWrap}>
              {user.avatar ? <img src={user.avatar} alt="Avatar" /> : <span>{firstName.charAt(0)}</span>}
            </div>
            <div className={styles.heroIdentity}>
              <span className={styles.heroEyebrow}>Conta ativa</span>
              {isEditingName ? (
                <form className={styles.nameForm} onSubmit={handleSaveName}>
                  <label htmlFor="profile-name" className={styles.nameLabel}>
                    Nome que aparece na entrevista
                  </label>
                  <div className={styles.nameFormRow}>
                    <input
                      id="profile-name"
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      className={styles.nameInput}
                      placeholder="Digite seu nome"
                      autoComplete="name"
                      disabled={savingName}
                    />
                    <button type="submit" className={styles.namePrimaryButton} disabled={savingName}>
                      {savingName ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button type="button" className={styles.nameSecondaryButton} onClick={handleCancelNameEdit} disabled={savingName}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.nameDisplayRow}>
                  <h2>{user.name}</h2>
                  <button type="button" className={styles.inlineAction} onClick={handleStartNameEdit}>
                    Editar nome
                  </button>
                </div>
              )}
              <p>{user.email}</p>
              <span className={styles.nameHint}>Esse nome aparece para a entrevistadora e no dashboard.</span>
              {nameError && <span className={styles.nameError} role="alert">{nameError}</span>}
            </div>
          </div>

          <div className={styles.statsGrid}>
            {stats.map((item) => (
              <div key={item.label} className={styles.statCard}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.contentGrid}>
          <div className={styles.leftColumn}>
            <div className={styles.neonBlock} data-tour-id="profile-candidate-panel">
              <CandidateProfilePanel
                initialJobDescription={config.jobDescription || ''}
                onProfileUpdated={onCandidateProfileUpdated}
              />
            </div>

            <div className={styles.neonBlock}>
              <LiveCoachPreviewCard />
            </div>
          </div>

          <div className={styles.rightColumn}>
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelEyebrow}>MCP</span>
                  <h3>Debugger de tools</h3>
                </div>
                <span className={styles.panelMeta}>
                  {toolDebugger?.tools?.length || 0} tools
                </span>
              </div>

              <div className={styles.debuggerToolbar}>
                <p className={styles.note}>
                  Visualiza as tools reais do MCP usadas para memoria, analise e rubrica aplicada.
                </p>
                <button
                  type="button"
                  className={styles.debuggerRefreshButton}
                  onClick={() => {
                    setToolDebugger(null);
                    setToolDebuggerError('');
                    setToolDebuggerLoading(true);
                    void BackendApi.getMcpToolDebugger({
                      sessionId: latestSessionId,
                      track: config.track,
                      seniority: config.seniority,
                      stacks: config.stacks,
                    })
                      .then((response) => setToolDebugger(response))
                      .catch((error: any) => setToolDebuggerError(error?.message || 'Falha ao atualizar o debugger MCP.'))
                      .finally(() => setToolDebuggerLoading(false));
                  }}
                >
                  Atualizar
                </button>
              </div>

              {toolDebuggerLoading && !toolDebugger && <p className={styles.emptyText}>Carregando debugger MCP...</p>}
              {!toolDebuggerLoading && toolDebuggerError && <p className={styles.traceError}>{toolDebuggerError}</p>}

              {toolDebugger && (
                <div className={styles.debuggerToolList}>
                  {toolDebugger.tools.map((item) => (
                    <article key={item.name} className={styles.debuggerToolCard}>
                      <div className={styles.debuggerToolHeader}>
                        <strong>{item.label}</strong>
                        <span className={styles.debuggerStatusBadge}>{debuggerStatusLabel(item.status)}</span>
                      </div>
                      <div className={styles.traceMetaRow}>
                        {item.contractVersion && (
                          <span className={styles.traceMetaChip}>{item.contractVersion}</span>
                        )}
                        {item.data && toRecord(item.data)?.toolName && (
                          <span className={styles.traceMetaChip}>{String(toRecord(item.data)?.toolName)}</span>
                        )}
                      </div>
                      {item.summary && <p className={styles.debuggerSummary}>{item.summary}</p>}
                      {renderDebuggerDetails(item)}
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelEyebrow}>Historico</span>
                  <h3>Ultimas sessoes</h3>
                </div>
                <span className={styles.panelMeta}>{user.interviews.length} entrevistas</span>
              </div>

              {user.interviews.length === 0 && (
                <p className={styles.emptyText}>Nenhuma entrevista realizada ainda.</p>
              )}

              {visibleInterviews.map((item) => (
                <div key={item.id} className={styles.historyItem}>
                  <div className={styles.historyTop}>
                    <div>
                      <p className={styles.historyRole}>{item.role}</p>
                      <p className={styles.historyMeta}>
                        {formatDate(item.date)} | {item.track} | {item.style}
                      </p>
                    </div>
                    <span className={styles.scoreBadge}>{item.score}</span>
                  </div>

                  <div className={styles.historyActions}>
                    <button
                      type="button"
                      className={styles.historyPrimaryAction}
                      onClick={() => {
                        setExpandedHistoryMenuSessionId(null);
                        onOpenInterviewReport(item.id);
                      }}
                    >
                      Ver relatorio
                    </button>
                    <button
                      type="button"
                      className={styles.historyMoreButton}
                      aria-expanded={expandedHistoryMenuSessionId === item.id}
                      aria-label={`Mais acoes da entrevista de ${formatDate(item.date)}`}
                      onClick={() =>
                        setExpandedHistoryMenuSessionId((current) => (current === item.id ? null : item.id))
                      }
                    >
                      +
                    </button>
                  </div>

                  {expandedHistoryMenuSessionId === item.id && (
                    <div className={styles.historyOverflowMenu}>
                      <button
                        type="button"
                        onClick={() => {
                          void handleToggleTrace(item.id);
                        }}
                      >
                        {expandedTraceSessionId === item.id ? 'Ocultar trace' : 'Ver trace'}
                      </button>
                      <button type="button" onClick={() => handleDelete(item.id)}>
                        Excluir entrevista
                      </button>
                    </div>
                  )}

                  {expandedTraceSessionId === item.id && (
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
                        const knowledgeRetrieval = snapshot?.knowledgeRetrieval as KnowledgeRetrievalContext | null | undefined;
                        const contextToolCalls = toToolCallEntries(snapshot?.contextToolCalls);
                        const turnEvidenceEntries = toTurnEvidenceEntries(snapshot?.turnEvidenceTimeline?.answers);
                        const reportEvidence = snapshot?.reportEvidence as SessionReportEvidenceTrace | null | undefined;
                        return (
                          <div className={styles.traceData}>
                            <p>
                              <strong>Capturado em:</strong> {formatTraceTimestamp(snapshot?.capturedAt)}
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
                            {knowledgeRetrieval && (
                              <section className={styles.traceSection}>
                                <p className={styles.traceSectionTitle}>Retrieval inicial</p>
                                <p>{knowledgeRetrieval.summary || 'Contexto inicial recuperado para abrir a sessao.'}</p>
                                <div className={styles.traceMetaRow}>
                                  <span className={styles.traceMetaChip}>
                                    {formatRetrievalQuality(knowledgeRetrieval.quality)}
                                  </span>
                                  <span className={styles.traceMetaChip}>
                                    {formatRetrievalMode(knowledgeRetrieval.retrievalMode)}
                                  </span>
                                  {knowledgeRetrieval.indexStats?.chunks ? (
                                    <span className={styles.traceMetaChip}>
                                      {knowledgeRetrieval.indexStats.chunks} chunk(s)
                                    </span>
                                  ) : null}
                                </div>
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
                                      <div className={styles.traceMetaRow}>
                                        <span className={styles.traceMetaChip}>{formatToolCallStatus(call.status)}</span>
                                        <span className={styles.traceMetaChip}>{formatToolCallTransport(call.transport)}</span>
                                        {call.contractVersion ? (
                                          <span className={styles.traceMetaChip}>{call.contractVersion}</span>
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
                                      <div className={styles.traceMetaRow}>
                                        <span className={styles.traceMetaChip}>
                                          {formatTraceTimestamp(entry.capturedAt)}
                                        </span>
                                        <span className={styles.traceMetaChip}>
                                          {formatRetrievalMode(entry.nextQuestionContext?.retrievalMode)}
                                        </span>
                                        <span className={styles.traceMetaChip}>
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
                                <div className={styles.traceMetaRow}>
                                  <span className={styles.traceMetaChip}>
                                    {formatRetrievalMode(reportEvidence.retrievalMode)}
                                  </span>
                                  <span className={styles.traceMetaChip}>
                                    {formatRetrievalQuality(reportEvidence.quality)}
                                  </span>
                                  {reportEvidence.capturedAt ? (
                                    <span className={styles.traceMetaChip}>
                                      {formatTraceTimestamp(reportEvidence.capturedAt)}
                                    </span>
                                  ) : null}
                                </div>
                                {!!reportEvidence.sources?.length && (
                                  <p className={styles.traceEvidenceMeta}>
                                    Fontes principais:{' '}
                                    {reportEvidence.sources.map((source) => source.title).filter(Boolean).join(', ')}
                                  </p>
                                )}
                                {!!reportEvidence.episodeHighlights?.length && (
                                  <p className={styles.traceEvidenceMeta}>
                                    Evidencias usadas:{' '}
                                    {reportEvidence.episodeHighlights
                                      .map((highlight) => renderHighlightSummary(highlight))
                                      .filter(Boolean)
                                      .join(' • ')}
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
              ))}

              {hasMoreHistory && (
                <button
                  type="button"
                  className={styles.loadMoreButton}
                  onClick={() => setVisibleHistoryCount((current) => current + HISTORY_PAGE_SIZE)}
                >
                  Carregar mais entrevistas
                </button>
              )}
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelEyebrow}>Conta</span>
                  <h3>Recarregar creditos</h3>
                </div>
                <span className={styles.panelMeta}>{user.credits} disponiveis</span>
              </div>

              <button
                type="button"
                onClick={() => handleRecharge(100)}
                disabled={buying}
                className={styles.packPrimary}
              >
                <div>
                  <strong>Pack 100 Creditos</strong>
                  <span>Ate 1000 entrevistas por mes</span>
                </div>
                <em>R$ 100,00</em>
              </button>

              <div className={styles.packGrid}>
                <button type="button" onClick={() => handleRecharge(3)} disabled={buying} className={styles.packSecondary}>
                  <strong>3 creditos</strong>
                  <span>R$ 20,00</span>
                </button>
                <button type="button" onClick={() => handleRecharge(10)} disabled={buying} className={styles.packSecondary}>
                  <strong>10 creditos</strong>
                  <span>R$ 40,00</span>
                </button>
              </div>

              <p className={styles.note}>Pagamento via checkout seguro da Kiwify (cartao, pix e boleto).</p>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelEyebrow}>Conta</span>
                  <h3>Configuracoes</h3>
                </div>
              </div>
              <button type="button" className={styles.settingButton}>
                Configuracoes de audio e video
              </button>
              <button type="button" onClick={onLogout} className={styles.logoutButton}>
                Sair da conta
              </button>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
};

export default UserProfile;
