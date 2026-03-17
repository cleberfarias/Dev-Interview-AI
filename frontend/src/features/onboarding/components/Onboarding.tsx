import React, { useState } from 'react';
import type {
  InterviewConfig,
  InterviewMode,
  InterviewStyle,
  LanguageCode,
  PlanType,
  Seniority,
  Track,
} from '../../../shared/types';
import { I18N, TRACKS, SENIORITIES, STACKS, STYLES, clampDuration, INTERVIEW_LIMITS } from '../../../shared/constants';
import styles from './Onboarding.module.css';

interface Props {
  onComplete: (config: InterviewConfig) => void;
  initialConfig: InterviewConfig;
}

const TRACK_LABELS: Record<Track, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Fullstack',
  mobile: 'Mobile',
  devops: 'DevOps',
  data: 'Data',
};

const SENIORITY_LABELS: Record<Seniority, string> = {
  intern: 'Estagio',
  junior: 'Junior',
  mid: 'Pleno',
  senior: 'Senior',
  staff: 'Staff',
};

const STYLE_LABELS: Record<InterviewStyle, string> = {
  friendly: 'Amigavel',
  neutral: 'Neutro',
  strict: 'Rigoroso',
};

const MODE_LABELS: Record<InterviewMode, string> = {
  candidate_coaching_mode: 'Coaching do candidato',
  hiring_assessment_mode: 'Avaliacao de contratacao',
};

const STEP_TITLES = [
  'Escolha os idiomas',
  'Selecione seu plano',
  'Defina sua carreira',
  'Tecnologias principais',
  'Estilo do entrevistador',
];

const STEP_HINTS = [
  'Configure como voce quer usar a plataforma.',
  'Escolha o tipo de experiencia da entrevista.',
  'Conte seu nivel e trilha principal.',
  'Selecione ate 5 stacks para personalizar as perguntas.',
  'Ajuste o comportamento da entrevista.',
];

const Onboarding: React.FC<Props> = ({ onComplete, initialConfig }) => {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<InterviewConfig>(initialConfig);
  const [isKeySelecting, setIsKeySelecting] = useState(false);
  const t = I18N[config.uiLanguage];

  const totalSteps = 4;
  const maxStacks = 5;

  const toggleStack = (stack: string) => {
    setConfig((prev) => {
      if (prev.stacks.includes(stack)) {
        return { ...prev, stacks: prev.stacks.filter((item) => item !== stack) };
      }
      if (prev.stacks.length >= maxStacks) {
        return prev;
      }
      return { ...prev, stacks: [...prev.stacks, stack] };
    });
  };

  const applyPlan = (plan: PlanType) => {
    const targetDuration = plan === 'pro' ? INTERVIEW_LIMITS.pro : INTERVIEW_LIMITS.free;
    setConfig((prev) => ({
      ...prev,
      plan,
      duration: clampDuration(targetDuration, plan),
    }));
  };

  const handleProSelection = async () => {
    setIsKeySelecting(true);
    try {
      if (window.aistudio?.openSelectKey) {
        await window.aistudio.openSelectKey();
        applyPlan('pro');
      }
    } catch (e) {
      console.error('Key selection failed', e);
    } finally {
      setIsKeySelecting(false);
    }
  };

  const nextStep = () => setStep((value) => Math.min(value + 1, totalSteps));
  const prevStep = () => setStep((value) => Math.max(value - 1, 0));

  const languages: { code: LanguageCode; label: string }[] = [
    { code: 'pt-BR', label: 'Portugues' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Espanol' },
  ];

  const isLastStep = step === totalSteps;

  const choiceButtonClass = (active: boolean) =>
    `${styles.choiceButton} ${active ? styles.choiceButtonActive : styles.choiceButtonIdle}`;

  return (
    <div className={styles.page}>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brandRow}>
            <div className={styles.logoBadge}>
              <img src="/img/logo.png" alt="Dev Interview AI" className="w-full h-full object-contain rounded-xl" />
            </div>
            <h1 className={styles.brandTitle}>
              Dev Interview <strong>AI</strong>
            </h1>
          </div>
          <h2 className={styles.heroTitle}>Vamos comecar!</h2>
          <p className={styles.heroSubtitle}>Preencha seu perfil para personalizar sua experiencia.</p>
        </header>

        <section className={styles.card}>
          <div className={styles.progressRow}>
            <div className={styles.progressDots}>
              {[0, 1, 2, 3, 4].map((index) => (
                <span
                  key={index}
                  className={`${styles.progressDot} ${step >= index ? styles.progressDotActive : ''}`}
                />
              ))}
            </div>
            <span className={styles.progressText}>{step + 1}/5</span>
          </div>

          <div className={styles.content}>
            <h3 className={styles.sectionTitle}>{STEP_TITLES[step]}</h3>
            <p className={styles.sectionHint}>{STEP_HINTS[step]}</p>

            {step === 0 && (
              <div className={styles.stackBlock}>
                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel}>{t.uiLang}</label>
                  <div className={styles.choiceGrid}>
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setConfig({ ...config, uiLanguage: lang.code })}
                        className={choiceButtonClass(config.uiLanguage === lang.code)}
                      >
                        <span>{lang.label}</span>
                        <span className={styles.choiceMeta}>{lang.code.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel}>{t.intLang}</label>
                  <div className={styles.choiceGrid}>
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setConfig({ ...config, interviewLanguage: lang.code })}
                        className={choiceButtonClass(config.interviewLanguage === lang.code)}
                      >
                        <span>{lang.label}</span>
                        <span className={styles.choiceMeta}>{lang.code.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className={styles.stackBlock}>
                <button
                  type="button"
                  onClick={() => applyPlan('free')}
                  className={`${styles.planCard} ${config.plan === 'free' ? styles.planCardActive : ''}`}
                >
                  <span className={styles.planTitle}>Plano Standard</span>
                  <span className={styles.planDescription}>Gratis, sessao objetiva com 10 minutos.</span>
                </button>

                <button
                  type="button"
                  onClick={handleProSelection}
                  disabled={isKeySelecting}
                  className={`${styles.planCard} ${config.plan === 'pro' ? styles.planCardActive : ''}`}
                >
                  <span className={styles.planTitle}>Plano Elite Pro</span>
                  <span className={styles.planDescription}>
                    Recursos avancados com a mesma sessao focada de 10 minutos.
                  </span>
                  {isKeySelecting && <span className={styles.loadingChip}>Conectando...</span>}
                </button>

                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel}>Modo da entrevista</label>
                  <div className={styles.stackBlock}>
                    {(['candidate_coaching_mode', 'hiring_assessment_mode'] as InterviewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setConfig({ ...config, interviewMode: mode })}
                        className={`${styles.planCard} ${config.interviewMode === mode ? styles.planCardActive : ''}`}
                      >
                        <span className={styles.planTitle}>{MODE_LABELS[mode]}</span>
                        <span className={styles.planDescription}>
                          {mode === 'candidate_coaching_mode'
                            ? 'Mostra insights parciais, feedback de comunicacao e sugestoes durante a resposta.'
                            : 'Mantem a entrevista em modo avaliativo, sem dicas ao vivo, para simular um processo seletivo.'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className={styles.stackBlock}>
                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel}>{t.seniority}</label>
                  <div className={styles.choiceGrid}>
                    {SENIORITIES.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setConfig({ ...config, seniority: level as Seniority })}
                        className={choiceButtonClass(config.seniority === level)}
                      >
                        {SENIORITY_LABELS[level as Seniority]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel}>{t.track}</label>
                  <div className={styles.choiceGrid}>
                    {TRACKS.map((track) => (
                      <button
                        key={track}
                        type="button"
                        onClick={() => setConfig({ ...config, track: track as Track })}
                        className={choiceButtonClass(config.track === track)}
                      >
                        {TRACK_LABELS[track as Track]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className={styles.stackBlock}>
                <div className={styles.stackInfo}>
                  <span>Stacks selecionadas</span>
                  <span>
                    {config.stacks.length}/{maxStacks}
                  </span>
                </div>
                <div className={styles.stackList}>
                  {STACKS.map((stack) => {
                    const active = config.stacks.includes(stack);
                    return (
                      <button
                        key={stack}
                        type="button"
                        onClick={() => toggleStack(stack)}
                        className={`${styles.stackChip} ${active ? styles.stackChipActive : ''}`}
                      >
                        {stack}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className={styles.styleGrid}>
                {STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setConfig({ ...config, style: style as InterviewStyle })}
                    className={`${styles.styleCard} ${config.style === style ? styles.styleCardActive : ''}`}
                  >
                    <span className={styles.styleName}>{STYLE_LABELS[style as InterviewStyle]}</span>
                    <span className={styles.styleDescription}>
                      {style === 'friendly'
                        ? 'Tom acolhedor e colaborativo.'
                        : style === 'neutral'
                          ? 'Tom equilibrado e objetivo.'
                          : 'Tom tecnico e exigente.'}
                    </span>
                  </button>
                ))}
              </div>
            )}

          </div>

          <div className={styles.footer}>
            {step > 0 && (
              <button type="button" onClick={prevStep} className={styles.backButton}>
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={isLastStep ? () => onComplete(config) : nextStep}
              className={styles.nextButton}
            >
              {isLastStep ? t.start : 'Continuar'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Onboarding;
