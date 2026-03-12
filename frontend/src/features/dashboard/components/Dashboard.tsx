import React, { useState } from 'react';
import { BackendApi } from '../../../shared/services/backendApi';
import type { CandidateProfile, InterviewHistoryItem, SessionAnalysisTraceResponse, User } from '../../../shared/types';
import styles from './Dashboard.module.css';

interface DashboardProps {
  user: User;
  candidateProfile?: CandidateProfile | null;
  onStartInterview: () => void;
  onOpenProfile: () => void;
  onDeleteInterview: (sessionId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  user,
  candidateProfile,
  onStartInterview,
  onOpenProfile,
  onDeleteInterview,
}) => {
  const [expandedTraceSessionId, setExpandedTraceSessionId] = useState<string | null>(null);
  const [traceLoadingSessionId, setTraceLoadingSessionId] = useState<string | null>(null);
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
  const shortResumeSummary =
    resumeSummary.length > 180 ? `${resumeSummary.slice(0, 180).trimEnd()}...` : resumeSummary;

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

  const handleToggleTrace = async (sessionId: string) => {
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

  return (
    <div className={styles.page}>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.topBar}>
          <div className={styles.brandRow}>
            <div className={styles.logoBadge}>
              <img src="/img/logo.png" alt="Dev Interview AI" className="w-full h-full object-contain rounded-xl" />
            </div>
            <h1 className={styles.brandTitle}>
              Dev Interview <strong>AI</strong>
            </h1>
          </div>

          <button type="button" onClick={onOpenProfile} className={styles.profileButton}>
            {user.avatar ? <img src={user.avatar} alt="Avatar" /> : <span>{firstName.charAt(0)}</span>}
            <span>{firstName}</span>
          </button>
        </header>

        <section className={styles.hero}>
          <h2>Bem-vindo de volta, {firstName}!</h2>
          <p>Prepare sua proxima entrevista tecnica com IA.</p>
        </section>

        <section className={styles.quickGrid}>
          <button type="button" onClick={onOpenProfile} className={styles.quickCard}>
            <span className={styles.quickIcon}>CV</span>
            <h3>Analisar curriculo</h3>
            <p>Otimize seu perfil tecnico para entrevistas.</p>
            <span className={styles.quickAction}>Abrir perfil</span>
          </button>

          <button type="button" onClick={onOpenProfile} className={styles.quickCard}>
            <span className={styles.quickIcon}>JD</span>
            <h3>Analisar vaga</h3>
            <p>Conecte seu perfil com os requisitos da vaga.</p>
            <span className={styles.quickAction}>Editar vaga</span>
          </button>

          <button type="button" onClick={onStartInterview} className={styles.quickCard}>
            <span className={styles.quickIcon}>AI</span>
            <h3>Iniciar entrevista</h3>
            <p>Pratique com perguntas personalizadas.</p>
            <span className={styles.quickAction}>Comecar</span>
          </button>
        </section>

        <section className={styles.panelGrid}>
          <article className={styles.mainPanel}>
            <h3 className={styles.panelTitle}>Visao geral</h3>

            <div className={styles.metrics}>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Creditos</span>
                <strong>{user.credits ?? 0}</strong>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Media</span>
                <strong>{avgScore ?? '--'}</strong>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Ultima nota</span>
                <strong>{lastInterview?.score ?? '--'}</strong>
              </div>
            </div>

            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span>Evolucao de desempenho</span>
                <span>{interviews.length} entrevista(s)</span>
              </div>

              {trendScores.length === 0 && (
                <p className={styles.emptyText}>Ainda nao ha notas para montar o grafico.</p>
              )}

              {trendScores.length > 0 && (
                <div className={styles.chartBars}>
                  {trendScores.map((score, index) => {
                    const height = Math.max(8, Math.round((score / chartMax) * 100));
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
              <h4>Sinais de preparacao</h4>
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
                  <p>
                    <strong>Objetivo:</strong> {candidateProfile?.targetRole || 'Nao definido'}
                    {' - '}
                    {candidateProfile?.experienceLevel || 'Nao definido'}
                  </p>
                  <p>
                    <strong>Skills:</strong> {profilePrimarySkills.join(', ') || 'Nao definido'}
                  </p>
                  <p>
                    <strong>Gaps:</strong> {profileWeakSkills.join(', ') || 'Nenhum gap mapeado'}
                  </p>
                  <p>{hasResumeSummary ? shortResumeSummary : 'Adicione um resumo de curriculo no perfil.'}</p>
                </div>
              ) : (
                <p className={styles.emptyText}>
                  Complete seu perfil para gerar entrevistas mais alinhadas.
                </p>
              )}
            </div>
          </article>

          <aside className={styles.sidePanel}>
            <h3 className={styles.panelTitle}>Atividade recente</h3>

            {interviews.length === 0 && (
              <p className={styles.emptyText}>Nenhuma entrevista registrada. Clique em iniciar entrevista.</p>
            )}

            {interviews.slice(0, 5).map((item) => (
              <div key={item.id} className={styles.activityItem}>
                <div className={styles.activityTop}>
                  <div>
                    <p className={styles.activityRole}>{item.role}</p>
                    <p className={styles.activityDate}>{formatDate(item.date)}</p>
                  </div>
                  <span className={styles.scoreBadge}>{item.score}</span>
                </div>

                <div className={styles.activityActions}>
                  <button type="button" onClick={() => void handleToggleTrace(item.id)}>
                    {expandedTraceSessionId === item.id ? 'Ocultar trace' : 'Ver trace'}
                  </button>
                  <button type="button" onClick={() => onDeleteInterview(item.id)}>
                    Excluir
                  </button>
                </div>

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
            ))}
          </aside>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
