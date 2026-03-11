import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AnalysisTrace,
  CandidateProfile,
  CandidateProfileUpsertRequest,
  JobAnalysisResult,
  ProfileAnalysisAuditItem,
  ResumeMatchResult,
} from '../../../shared/types';
import { BackendApi } from '../../../shared/services/backendApi';
import { ResumeAnalyzerCard } from '../../resume';
import { JobAnalyzerCard } from '../../jobs';

interface Props {
  initialJobDescription?: string;
  onProfileUpdated?: (profile: CandidateProfile) => void;
}

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const joinCsv = (items: string[] = []): string => items.join(', ');

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      if (!raw) {
        reject(new Error('Falha ao ler arquivo.'));
        return;
      }
      const payload = raw.includes(',') ? raw.split(',', 2)[1] : raw;
      resolve(payload);
    };
    reader.onerror = () => reject(new Error('Falha ao converter arquivo para base64.'));
    reader.readAsDataURL(file);
  });

const normalizeNullable = (value: string): string | null => {
  const clean = value.trim();
  return clean ? clean : null;
};

const sourceLabel = (source?: string | null): string => {
  if (source === 'ai') return 'IA';
  if (source === 'hybrid') return 'Hibrido';
  return 'Heuristica';
};
const AUDIT_PAGE_SIZE = 6;

const CandidateProfilePanel: React.FC<Props> = ({ initialJobDescription, onProfileUpdated }) => {
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzingResume, setAnalyzingResume] = useState(false);
  const [analyzingJob, setAnalyzingJob] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [targetRole, setTargetRole] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [primarySkillsInput, setPrimarySkillsInput] = useState('');
  const [weakSkillsInput, setWeakSkillsInput] = useState('');
  const [resumeSummary, setResumeSummary] = useState('');
  const [jobDescription, setJobDescription] = useState(initialJobDescription || '');

  const [resumeMatch, setResumeMatch] = useState<ResumeMatchResult | null>(null);
  const [jobAnalysis, setJobAnalysis] = useState<JobAnalysisResult | null>(null);
  const [resumeTrace, setResumeTrace] = useState<AnalysisTrace | null>(null);
  const [jobTrace, setJobTrace] = useState<AnalysisTrace | null>(null);
  const [analysisAudit, setAnalysisAudit] = useState<ProfileAnalysisAuditItem[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (!jobDescription.trim() && initialJobDescription?.trim()) {
      setJobDescription(initialJobDescription.trim());
    }
  }, [initialJobDescription, jobDescription]);

  const applyProfileToState = (profile: CandidateProfile) => {
    setTargetRole(profile.targetRole || '');
    setExperienceLevel(profile.experienceLevel || '');
    setPrimarySkillsInput(joinCsv(profile.primarySkills || []));
    setWeakSkillsInput(joinCsv(profile.weakSkills || []));
    setResumeSummary(profile.resumeSummary || '');
    setJobDescription(profile.jobDescription || initialJobDescription || '');
    setResumeTrace(profile.lastResumeAnalysisTrace || null);
    setJobTrace(profile.lastJobAnalysisTrace || null);
    setAnalysisAudit(profile.analysisAudit || []);
    onProfileUpdated?.(profile);
  };

  useEffect(() => {
    let mounted = true;

    const loadAuditPage = async (offset = 0, replace = false) => {
      setAuditLoading(true);
      try {
        const page = await BackendApi.getCandidateProfileAudit({ limit: AUDIT_PAGE_SIZE, offset });
        if (!mounted) return;
        setAnalysisAudit((prev) => {
          const next = replace ? page.items : [...prev, ...page.items];
          const dedup = new Map<string, ProfileAnalysisAuditItem>();
          for (const item of next) {
            const key = `${item.kind}|${item.createdAt}|${item.source}|${item.aiProvider || ''}|${item.aiModel || ''}`;
            if (!dedup.has(key)) dedup.set(key, item);
          }
          return Array.from(dedup.values());
        });
        setAuditOffset(page.nextOffset ?? offset + page.items.length);
        setAuditHasMore(Boolean(page.hasMore));
      } catch (e) {
        console.warn('Falha ao carregar auditoria de analises', e);
      } finally {
        if (mounted) setAuditLoading(false);
      }
    };

    const load = async () => {
      try {
        const profile = await BackendApi.getCandidateProfile();
        if (!mounted) return;
        applyProfileToState(profile);
        await loadAuditPage(0, true);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Nao foi possivel carregar perfil do candidato.');
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const loadMoreAudit = useCallback(async () => {
    if (auditLoading || !auditHasMore) return;
    setAuditLoading(true);
    try {
      const page = await BackendApi.getCandidateProfileAudit({ limit: AUDIT_PAGE_SIZE, offset: auditOffset });
      setAnalysisAudit((prev) => {
        const next = [...prev, ...page.items];
        const dedup = new Map<string, ProfileAnalysisAuditItem>();
        for (const item of next) {
          const key = `${item.kind}|${item.createdAt}|${item.source}|${item.aiProvider || ''}|${item.aiModel || ''}`;
          if (!dedup.has(key)) dedup.set(key, item);
        }
        return Array.from(dedup.values());
      });
      setAuditOffset(page.nextOffset ?? auditOffset + page.items.length);
      setAuditHasMore(Boolean(page.hasMore));
    } catch (e) {
      console.warn('Falha ao carregar mais auditoria', e);
    } finally {
      setAuditLoading(false);
    }
  }, [auditHasMore, auditLoading, auditOffset]);

  const currentPrimarySkills = useMemo(() => splitCsv(primarySkillsInput), [primarySkillsInput]);
  const currentWeakSkills = useMemo(() => splitCsv(weakSkillsInput), [weakSkillsInput]);

  const buildPayload = useCallback(
    (override: Partial<CandidateProfileUpsertRequest> = {}): CandidateProfileUpsertRequest => ({
      targetRole: override.targetRole !== undefined ? override.targetRole : normalizeNullable(targetRole),
      experienceLevel:
        override.experienceLevel !== undefined ? override.experienceLevel : normalizeNullable(experienceLevel),
      primarySkills: override.primarySkills !== undefined ? override.primarySkills : currentPrimarySkills,
      weakSkills: override.weakSkills !== undefined ? override.weakSkills : currentWeakSkills,
      resumeSummary: override.resumeSummary !== undefined ? override.resumeSummary : normalizeNullable(resumeSummary),
      jobDescription:
        override.jobDescription !== undefined ? override.jobDescription : normalizeNullable(jobDescription),
    }),
    [targetRole, experienceLevel, currentPrimarySkills, currentWeakSkills, resumeSummary, jobDescription],
  );

  const saveProfile = useCallback(
    async (override: Partial<CandidateProfileUpsertRequest> = {}, successMessage = 'Perfil salvo com sucesso.') => {
      setSaving(true);
      setError(null);
      setMessage(null);
      try {
        const payload = buildPayload(override);
        const saved = await BackendApi.upsertCandidateProfile(payload);
        applyProfileToState(saved);
        setMessage(successMessage);
      } catch (e: any) {
        setError(e?.message || 'Nao foi possivel salvar perfil do candidato.');
      } finally {
        setSaving(false);
      }
    },
    [buildPayload],
  );

  const handleAnalyzeResume = async (resumeFile: File) => {
    setAnalyzingResume(true);
    setError(null);
    setMessage(null);
    try {
      const fileBase64 = await fileToBase64(resumeFile);
      const result = await BackendApi.analyzeResume({
        fileName: resumeFile.name,
        fileBase64,
        mimeType: resumeFile.type || undefined,
        jobDescription: jobDescription.trim() || undefined,
      });

      const nextExperience =
        result.extraction.experienceLevel && result.extraction.experienceLevel !== 'unknown'
          ? result.extraction.experienceLevel
          : normalizeNullable(experienceLevel);
      const nextPrimary = result.extraction.technologies || [];
      const nextWeak = result.match?.missingSkills?.length ? result.match.missingSkills : currentWeakSkills;
      const nextSummary = normalizeNullable(result.extraction.resumeSummary) || normalizeNullable(resumeSummary);

      setExperienceLevel(nextExperience || '');
      setPrimarySkillsInput(joinCsv(nextPrimary));
      setWeakSkillsInput(joinCsv(nextWeak));
      setResumeSummary(nextSummary || '');
      setResumeMatch(result.match || null);
      setResumeTrace(result.extractionTrace || null);

      await saveProfile(
        {
          experienceLevel: nextExperience,
          primarySkills: nextPrimary,
          weakSkills: nextWeak,
          resumeSummary: nextSummary,
        },
        'Curriculo analisado e perfil atualizado.',
      );
      const page = await BackendApi.getCandidateProfileAudit({ limit: AUDIT_PAGE_SIZE, offset: 0 });
      setAnalysisAudit(page.items || []);
      setAuditOffset(page.nextOffset ?? (page.items?.length || 0));
      setAuditHasMore(Boolean(page.hasMore));
    } catch (e: any) {
      setError(e?.message || 'Falha ao analisar curriculo.');
    } finally {
      setAnalyzingResume(false);
    }
  };

  const handleAnalyzeJob = async () => {
    if (!jobDescription.trim()) {
      setError('Informe uma descricao de vaga para analisar.');
      return;
    }
    setAnalyzingJob(true);
    setError(null);
    setMessage(null);
    try {
      const result = await BackendApi.analyzeJob({
        jobDescription,
        resumeTechnologies: currentPrimarySkills,
      });
      setJobAnalysis(result.analysis);
      setJobTrace(result.analysisTrace || null);
      if (result.gap) setResumeMatch(result.gap);

      const nextTargetRole = normalizeNullable(targetRole) || normalizeNullable(result.analysis.roleTitleGuess) || null;
      const nextExperience =
        normalizeNullable(experienceLevel) && normalizeNullable(experienceLevel) !== 'unknown'
          ? normalizeNullable(experienceLevel)
          : normalizeNullable(result.analysis.seniorityGuess);
      const nextWeak = result.gap?.missingSkills?.length ? result.gap.missingSkills : currentWeakSkills;

      setTargetRole(nextTargetRole || '');
      setExperienceLevel(nextExperience || '');
      setWeakSkillsInput(joinCsv(nextWeak));

      await saveProfile(
        {
          targetRole: nextTargetRole,
          experienceLevel: nextExperience,
          weakSkills: nextWeak,
        },
        'Vaga analisada e perfil atualizado.',
      );
      const page = await BackendApi.getCandidateProfileAudit({ limit: AUDIT_PAGE_SIZE, offset: 0 });
      setAnalysisAudit(page.items || []);
      setAuditOffset(page.nextOffset ?? (page.items?.length || 0));
      setAuditHasMore(Boolean(page.hasMore));
    } catch (e: any) {
      setError(e?.message || 'Falha ao analisar descricao da vaga.');
    } finally {
      setAnalyzingJob(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Perfil do Candidato</h3>
        {loadingProfile && <span className="text-[9px] text-slate-500">Carregando...</span>}
      </div>

      {message && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[10px] font-bold text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[10px] font-bold text-red-200">
          {error}
        </div>
      )}

      <div className="native-glass rounded-3xl border border-white/5 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Cargo alvo</span>
            <input
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
              placeholder="Backend Engineer"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Nivel</span>
            <input
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
              placeholder="junior | mid | senior"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Skills principais (CSV)</span>
          <input
            value={primarySkillsInput}
            onChange={(e) => setPrimarySkillsInput(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
            placeholder="python, fastapi, docker"
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Skills para evoluir (CSV)</span>
          <input
            value={weakSkillsInput}
            onChange={(e) => setWeakSkillsInput(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
            placeholder="kubernetes, system design"
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Resumo do curriculo</span>
          <textarea
            value={resumeSummary}
            onChange={(e) => setResumeSummary(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
            placeholder="Resumo tecnico principal..."
          />
        </label>

        <button
          type="button"
          onClick={() => saveProfile()}
          disabled={saving || loadingProfile}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Salvar Perfil'}
        </button>
      </div>

      <ResumeAnalyzerCard analyzing={analyzingResume} onAnalyze={handleAnalyzeResume} trace={resumeTrace} />

      <JobAnalyzerCard
        jobDescription={jobDescription}
        onJobDescriptionChange={setJobDescription}
        analyzing={analyzingJob}
        onAnalyze={handleAnalyzeJob}
        jobAnalysis={jobAnalysis}
        resumeMatch={resumeMatch}
        trace={jobTrace}
      />

      {analysisAudit.length > 0 && (
        <div className="native-glass rounded-3xl border border-white/5 p-4 space-y-3">
          <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Auditoria de Analises</h4>
          <div className="space-y-2">
            {analysisAudit.map((event, index) => {
              const timestamp = event.createdAt
                ? new Date(event.createdAt).toLocaleString('pt-BR')
                : 'sem data';
              return (
                <div
                  key={`${event.kind}-${event.createdAt}-${index}`}
                  className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2"
                >
                  <p className="text-[10px] text-slate-200">
                    <span className="font-black uppercase">{event.kind}</span> | {sourceLabel(event.source)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {event.aiProvider ? `${event.aiProvider}${event.aiModel ? ` / ${event.aiModel}` : ''}` : 'sem provider'}
                  </p>
                  <p className="text-[10px] text-slate-500">{timestamp}</p>
                </div>
              );
            })}
          </div>
          {auditHasMore && (
            <button
              type="button"
              onClick={() => {
                void loadMoreAudit();
              }}
              disabled={auditLoading}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
            >
              {auditLoading ? 'Carregando...' : 'Carregar mais'}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default CandidateProfilePanel;
