import React, { useState } from 'react';
import { BackendApi } from '../../../shared/services/backendApi';
import type { CandidateProfile, InterviewHistoryItem, SessionAnalysisTraceResponse, User } from '../../../shared/types';

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
    <div className="min-h-screen bg-[#05070f] text-white">
      <div className="relative overflow-hidden px-4 sm:px-6 pt-10 pb-6">
        <div className="absolute -top-32 right-0 h-64 w-64 rounded-full bg-[#2a3bff]/30 blur-3xl" />
        <div className="absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[#00d2ff]/20 blur-3xl" />

        <div className="relative mx-auto max-w-5xl">
          <p className="text-xs uppercase tracking-[0.45em] text-[#6d7bc6]">Dashboard</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Ola, {user.name ? user.name.split(' ')[0] : 'Candidato'}
              </h1>
              <p className="mt-2 text-sm text-[#98a7e0]">
                Sua central para entrevistas, relatorios e progresso.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onOpenProfile}
                className="rounded-full border border-white/15 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40"
              >
                Perfil
              </button>
              <button
                onClick={onStartInterview}
                className="rounded-full bg-white px-6 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-[#05070f] transition hover:opacity-90"
              >
                Nova entrevista
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 sm:px-6 pb-12 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-[#0b1120] p-6 shadow-[0_25px_50px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-[#94a5f5]">Resumo</h2>
            <span className="text-xs text-white/40">Ultimos 30 dias</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#0f172a] p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-[#6d7bc6]">Creditos</p>
              <p className="mt-2 text-3xl font-bold">{user.credits ?? 0}</p>
              <p className="mt-2 text-xs text-white/50">Use para desbloquear entrevistas premium.</p>
            </div>
            <div className="rounded-2xl bg-[#0f172a] p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-[#6d7bc6]">Media</p>
              <p className="mt-2 text-3xl font-bold">{avgScore ?? '--'}</p>
              <p className="mt-2 text-xs text-white/50">Pontuacao media das ultimas sessoes.</p>
            </div>
            <div className="rounded-2xl bg-[#0f172a] p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-[0.28em] text-[#6d7bc6]">Ultima entrevista</p>
              <p className="mt-2 text-lg font-semibold">
                {lastInterview ? lastInterview.role : 'Sem registros ainda'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/50">
                <span className="break-words">
                  {lastInterview ? formatDate(lastInterview.date) : 'Comece uma nova entrevista'}
                </span>
                {lastInterview && <span>Pontuacao {lastInterview.score}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-[#0b1120] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-[#94a5f5]">Perfil Alvo</h2>
              <button
                type="button"
                onClick={onOpenProfile}
                className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 transition hover:border-white/40"
              >
                Editar
              </button>
            </div>

            {!hasProfileSignal && (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-4 text-xs text-white/50">
                Complete seu perfil para receber entrevistas mais alinhadas ao seu objetivo.
              </div>
            )}

            {hasProfileSignal && (
              <div className="mt-4 space-y-3 text-xs">
                <div className="rounded-2xl bg-[#0f172a] p-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#6d7bc6]">Cargo e nivel</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {candidateProfile?.targetRole || 'Nao definido'}
                    <span className="text-white/50"> - {candidateProfile?.experienceLevel || 'Nao definido'}</span>
                  </p>
                </div>
                <div className="rounded-2xl bg-[#0f172a] p-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#6d7bc6]">Skills principais</p>
                  <p className="mt-2 text-sm text-white/85">{profilePrimarySkills.join(', ') || 'Nao definido'}</p>
                </div>
                <div className="rounded-2xl bg-[#0f172a] p-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#6d7bc6]">Gaps atuais</p>
                  <p className="mt-2 text-sm text-white/85">{profileWeakSkills.join(', ') || 'Nenhum gap mapeado'}</p>
                </div>
                <div className="rounded-2xl bg-[#0f172a] p-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#6d7bc6]">Preparacao</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        hasResumeSummary
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      Curriculo {hasResumeSummary ? 'ok' : 'pendente'}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        hasJobDescription
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      Vaga {hasJobDescription ? 'ok' : 'pendente'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-white/80">
                    {hasResumeSummary ? shortResumeSummary : 'Adicione um resumo do curriculo no perfil para personalizar melhor as perguntas.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#0b1120] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-[#94a5f5]">Historico</h2>
            <div className="mt-5 space-y-4">
              {interviews.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/50">
                  Nenhuma entrevista registrada. Clique em "Nova entrevista" para comecar.
                </div>
              )}
              {interviews.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl bg-[#0f172a] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{item.role}</p>
                    <p className="text-xs text-white/50 break-words">{formatDate(item.date)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-white/70">
                      {item.score}
                    </span>
                    <button
                      onClick={() => {
                        void handleToggleTrace(item.id);
                      }}
                      className="rounded-full border border-indigo-500/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200 hover:border-indigo-400/70"
                    >
                      {expandedTraceSessionId === item.id ? 'Ocultar trace' : 'Ver trace'}
                    </button>
                    <button
                      onClick={() => onDeleteInterview(item.id)}
                      className="rounded-full border border-red-500/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300 hover:border-red-400/70"
                    >
                      Excluir
                    </button>
                  </div>

                  {expandedTraceSessionId === item.id && (
                    <div className="sm:col-span-2 w-full rounded-xl border border-white/10 bg-[#0b1120] p-3 space-y-2">
                      {traceLoadingSessionId === item.id && (
                        <p className="text-[10px] text-slate-400">Carregando trace da sessao...</p>
                      )}

                      {!traceLoadingSessionId && traceErrorBySessionId[item.id] && (
                        <p className="text-[10px] text-red-300">{traceErrorBySessionId[item.id]}</p>
                      )}

                      {!traceLoadingSessionId && !traceErrorBySessionId[item.id] && (() => {
                        const trace = traceBySessionId[item.id];
                        if (!trace || !trace.hasTrace || !trace.analysisTraceSnapshot) {
                          return <p className="text-[10px] text-slate-400">Sessao sem snapshot de trace.</p>;
                        }

                        const snapshot = trace.analysisTraceSnapshot as any;
                        const resumeTrace = snapshot?.lastResumeAnalysisTrace;
                        const jobTrace = snapshot?.lastJobAnalysisTrace;
                        const capturedAt = formatTraceTimestamp(snapshot?.capturedAt);

                        return (
                          <div className="space-y-2">
                            <p className="text-[10px] text-slate-300">
                              <span className="font-black text-slate-200">Capturado em:</span> {capturedAt}
                            </p>
                            {resumeTrace && (
                              <p className="text-[10px] text-slate-300">
                                <span className="font-black text-slate-200">Resume:</span> {sourceLabel(resumeTrace.source)}{' '}
                                {resumeTrace.aiProvider ? `(${resumeTrace.aiProvider}${resumeTrace.aiModel ? ` / ${resumeTrace.aiModel}` : ''})` : ''}
                              </p>
                            )}
                            {jobTrace && (
                              <p className="text-[10px] text-slate-300">
                                <span className="font-black text-slate-200">Job:</span> {sourceLabel(jobTrace.source)}{' '}
                                {jobTrace.aiProvider ? `(${jobTrace.aiProvider}${jobTrace.aiModel ? ` / ${jobTrace.aiModel}` : ''})` : ''}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
