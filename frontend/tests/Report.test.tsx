import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Report from '../src/features/report/components/Report';
import type { FinalReport, InterviewConfig } from '../src/shared/types';

const baseConfig: InterviewConfig = {
  uiLanguage: 'pt-BR',
  interviewLanguage: 'pt-BR',
  track: 'frontend',
  seniority: 'mid',
  stacks: ['React', 'TypeScript'],
  style: 'friendly',
  duration: 10,
  plan: 'free',
  interviewMode: 'candidate_coaching_mode',
  difficultyLevel: 2,
};

const insufficientReport: FinalReport = {
  overallScore: 0,
  levelEstimate: 'junior',
  jobMatch: {
    covered: [],
    gaps: [],
  },
  feedback: {
    technical: [],
    communication: [],
    posture: [],
    language: [],
  },
  plan7Days: [],
  reportSource: 'ai',
  reportStatus: 'insufficient_data',
  reportWarnings: [
    'A entrevista foi encerrada cedo demais para gerar uma avaliacao confiavel. Use este resumo apenas como registro da sessao.',
  ],
};

describe('Report', () => {
  it('shows an honest partial state when the interview ends without enough answers', () => {
    render(<Report config={baseConfig} report={insufficientReport} />);

    expect(screen.getByText('Dados insuficientes para avaliar')).toBeInTheDocument();
    expect(screen.getByText('Sessao curta')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A entrevista foi encerrada antes de respostas suficientes. O resumo abaixo serve apenas como registro da sessao.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('0.0').length).toBeGreaterThan(0);
    expect(screen.queryByText('3.0')).not.toBeInTheDocument();
  });
});
