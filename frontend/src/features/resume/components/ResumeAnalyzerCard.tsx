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
    <div className="fd-card-shell p-4 space-y-3">
      <h4 className="fd-kicker text-[9px]">Analisar Curriculo</h4>
      <input
        type="file"
        accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
        className="fd-input text-[10px]"
      />
      <p className="text-[10px] text-fd-text-muted">
        O arquivo selecionado atualiza automaticamente skills, nivel e resumo no perfil.
      </p>
      {trace && (
        <div className="fd-status-info text-[10px]">
          <p>
            <span className="font-black">Fonte da analise:</span> {sourceLabel[trace.source] || trace.source}
          </p>
          {trace.aiProvider && (
            <p className="text-fd-text-secondary">
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
        className="fd-btn-secondary w-full"
      >
        {analyzing ? 'Analisando...' : 'Analisar Curriculo'}
      </button>
    </div>
  );
};

export default ResumeAnalyzerCard;
