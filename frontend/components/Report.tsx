
import React from 'react';
import { InterviewConfig, FinalReport } from '../types';
import { I18N } from '../constants';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

interface Props {
  config: InterviewConfig;
  report: FinalReport;
}

const Report: React.FC<Props> = ({ config, report }) => {
  const t = I18N[config.uiLanguage];

  const summary = report.scoresSummary;
  const radarData = [
    { subject: 'Comunica????o', A: summary?.communication ?? Math.max(3, report.overallScore + 1), fullMark: 10 },
    { subject: 'T??cnico', A: summary?.technical ?? Math.max(3, report.overallScore - 0.5), fullMark: 10 },
    { subject: 'Problemas', A: summary?.problemSolving ?? Math.max(3, report.overallScore + 0.8), fullMark: 10 },
    { subject: 'Postura', A: summary?.presence ?? Math.max(3, report.overallScore), fullMark: 10 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 pb-20">
      {/* Resumo de Score */}
      <div className="bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5 shadow-2xl flex flex-col items-center gap-8 text-center">
        <div className="relative w-48 h-48 flex items-center justify-center">
           <svg className="w-full h-full -rotate-90">
              <circle cx="96" cy="96" r="84" fill="none" stroke="currentColor" strokeWidth="16" className="text-slate-800" />
              <circle cx="96" cy="96" r="84" fill="none" stroke="currentColor" strokeWidth="16" strokeDasharray="527" strokeDashoffset={527 - (report.overallScore / 10) * 527} strokeLinecap="round" className="text-indigo-500 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
           </svg>
           <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-black text-white tracking-tighter">{report.overallScore}</span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Score Geral</span>
           </div>
        </div>
        
        <div className="space-y-3">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">{t.overall}</h2>
          <div className="flex gap-2 flex-wrap justify-center">
             <span className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-600/20">{report.levelEstimate}</span>
             <span className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase border border-white/5">{config.track}</span>
          </div>
        </div>
      </div>

      {/* Radar de Competências */}
      <div className="bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl h-80">
        <div className="mb-4 text-center">
           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Equilíbrio de Skills</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
            <PolarGrid stroke="#1e293b" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} />
            <Radar name="Performance" dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Feedback Detalhado */}
      <div className="grid grid-cols-1 gap-6">
        <section className="bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5 shadow-2xl">
           <h3 className="text-emerald-400 font-black text-[11px] uppercase mb-8 tracking-[0.2em]">{t.strengths}</h3>
           <ul className="space-y-6">
              {report.feedback.technical.slice(0, 3).map((item, i) => (
                <li key={i} className="flex gap-5">
                  <div className="w-8 h-8 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 text-xs">✓</div>
                  <p className="text-slate-300 text-xs font-medium leading-relaxed">{item}</p>
                </li>
              ))}
           </ul>
        </section>

        <section className="bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5 shadow-2xl">
           <h3 className="text-orange-400 font-black text-[11px] uppercase mb-8 tracking-[0.2em]">{t.improvements}</h3>
           <ul className="space-y-6">
              {report.feedback.communication.slice(0, 3).map((item, i) => (
                <li key={i} className="flex gap-5">
                  <div className="w-8 h-8 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 border border-orange-500/20 text-xs font-black">!</div>
                  <p className="text-slate-300 text-xs font-medium leading-relaxed">{item}</p>
                </li>
              ))}
           </ul>
        </section>
      </div>

      {/* Plano de 7 Dias */}
      <div className="bg-indigo-600 rounded-[3rem] p-8 shadow-2xl shadow-indigo-600/20">
         <div className="mb-8">
           <h3 className="text-white font-black text-[11px] uppercase tracking-[0.2em] opacity-80">{t.trainingPlan}</h3>
           <p className="text-indigo-100 text-sm font-bold">Roteiro para o Próximo Nível</p>
         </div>
         <div className="space-y-8">
            {report.plan7Days.map((step) => (
              <div key={step.day} className="flex gap-6 items-start">
                 <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center font-black text-indigo-600 shrink-0 shadow-lg">
                    {step.day}
                 </div>
                 <div>
                    <h4 className="text-white font-black text-xs uppercase tracking-tighter mb-1">Dia {step.day}</h4>
                    <p className="text-indigo-100/80 text-xs font-medium leading-relaxed">{step.task}</p>
                 </div>
              </div>
            ))}
         </div>
      </div>

      {config.jobDescription && (
        <section className="bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5 shadow-2xl">
           <h3 className="text-indigo-400 font-black text-[11px] uppercase mb-10 tracking-[0.2em]">{t.jobMatch}</h3>
           <div className="space-y-10">
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.covered}</p>
                <div className="flex flex-wrap gap-2">
                   {report.jobMatch.covered.map(skill => (
                     <span key={skill} className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase">{skill}</span>
                   ))}
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.gaps}</p>
                <div className="flex flex-wrap gap-2">
                   {report.jobMatch.gaps.map(skill => (
                     <span key={skill} className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-[10px] font-black uppercase">{skill}</span>
                   ))}
                </div>
              </div>
           </div>
        </section>
      )}

      {/* Botão de Ação Final */}
      <div className="flex justify-center pt-8">
         <button 
           onClick={() => window.location.reload()}
           className="w-full py-6 bg-white text-slate-900 font-black rounded-[2.5rem] shadow-2xl active:scale-95 transition-all text-sm uppercase tracking-[0.2em] border-b-8 border-slate-300"
         >
           Finalizar e Voltar
         </button>
      </div>
    </div>
  );
};

export default Report;
