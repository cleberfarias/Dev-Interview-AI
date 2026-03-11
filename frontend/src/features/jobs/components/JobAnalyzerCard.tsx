import React from 'react';
import type { AnalysisTrace, JobAnalysisResult, ResumeMatchResult } from '../../../shared/types';

interface JobAnalyzerCardProps {
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  analyzing: boolean;
  onAnalyze: () => Promise<void> | void;
  jobAnalysis?: JobAnalysisResult | null;
  resumeMatch?: ResumeMatchResult | null;
  trace?: AnalysisTrace | null;
}

const sourceLabel: Record<AnalysisTrace['source'], string> = {
  heuristic: 'Heuristica',
  ai: 'IA',
  hybrid: 'Hibrido',
};

const JobAnalyzerCard: React.FC<JobAnalyzerCardProps> = ({
  jobDescription,
  onJobDescriptionChange,
  analyzing,
  onAnalyze,
  jobAnalysis,
  resumeMatch,
  trace,
}) => (
  <div className="native-glass rounded-3xl border border-white/5 p-4 space-y-3">
    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Analisar Vaga</h4>
    <textarea
      value={jobDescription}
      onChange={(e) => onJobDescriptionChange(e.target.value)}
      rows={5}
      className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
      placeholder="Cole aqui a descricao da vaga..."
    />
    <button
      type="button"
      onClick={onAnalyze}
      disabled={analyzing}
      className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
    >
      {analyzing ? 'Analisando...' : 'Analisar Vaga'}
    </button>
    {trace && (
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-3 space-y-1">
        <p className="text-[10px] text-indigo-100">
          <span className="font-black">Fonte da analise:</span> {sourceLabel[trace.source] || trace.source}
        </p>
        {trace.aiProvider && (
          <p className="text-[10px] text-indigo-200/80">
            provider: {trace.aiProvider}
            {trace.aiModel ? ` | model: ${trace.aiModel}` : ''}
          </p>
        )}
      </div>
    )}

    {jobAnalysis && (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3 space-y-2">
        <p className="text-[10px] text-slate-300">
          <span className="font-black text-slate-200">Cargo:</span> {jobAnalysis.roleTitleGuess}
        </p>
        <p className="text-[10px] text-slate-300">
          <span className="font-black text-slate-200">Senioridade:</span> {jobAnalysis.seniorityGuess}
        </p>
        <p className="text-[10px] text-slate-300">
          <span className="font-black text-slate-200">Skills requeridas:</span>{' '}
          {jobAnalysis.requiredSkills.join(', ') || 'N/A'}
        </p>
      </div>
    )}

    {resumeMatch && (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3 space-y-2">
        <p className="text-[10px] text-slate-300">
          <span className="font-black text-slate-200">Match score:</span> {resumeMatch.matchScore}
        </p>
        <p className="text-[10px] text-slate-300">
          <span className="font-black text-slate-200">Gaps:</span> {resumeMatch.missingSkills.join(', ') || 'N/A'}
        </p>
      </div>
    )}
  </div>
);

export default JobAnalyzerCard;
