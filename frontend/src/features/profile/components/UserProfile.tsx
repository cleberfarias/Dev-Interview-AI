import React, { useEffect, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { BackendApi } from '../../../shared/services/backendApi';
import type { CandidateProfile, InterviewConfig, SessionAnalysisTraceResponse, User } from '../../../shared/types';
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
