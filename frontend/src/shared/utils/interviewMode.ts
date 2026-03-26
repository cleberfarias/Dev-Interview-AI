import type { Seniority } from '../types';
import type { DifficultyLevel, InterviewModeLevel } from '../types/interview';

export const normalizeInterviewModeLevel = (value?: number | null): InterviewModeLevel => {
  if (value === 1) return 1;
  if (value === 3) return 3;
  return 2;
};

export const deriveTechnicalDifficultyLevel = (seniority?: Seniority | string | null): DifficultyLevel => {
  switch (String(seniority || '').trim().toLowerCase()) {
    case 'intern':
    case 'junior':
      return 1;
    case 'senior':
    case 'staff':
      return 3;
    default:
      return 2;
  }
};

const INTERVIEW_MODE_LEVEL_META: Record<
  InterviewModeLevel,
  {
    label: string;
    summary: string;
    roomHint: string;
  }
> = {
  1: {
    label: 'Guiado',
    summary: 'Enunciado visivel para leitura, com mais apoio visual durante a resposta.',
    roomHint: 'Leia a pergunta no card e use o texto como apoio durante a resposta.',
  },
  2: {
    label: 'Padrao',
    summary: 'Entrevista equilibrada, com pergunta visivel e condução normal da conversa.',
    roomHint: 'Escute a pergunta, confira o enunciado no card e responda no seu ritmo.',
  },
  3: {
    label: 'Simulacao real',
    summary: 'Menos apoio visual durante a pergunta, para simular a pressao de uma entrevista ao vivo.',
    roomHint: 'A pergunta vem primeiro por voz. Use o modo texto apenas se precisar revisar o enunciado.',
  },
};

export const getInterviewModeLevelMeta = (value?: number | null) =>
  INTERVIEW_MODE_LEVEL_META[normalizeInterviewModeLevel(value)];
