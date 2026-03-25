import React, { useState } from 'react';
import { BackendApi } from '../../../shared/services/backendApi';
import type {
  CandidateProfile,
  InterviewHistoryItem,
  SessionAnalysisTraceResponse,
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
  const profileWeakSkills = (candidateProfile?.weakSkills || []).slice(0, 3);
  const resumeSummary = (candidateProfile?.resumeSummary || '').trim();
  const hasResumeSummary = Boolean(resumeSummary);
  const hasJobDescription = Boolean((candidateProfile?.jobDescription || '').trim());

  const hasProfileSignal = Boolean(
    candidateProfile?.targetRole ||
      candidateProfile?.experienceLevel ||
      hasResumeSummary ||
      hasJobDescription ||
      profilePrimarySkills.length > 0 ||
      profileWeakSkills.length > 0,
  );

  const avgScore =
    interviews.length > 0
      ? Math.round((interviews.reduce((sum, item) => sum + (item.score || 0), 0) / interviews.length) * 10) / 10
      : null;

  const trendScores = interviews.slice(0, 5).map((item) => Number(item.score) || 0).reverse();
  const chartMax = Math.max(100, ...trendScores);
  const interviewCountLabel =
    interviews.length === 1 ? '1 entrevista' : `${interviews.length} entrevistas`;
  const profileRows = [
    {
      label: 'Objetivo',
      value: candidateProfile?.targetRole
        ? `${candidateProfile.targetRole} - ${candidateProfile?.experienceLevel || 'Nao definido'}`
        : 'Nao definido',
    },
    {
      label: 'Skills principais',
      value: profilePrimarySkills.join(', ') || 'Nao definido',
    },
    {
      label: 'Gaps mapeados',
      value: profileWeakSkills.join(', ') || 'Nenhum gap mapeado',
    },
    {
      label: 'Resumo do curriculo',
      value: hasResumeSummary ? 'Salvo no perfil e pronto para revisao.' : 'Pendente no perfil.',
      emphasize: !hasResumeSummary,
    },
  ];

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
              data-tour-id="dashboard-resume-card"
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
            data-tour-id="dashboard-job-card"
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

          <button type="button" onClick={onOpenProfile} className={styles.quickCard}>
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
              <h3 className={styles.panelTitle}>Prontidao da entrevista</h3>
              <span className={styles.panelMeta}>{interviewCountLabel}</span>
            </div>
            <p className={styles.panelLead}>
              Use estes sinais para decidir se vale entrar em uma nova simulacao agora ou ajustar perfil e vaga antes.
            </p>

            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span>Evolucao de desempenho</span>
                <span>{interviews.length} registro(s)</span>
              </div>

              {trendScores.length === 0 && (
                <p className={styles.emptyText}>Ainda nao ha notas suficientes para montar o grafico.</p>
              )}

              {trendScores.length > 0 && (
                <div className={styles.chartBars}>
                  {trendScores.map((score, index) => {
                    const height = Math.max(10, Math.round((score / chartMax) * 100));
                    return (
                      <div key={`${score}-${index}`} className={styles.barGroup}>
                        <div className={styles.barTrack}>
                          <span className={styles.barValue} style={{ height: `${height}%` }} />
                        </div>
                        <span className={styles.barLabel}>{score}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.profileSignals}>
              <div className={styles.signalHeader}>
                <h4>Sinais de preparacao</h4>
                <span className={styles.signalHint}>{hasProfileSignal ? 'Perfil mapeado' : 'Perfil incompleto'}</span>
              </div>
              <div className={styles.signalRow}>
                <span className={`${styles.signalChip} ${hasResumeSummary ? styles.signalOk : styles.signalWarn}`}>
                  Curriculo {hasResumeSummary ? 'ok' : 'pendente'}
                </span>
                <span className={`${styles.signalChip} ${hasJobDescription ? styles.signalOk : styles.signalWarn}`}>
                  Vaga {hasJobDescription ? 'ok' : 'pendente'}
                </span>
              </div>

              {hasProfileSignal ? (
                <div className={styles.profileTexts}>
                  {profileRows.map((row) => (
                    <div key={row.label} className={styles.profileRow}>
                      <span className={styles.profileRowLabel}>{row.label}</span>
                      <p className={`${styles.profileRowValue} ${row.emphasize ? styles.profileRowValueMuted : ''}`}>
                        {row.value}
                      </p>
                    </div>
                  ))}
                  <button type="button" className={styles.profileReviewAction} onClick={onOpenProfile}>
                    Revisar perfil completo
                  </button>
                </div>
              ) : (
                <p className={styles.emptyText}>Complete seu perfil para gerar entrevistas mais alinhadas.</p>
              )}
            </div>
          </article>

          <aside className={styles.sidePanel} data-tour-id="dashboard-history-panel">
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

            {interviews.slice(0, 5).map((item) => {
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

                        const snapshot = trace.analysisTraceSnapshot as any;
                        const resumeTrace = snapshot?.lastResumeAnalysisTrace;
                        const jobTrace = snapshot?.lastJobAnalysisTrace;
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
