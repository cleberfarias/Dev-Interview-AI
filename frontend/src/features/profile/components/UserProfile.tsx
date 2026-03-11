
import React, { useState } from 'react';
import { BackendApi } from '../../../shared/services/backendApi';
import type { CandidateProfile, InterviewConfig, SessionAnalysisTraceResponse, User } from '../../../shared/types';
import CandidateProfilePanel from './CandidateProfilePanel';
import { LiveCoachPreviewCard } from '../../live-coach';

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
  onAddCredits,
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

  const averageScore = user.interviews.length > 0 
    ? (user.interviews.reduce((acc, curr) => acc + curr.score, 0) / user.interviews.length).toFixed(1)
    : '0';

  const stats = [
    { label: 'Sessões', value: user.interviews.length, icon: '🎤' },
    { label: 'Créditos', value: user.credits, icon: '🪙' },
    { label: 'Média AI', value: averageScore, icon: '⭐' },
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

  const handleRecharge = async (amount: number, label: string) => {
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
    <div className="flex flex-col h-full bg-slate-950 animate-in slide-in-from-right duration-500">
      <header className="px-6 py-12 flex flex-col items-center text-center gap-4 max-w-5xl mx-auto w-full">
        <div className="relative">
          <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-600 flex items-center justify-center text-4xl font-black text-white shadow-2xl shadow-indigo-600/40 overflow-hidden border-4 border-white/5">
            {user.avatar ? (
              <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : user.name.charAt(0)}
          </div>
          <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-xl border-4 border-slate-950 flex items-center justify-center text-[10px] font-black ${user.provider === 'google' ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'}`}>
            {user.provider === 'google' ? 'G' : '🐙'}
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{user.name}</h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{user.email}</p>
        </div>
      </header>

      <div className="flex-1 px-6 space-y-8 overflow-y-auto no-scrollbar pb-32 max-w-5xl mx-auto w-full">
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map(s => (
            <div key={s.label} className="native-glass p-4 rounded-3xl flex flex-col items-center gap-1 border-white/5">
              <span className="text-lg">{s.icon}</span>
              <span className="text-lg font-black text-white">{s.value}</span>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-center">{s.label}</span>
            </div>
          ))}
        </div>

        <CandidateProfilePanel
          initialJobDescription={config.jobDescription || ''}
          onProfileUpdated={onCandidateProfileUpdated}
        />

        <LiveCoachPreviewCard />

        {/* Recharge Section */}
        <div className="space-y-4">
           <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-1">Recarregar Créditos</h3>
           
           {/* Plano Destaque */}
           <button 
             onClick={() => handleRecharge(100, "Pack 100")}
             disabled={buying}
             className="w-full p-6 bg-gradient-to-br from-amber-500 to-orange-600 rounded-[2rem] flex items-center justify-between active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-orange-600/20 group relative overflow-hidden"
           >
              <div className="absolute top-0 right-0 p-2 bg-white/20 rounded-bl-xl text-[8px] font-black text-white uppercase">Melhor Valor</div>
              <div className="text-left">
                <h4 className="text-sm font-black text-white uppercase">Pack 100 Creditos</h4>
                <p className="text-[10px] font-bold text-amber-100 uppercase opacity-80">Até 1000 entrevistas / mês</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-white block">R$ 100,00</span>
                <span className="text-[8px] font-black text-amber-200 uppercase">Comprar</span>
              </div>
           </button>

           <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => handleRecharge(3, "Pack 3")}
                disabled={buying}
                className="p-5 bg-slate-900 border border-white/5 rounded-3xl flex flex-col items-center gap-1 active:scale-95 transition-all disabled:opacity-50"
              >
                <span className="text-xs font-black text-white">3 Créditos</span>
                <span className="text-[10px] font-bold text-indigo-400">R$ 20,00</span>
              </button>
              <button 
                onClick={() => handleRecharge(10, "Pack 10")}
                disabled={buying}
                className="p-5 bg-indigo-600 border border-indigo-400 rounded-3xl flex flex-col items-center gap-1 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
              >
                <span className="text-xs font-black text-white">10 Créditos</span>
                <span className="text-[10px] font-bold text-indigo-200">R$ 40,00</span>
              </button>
           </div>

           <div className="native-glass p-4 rounded-2xl border border-white/5">
             <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Metodos de pagamento</p>
             <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase text-slate-300">
               <span className="px-3 py-1 rounded-full bg-slate-900/70 border border-white/10">Cartao</span>
               <span className="px-3 py-1 rounded-full bg-slate-900/70 border border-white/10">Pix</span>
               <span className="px-3 py-1 rounded-full bg-slate-900/70 border border-white/10">Boleto</span>
             </div>
             <p className="mt-2 text-[9px] text-slate-500">Pagamentos processados via checkout da Kiwify.</p>
           </div>
        </div>

        {/* History Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Histórico de Sessões</h3>
          </div>
          
          {user.interviews.length > 0 ? (
            user.interviews.map(item => (
              <div key={item.id} className="native-glass p-5 rounded-3xl flex flex-col gap-4 border border-white/5 animate-in fade-in slide-in-from-bottom-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black ${item.score >= 8 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {item.score}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white uppercase">{item.role}</p>
                    <p className="text-[9px] font-medium text-slate-500 uppercase">{formatDate(item.date)} • {item.style}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1 bg-slate-800 rounded-lg text-[8px] font-black text-slate-400 uppercase">
                    {item.track}
                  </div>
                  <button
                    onClick={() => {
                      void handleToggleTrace(item.id);
                    }}
                    className="px-3 py-1 rounded-lg text-[8px] font-black uppercase text-indigo-200 border border-indigo-500/30 hover:border-indigo-400/60"
                  >
                    {expandedTraceSessionId === item.id ? 'Ocultar trace' : 'Ver trace'}
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="px-3 py-1 rounded-lg text-[8px] font-black uppercase text-red-300 border border-red-500/30 hover:border-red-400/60"
                  >
                    Excluir
                  </button>
                </div>
                {expandedTraceSessionId === item.id && (
                  <div className="w-full rounded-xl border border-white/10 bg-slate-900/70 p-3 space-y-2">
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
                      return (
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-300">
                            <span className="font-black text-slate-200">Capturado em:</span>{' '}
                            {formatTraceTimestamp(snapshot?.capturedAt)}
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
            ))
          ) : (
            <div className="py-12 text-center native-glass rounded-3xl border border-dashed border-white/10">
               <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Nenhuma entrevista realizada</p>
               <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">Sua primeira entrevista é grátis!</p>
            </div>
          )}
        </div>

        {/* Settings Links */}
        <div className="space-y-2 pt-4">
           <button className="w-full p-5 bg-slate-900/50 rounded-2xl text-left flex items-center justify-between group">
              <span className="text-xs font-bold text-slate-300">Configurações de Áudio/Vídeo</span>
              <span className="text-slate-600">⚙️</span>
           </button>
           <button 
            className="w-full p-5 bg-slate-900/50 rounded-2xl text-left flex items-center justify-between active:bg-red-500/10" 
            onClick={onLogout}
          >
              <span className="text-xs font-bold text-red-400">Sair da Conta</span>
              <span>🚪</span>
           </button>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent">
        <div className="max-w-md lg:max-w-5xl mx-auto">
          <button 
            onClick={onBack}
            className="w-full py-6 bg-white text-slate-950 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
