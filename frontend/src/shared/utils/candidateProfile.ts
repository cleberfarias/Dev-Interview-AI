import type { CandidateProfile } from '../types';

export interface CandidateProfileCompletionDraft {
  targetRole?: string | null;
  experienceLevel?: string | null;
  primarySkills?: string[] | null;
  resumeSummary?: string | null;
}

const normalizeText = (value?: string | null): string => (value || '').trim();

const collectMissingProfileFields = (profile?: CandidateProfileCompletionDraft | null): string[] => {
  if (!profile) {
    return ['cargo alvo', 'nivel de experiencia', 'skills principais', 'resumo do curriculo'];
  }

  const missing: string[] = [];
  if (!normalizeText(profile.targetRole)) missing.push('cargo alvo');
  if (!normalizeText(profile.experienceLevel)) missing.push('nivel de experiencia');
  if ((profile.primarySkills || []).length === 0) missing.push('skills principais');
  if (!normalizeText(profile.resumeSummary)) missing.push('resumo do curriculo');
  return missing;
};

export const getMissingCandidateProfileFields = (profile?: CandidateProfile | null): string[] =>
  collectMissingProfileFields(profile);

export const getMissingCandidateProfileDraftFields = (
  draft?: CandidateProfileCompletionDraft | null,
): string[] => collectMissingProfileFields(draft);

export const isCandidateProfileComplete = (profile?: CandidateProfile | null): boolean =>
  getMissingCandidateProfileFields(profile).length === 0;

export const hasCandidateJobProfileAnalysis = (profile?: CandidateProfile | null): boolean => {
  if (!profile) return false;
  if (profile.lastJobAnalysisId) return true;
  if ((profile.recentJobAnalysisIds || []).length > 0) return true;
  if (profile.lastJobAnalysisTrace?.source) return true;
  if ((profile.analysisAudit || []).some((item) => item.kind === 'job')) return true;
  return false;
};
