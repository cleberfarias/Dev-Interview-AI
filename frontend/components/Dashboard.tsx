import React from 'react';
import type { User, InterviewHistoryItem } from '../types';

interface DashboardProps {
  user: User;
  onStartInterview: () => void;
  onOpenProfile: () => void;
  onDeleteInterview: (sessionId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onStartInterview, onOpenProfile, onDeleteInterview }) => {
  const interviews = (user.interviews || []) as InterviewHistoryItem[];
  const lastInterview = interviews[0];
  const avgScore =
    interviews.length > 0
      ? Math.round((interviews.reduce((sum, item) => sum + (item.score || 0), 0) / interviews.length) * 10) / 10
      : null;

  return (
    <div className="min-h-screen bg-[#05070f] text-white">
      <div className="relative overflow-hidden px-6 pt-10 pb-6">
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

      <div className="mx-auto grid max-w-5xl gap-6 px-6 pb-12 md:grid-cols-[1.4fr_1fr]">
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
              <div className="mt-2 flex items-center gap-3 text-xs text-white/50">
                <span>{lastInterview ? lastInterview.date : 'Comece uma nova entrevista'}</span>
                {lastInterview && <span>Pontuacao {lastInterview.score}</span>}
              </div>
            </div>
          </div>
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
              <div key={item.id} className="flex items-center justify-between rounded-2xl bg-[#0f172a] p-4">
                <div>
                  <p className="text-sm font-semibold">{item.role}</p>
                  <p className="text-xs text-white/50">{item.date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-white/70">
                    {item.score}
                  </span>
                  <button
                    onClick={() => onDeleteInterview(item.id)}
                    className="rounded-full border border-red-500/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300 hover:border-red-400/70"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
