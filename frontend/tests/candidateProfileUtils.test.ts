import { describe, expect, it } from 'vitest';

import {
  getMissingCandidateProfileFields,
  hasCandidateJobProfileAnalysis,
  isCandidateProfileComplete,
} from '../src/shared/utils/candidateProfile';

describe('candidateProfile utils', () => {
  it('detects when the candidate profile is incomplete', () => {
    expect(
      getMissingCandidateProfileFields({
        userId: 'user-1',
        targetRole: 'Backend Engineer',
        experienceLevel: '',
        primarySkills: [],
        weakSkills: [],
        resumeSummary: null,
      }),
    ).toEqual(['nivel de experiencia', 'skills principais', 'resumo do curriculo']);

    expect(
      isCandidateProfileComplete({
        userId: 'user-1',
        targetRole: 'Backend Engineer',
        experienceLevel: 'mid',
        primarySkills: ['Node.js', 'TypeScript'],
        weakSkills: [],
        resumeSummary: 'Atuo com APIs e arquitetura backend.',
      }),
    ).toBe(true);
  });

  it('detects whether the job profile analysis already exists', () => {
    expect(
      hasCandidateJobProfileAnalysis({
        userId: 'user-1',
        primarySkills: [],
        weakSkills: [],
        lastJobAnalysisId: 'job-1',
      }),
    ).toBe(true);

    expect(
      hasCandidateJobProfileAnalysis({
        userId: 'user-1',
        primarySkills: [],
        weakSkills: [],
      }),
    ).toBe(false);
  });
});
