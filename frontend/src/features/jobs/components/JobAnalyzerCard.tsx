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
  <div className="fd-card-shell p-4 space-y-3">
    <h4 className="fd-kicker text-[9px]">Analisar Vaga</h4>
    <textarea
      value={jobDescription}
      onChange={(e) => onJobDescriptionChange(e.target.value)}
      rows={5}
      className="fd-textarea text-xs"
      placeholder="Cole aqui a descricao da vaga..."
    />
    <button
      type="button"
      onClick={onAnalyze}
      disabled={analyzing}
      className="fd-btn-secondary w-full"
    >
      {analyzing ? 'Analisando...' : 'Analisar Vaga'}
    </button>
    {trace && (
      <div className="fd-status-info space-y-1">
        <p className="text-[10px]">
          <span className="font-black">Fonte da analise:</span> {sourceLabel[trace.source] || trace.source}
        </p>
        {trace.aiProvider && (
          <p className="text-[10px] text-fd-text-secondary">
            provider: {trace.aiProvider}
            {trace.aiModel ? ` | model: ${trace.aiModel}` : ''}
          </p>
        )}
      </div>
    )}

    {jobAnalysis && (
      <div className="fd-list-item space-y-2">
        <p className="text-[10px] text-fd-text-secondary">
          <span className="font-black text-fd-text-primary">Cargo:</span> {jobAnalysis.roleTitleGuess}
        </p>
        <p className="text-[10px] text-fd-text-secondary">
          <span className="font-black text-fd-text-primary">Senioridade:</span> {jobAnalysis.seniorityGuess}
        </p>
        <p className="text-[10px] text-fd-text-secondary">
          <span className="font-black text-fd-text-primary">Skills requeridas:</span>{' '}
          {jobAnalysis.requiredSkills.join(', ') || 'N/A'}
        </p>
      </div>
    )}

    {resumeMatch && (
      <div className="fd-list-item space-y-2">
        <p className="text-[10px] text-fd-text-secondary">
          <span className="font-black text-fd-text-primary">Match score:</span> {resumeMatch.matchScore}
        </p>
        <p className="text-[10px] text-fd-text-secondary">
          <span className="font-black text-fd-text-primary">Gaps:</span> {resumeMatch.missingSkills.join(', ') || 'N/A'}
        </p>
      </div>
    )}
  </div>
);

export default JobAnalyzerCard;
