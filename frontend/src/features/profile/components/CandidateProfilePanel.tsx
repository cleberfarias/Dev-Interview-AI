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
import { getMissingCandidateProfileDraftFields } from '../../../shared/utils/candidateProfile';
import { ResumeAnalyzerCard } from '../../resume';
import { JobAnalyzerCard } from '../../jobs';

interface Props {
  initialJobDescription?: string;
  onProfileUpdated?: (profile: CandidateProfile) => void;
}

type ContextStepId = 'resume' | 'job';
type ContextStepStatus = 'pending' | 'ready' | 'processing' | 'done';

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
const EXPERIENCE_OPTIONS = [
  { value: '', label: 'Selecione o nivel' },
  { value: 'intern', label: 'Estagio' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Pleno' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff / Principal' },
];

const formatExperienceLabel = (value: string): string => {
  const matchedOption = EXPERIENCE_OPTIONS.find((option) => option.value === value);
  return matchedOption?.label || value;
};

const summarizeSkills = (items: string[], emptyText: string): string => {
  if (items.length === 0) return emptyText;
  const preview = items.slice(0, 3).join(', ');
  return items.length > 3 ? `${preview} +${items.length - 3}` : preview;
};

const contextStatusLabel = (status: ContextStepStatus): string => {
  if (status === 'processing') return 'Analisando';
  if (status === 'done') return 'Concluido';
  if (status === 'ready') return 'Pronto';
  return 'Pendente';
};

const contextStatusClassName = (status: ContextStepStatus): string => {
  if (status === 'processing') {
    return 'border-cyan-400/24 bg-cyan-400/12 text-fd-text-primary';
  }
  if (status === 'done') {
    return 'border-emerald-400/24 bg-emerald-400/12 text-fd-text-primary';
  }
  if (status === 'ready') {
    return 'border-amber-400/24 bg-amber-400/12 text-fd-text-primary';
  }
  return 'border-white/10 bg-white/5 text-fd-text-secondary';
};

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
  const [isAuditExpanded, setIsAuditExpanded] = useState(false);
  const [expandedContextStep, setExpandedContextStep] = useState<ContextStepId | null>('resume');

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
  const missingProfileFields = useMemo(
    () =>
      getMissingCandidateProfileDraftFields({
        targetRole,
        experienceLevel,
        primarySkills: currentPrimarySkills,
        resumeSummary,
      }),
    [currentPrimarySkills, experienceLevel, resumeSummary, targetRole],
  );
  const profileReadyForInterview = missingProfileFields.length === 0;
  const profileHighlights = useMemo(
    () => [
      {
        label: 'Cargo alvo',
        value: targetRole || 'Defina a vaga que deseja simular.',
      },
      {
        label: 'Nivel',
        value: experienceLevel ? formatExperienceLabel(experienceLevel) : 'Escolha sua senioridade.',
      },
      {
        label: 'Skills principais',
        value: summarizeSkills(currentPrimarySkills, 'Mapeie as stacks centrais da entrevista.'),
      },
      {
        label: 'Resumo',
        value: resumeSummary.trim() ? 'Resumo profissional preenchido.' : 'Descreva seu foco tecnico em poucas linhas.',
      },
    ],
    [currentPrimarySkills, experienceLevel, resumeSummary, targetRole],
  );
  const hasResumeContext = Boolean(resumeSummary.trim() || currentPrimarySkills.length > 0 || experienceLevel || resumeTrace);
  const hasJobDraft = Boolean(jobDescription.trim());
  const hasJobContext = Boolean(jobTrace || jobAnalysis);
  const resumeContextStatus: ContextStepStatus =
    analyzingResume ? 'processing' : resumeTrace ? 'done' : hasResumeContext ? 'ready' : 'pending';
  const jobContextStatus: ContextStepStatus =
    analyzingJob ? 'processing' : hasJobContext ? 'done' : hasJobDraft ? 'ready' : 'pending';
  const resumeContextHighlights = useMemo(
    () => [
      {
        label: 'Tecnologias',
        value: summarizeSkills(currentPrimarySkills, 'Nenhuma stack principal extraida ainda.'),
      },
      {
        label: 'Nivel',
        value: experienceLevel ? formatExperienceLabel(experienceLevel) : 'Sem senioridade definida.',
      },
      {
        label: 'Resumo',
        value: resumeSummary.trim() ? 'Resumo profissional pronto para a entrevista.' : 'Curriculo ainda nao resumido.',
      },
    ],
    [currentPrimarySkills, experienceLevel, resumeSummary],
  );
  const jobContextHighlights = useMemo(
    () => [
      {
        label: 'Descricao',
        value: hasJobDraft ? 'Descricao da vaga carregada para cruzamento.' : 'Cole a vaga para personalizar a simulacao.',
      },
      {
        label: 'Cargo inferido',
        value: jobAnalysis?.roleTitleGuess || targetRole || 'Aguardando leitura da vaga.',
      },
      {
        label: 'Match',
        value: resumeMatch ? `Score ${resumeMatch.matchScore}` : 'Match ainda nao calculado.',
      },
    ],
    [hasJobDraft, jobAnalysis?.roleTitleGuess, resumeMatch, targetRole],
  );

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveProfile();
  };

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
      setExpandedContextStep('job');
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
      setExpandedContextStep('job');
    } catch (e: any) {
      setError(e?.message || 'Falha ao analisar descricao da vaga.');
    } finally {
      setAnalyzingJob(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="space-y-2">
          <h3 className="fd-kicker text-[10px] text-fd-accent">Perfil do Candidato</h3>
          <p className="max-w-2xl text-[11px] leading-relaxed text-fd-text-secondary">
            Preencha o essencial para a IA montar entrevistas mais alinhadas com sua vaga e com o seu momento.
          </p>
        </div>
        {loadingProfile && <span className="text-[9px] text-fd-text-muted">Carregando...</span>}
      </div>

      {message && (
        <div className="fd-status-success text-[10px] font-bold">
          {message}
        </div>
      )}
      {error && (
        <div className="fd-status-error text-[10px] font-bold">
          {error}
        </div>
      )}

      <div
        className={`${profileReadyForInterview ? 'fd-status-success' : 'fd-status-warning'} text-[10px] font-bold`}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {profileReadyForInterview
              ? 'Perfil do candidato pronto para iniciar a entrevista.'
              : `Antes de iniciar a entrevista, complete: ${missingProfileFields.join(', ')}.`}
          </span>
          <span className="text-[9px] uppercase tracking-[0.22em]">
            {profileReadyForInterview ? 'Pronto' : `${missingProfileFields.length} pendencia(s)`}
          </span>
        </div>
      </div>

      <div className="fd-card-soft rounded-[22px] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="fd-kicker text-[9px]">Checklist</span>
            <h4 className="text-sm font-black text-fd-text-primary">Base da entrevista</h4>
          </div>
          <span className="inline-flex min-h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-fd-text-secondary">
            {profileReadyForInterview ? 'Pronto' : `${missingProfileFields.length} item(ns)`}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {profileHighlights.map((item) => (
            <div key={item.label} className="fd-list-item space-y-1">
              <p className="fd-kicker text-[9px]">{item.label}</p>
              <p className="text-[11px] leading-relaxed text-fd-text-secondary">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="fd-card-shell p-4 space-y-4">
        <div className="space-y-2">
          <span className="fd-kicker text-[9px]">Fluxo guiado</span>
          <h4 className="text-sm font-black text-fd-text-primary">Contexto da entrevista</h4>
          <p className="text-[11px] leading-relaxed text-fd-text-secondary">
            Curriculo e vaga agora funcionam como um fluxo unico: primeiro voce importa seu contexto tecnico, depois
            personaliza a entrevista com a descricao da vaga.
          </p>
        </div>

        <div
          data-tour-id="profile-resume-analyzer"
          className="fd-card-soft rounded-[22px] p-4 space-y-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/12 text-[11px] font-black text-fd-text-primary">
                  1
                </span>
                <div>
                  <span className="fd-kicker text-[9px]">Primeiro passo</span>
                  <h5 className="text-sm font-black text-fd-text-primary">Importe o curriculo</h5>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-fd-text-secondary">
                Use o arquivo para preencher skills, senioridade e resumo sem digitar tudo manualmente.
              </p>
            </div>
            <span
              className={`inline-flex min-h-10 items-center rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.18em] ${contextStatusClassName(resumeContextStatus)}`}
            >
              {contextStatusLabel(resumeContextStatus)}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {resumeContextHighlights.map((item) => (
              <div key={item.label} className="fd-list-item space-y-1">
                <p className="fd-kicker text-[9px]">{item.label}</p>
                <p className="text-[11px] leading-relaxed text-fd-text-secondary">{item.value}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="fd-btn-ghost w-full justify-start px-0 py-0 text-[10px] text-fd-text-primary"
            aria-expanded={expandedContextStep === 'resume'}
            onClick={() => setExpandedContextStep((current) => (current === 'resume' ? null : 'resume'))}
          >
            {expandedContextStep === 'resume' ? 'Fechar curriculo' : 'Abrir curriculo'}
          </button>

          {expandedContextStep === 'resume' && (
            <div className="space-y-3">
              <ResumeAnalyzerCard analyzing={analyzingResume} onAnalyze={handleAnalyzeResume} trace={resumeTrace} />
              <p className="text-[10px] leading-relaxed text-fd-text-muted">
                Quando essa etapa terminar, a proxima recomendacao e revisar a vaga para ajustar perguntas e gaps.
              </p>
            </div>
          )}
        </div>

        <div
          data-tour-id="profile-job-analyzer"
          className="fd-card-soft rounded-[22px] p-4 space-y-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/12 text-[11px] font-black text-fd-text-primary">
                  2
                </span>
                <div>
                  <span className="fd-kicker text-[9px]">Segundo passo</span>
                  <h5 className="text-sm font-black text-fd-text-primary">Conecte a vaga</h5>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-fd-text-secondary">
                Cole a descricao para cruzar requisitos com o seu perfil e deixar a simulacao menos generica.
              </p>
            </div>
            <span
              className={`inline-flex min-h-10 items-center rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.18em] ${contextStatusClassName(jobContextStatus)}`}
            >
              {contextStatusLabel(jobContextStatus)}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {jobContextHighlights.map((item) => (
              <div key={item.label} className="fd-list-item space-y-1">
                <p className="fd-kicker text-[9px]">{item.label}</p>
                <p className="text-[11px] leading-relaxed text-fd-text-secondary">{item.value}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="fd-btn-ghost w-full justify-start px-0 py-0 text-[10px] text-fd-text-primary"
            aria-expanded={expandedContextStep === 'job'}
            onClick={() => setExpandedContextStep((current) => (current === 'job' ? null : 'job'))}
          >
            {expandedContextStep === 'job' ? 'Fechar vaga' : 'Abrir vaga'}
          </button>

          {expandedContextStep === 'job' && (
            <div className="space-y-3">
              <JobAnalyzerCard
                jobDescription={jobDescription}
                onJobDescriptionChange={setJobDescription}
                analyzing={analyzingJob}
                onAnalyze={handleAnalyzeJob}
                jobAnalysis={jobAnalysis}
                resumeMatch={resumeMatch}
                trace={jobTrace}
              />
              <p className="text-[10px] leading-relaxed text-fd-text-muted">
                Depois da vaga, use os ajustes manuais abaixo apenas para corrigir ou complementar o perfil.
              </p>
            </div>
          )}
        </div>
      </div>

      <form className="fd-card-shell p-4 space-y-4" data-tour-id="profile-candidate-form" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <h4 className="text-sm font-black text-fd-text-primary">Ajustes manuais do perfil</h4>
          <p className="text-[11px] leading-relaxed text-fd-text-secondary">
            Use este bloco para revisar o que veio do curriculo e da vaga, ou para preencher o que ainda estiver faltando.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1" htmlFor="candidate-target-role">
            <span className="fd-form-label text-[9px]">Cargo alvo</span>
            <input
              id="candidate-target-role"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="fd-input text-xs"
              placeholder="Frontend Engineer"
            />
          </label>
          <label className="space-y-1" htmlFor="candidate-experience-level">
            <span className="fd-form-label text-[9px]">Nivel de experiencia</span>
            <select
              id="candidate-experience-level"
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value)}
              className="fd-input text-xs"
            >
              {EXPERIENCE_OPTIONS.map((option) => (
                <option key={option.value || 'empty'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="space-y-2 block" htmlFor="candidate-primary-skills">
          <span className="fd-form-label text-[9px]">Skills principais</span>
          <input
            id="candidate-primary-skills"
            value={primarySkillsInput}
            onChange={(e) => setPrimarySkillsInput(e.target.value)}
            className="fd-input text-xs"
            placeholder="react, typescript, javascript"
          />
          <p className="text-[10px] text-fd-text-muted">Use virgulas para separar as tecnologias centrais.</p>
          {currentPrimarySkills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentPrimarySkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex min-h-8 items-center rounded-full border border-cyan-400/18 bg-cyan-400/10 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-fd-text-primary"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </label>

        <label className="space-y-2 block" htmlFor="candidate-weak-skills">
          <span className="fd-form-label text-[9px]">Skills para evoluir</span>
          <input
            id="candidate-weak-skills"
            value={weakSkillsInput}
            onChange={(e) => setWeakSkillsInput(e.target.value)}
            className="fd-input text-xs"
            placeholder="docker, system design, graphql"
          />
          <p className="text-[10px] text-fd-text-muted">Liste apenas o que voce quer reforcar nas proximas simulacoes.</p>
          {currentWeakSkills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentWeakSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex min-h-8 items-center rounded-full border border-amber-400/18 bg-amber-400/10 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-fd-text-primary"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </label>

        <label className="space-y-2 block" htmlFor="candidate-resume-summary">
          <span className="fd-form-label text-[9px]">Resumo profissional</span>
          <textarea
            id="candidate-resume-summary"
            value={resumeSummary}
            onChange={(e) => setResumeSummary(e.target.value)}
            rows={4}
            className="fd-textarea text-xs"
            placeholder="Explique em poucas linhas seu foco tecnico, stack principal e contexto mais recente."
          />
          <p className="text-[10px] text-fd-text-muted">
            Use este campo para resumir sua experiencia atual. Evite colar o curriculo inteiro.
          </p>
        </label>

        <button
          type="submit"
          disabled={saving || loadingProfile}
          data-tour-id="profile-save"
          className="fd-btn-primary w-full"
        >
          {saving ? 'Salvando...' : 'Salvar Perfil'}
        </button>
      </form>

      {analysisAudit.length > 0 && (
        <div className="fd-card-shell p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h4 className="fd-kicker text-[9px]">Auditoria de Analises</h4>
              <p className="text-[10px] leading-relaxed text-fd-text-secondary">
                Use este historico apenas para revisar a origem das ultimas analises de curriculo e vaga.
              </p>
            </div>
            <button
              type="button"
              className="fd-btn-secondary w-full px-4 py-0 text-[10px] sm:min-w-[132px] sm:w-auto"
              aria-expanded={isAuditExpanded}
              onClick={() => setIsAuditExpanded((current) => !current)}
            >
              {isAuditExpanded ? 'Ocultar' : 'Ver auditoria'}
            </button>
          </div>

          {isAuditExpanded && (
            <>
              <div className="space-y-2">
                {analysisAudit.map((event, index) => {
                  const timestamp = event.createdAt
                    ? new Date(event.createdAt).toLocaleString('pt-BR')
                    : 'sem data';
                  return (
                    <div
                      key={`${event.kind}-${event.createdAt}-${index}`}
                      className="fd-list-item"
                    >
                      <p className="text-[10px] text-fd-text-primary">
                        <span className="font-black uppercase">{event.kind}</span> | {sourceLabel(event.source)}
                      </p>
                      <p className="text-[10px] text-fd-text-secondary">
                        {event.aiProvider ? `${event.aiProvider}${event.aiModel ? ` / ${event.aiModel}` : ''}` : 'sem provider'}
                      </p>
                      <p className="text-[10px] text-fd-text-muted">{timestamp}</p>
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
                  className="fd-btn-secondary w-full"
                >
                  {auditLoading ? 'Carregando...' : 'Carregar mais'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default CandidateProfilePanel;
