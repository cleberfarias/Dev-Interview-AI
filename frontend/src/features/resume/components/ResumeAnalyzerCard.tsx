import React, { useState } from 'react';
import type { AnalysisTrace } from '../../../shared/types';

interface ResumeAnalyzerCardProps {
  analyzing: boolean;
  onAnalyze: (file: File) => Promise<void> | void;
  trace?: AnalysisTrace | null;
}

const sourceLabel: Record<AnalysisTrace['source'], string> = {
  heuristic: 'Heuristica',
  ai: 'IA',
  hybrid: 'Hibrido',
};

const ResumeAnalyzerCard: React.FC<ResumeAnalyzerCardProps> = ({ analyzing, onAnalyze, trace }) => {
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const handleAnalyze = async () => {
    if (!resumeFile) return;
    await onAnalyze(resumeFile);
  };

  return (
    <div className="native-glass rounded-3xl border border-white/5 p-4 space-y-3">
      <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Analisar Curriculo</h4>
      <input
        type="file"
        accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
        className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-[10px] text-slate-300"
      />
      <p className="text-[10px] text-slate-500">
        O arquivo selecionado atualiza automaticamente skills, nivel e resumo no perfil.
      </p>
      {trace && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-[10px] text-indigo-100">
          <p>
            <span className="font-black">Fonte da analise:</span> {sourceLabel[trace.source] || trace.source}
          </p>
          {trace.aiProvider && (
            <p className="text-indigo-200/80">
              provider: {trace.aiProvider}
              {trace.aiModel ? ` | model: ${trace.aiModel}` : ''}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={analyzing || !resumeFile}
        className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
      >
        {analyzing ? 'Analisando...' : 'Analisar Curriculo'}
      </button>
    </div>
  );
};

export default ResumeAnalyzerCard;
