import React, { useState } from 'react';
import { BackendApi } from '../../../shared/services/backendApi';
import type { CandidateProfile, InterviewConfig, SessionAnalysisTraceResponse, User } from '../../../shared/types';
import CandidateProfilePanel from './CandidateProfilePanel';
import { LiveCoachPreviewCard } from '../../live-coach';
import styles from './UserProfile.module.css';

interface Props {
  user: User;
  config: InterviewConfig;
  onBack: () => void;
  onLogout: () => void;
  onAddCredits: (amount: number) => void;
  onDeleteInterview: (sessionId: string) => void;
  onCandidateProfileUpdated?: (profile: CandidateProfile) => void;
}

const UserProfile: React.FC<Props> = ({
  user,
  config,
  onBack,
  onLogout,
  onAddCredits: _onAddCredits,
  onDeleteInterview,
  onCandidateProfileUpdated,
}) => {
  const [buying, setBuying] = useState(false);
  const [expandedTraceSessionId, setExpandedTraceSessionId] = useState<string | null>(null);
  const [traceLoadingSessionId, setTraceLoadingSessionId] = useState<string | null>(null);
  const [traceErrorBySessionId, setTraceErrorBySessionId] = useState<Record<string, string>>({});
  const [traceBySessionId, setTraceBySessionId] = useState<Record<string, SessionAnalysisTraceResponse | null>>({});

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
    const ok = window.confirm('Deseja excluir esta entrevista?');
    if (!ok) return;
    await onDeleteInterview(sessionId);
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

          <button type="button" onClick={onBack} className={styles.backTopButton}>
            Voltar
          </button>
        </header>

        <section className={styles.heroCard}>
          <div className={styles.heroUser}>
            <div className={styles.avatarWrap}>
              {user.avatar ? <img src={user.avatar} alt="Avatar" /> : <span>{firstName.charAt(0)}</span>}
            </div>
            <div>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
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
            <div className={styles.neonBlock}>
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
              <h3>Recarregar creditos</h3>
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
              <h3>Historico de sessoes</h3>

              {user.interviews.length === 0 && (
                <p className={styles.emptyText}>Nenhuma entrevista realizada ainda.</p>
              )}

              {user.interviews.map((item) => (
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
                      onClick={() => {
                        void handleToggleTrace(item.id);
                      }}
                    >
                      {expandedTraceSessionId === item.id ? 'Ocultar trace' : 'Ver trace'}
                    </button>
                    <button type="button" onClick={() => handleDelete(item.id)}>
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
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </article>

            <article className={styles.panel}>
              <h3>Configuracoes</h3>
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
