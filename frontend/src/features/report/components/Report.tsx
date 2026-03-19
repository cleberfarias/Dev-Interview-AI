import React from 'react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { I18N } from '../../../shared/constants';
import type { FinalReport, InterviewConfig } from '../../../shared/types';
import styles from './Report.module.css';

interface Props {
  config: InterviewConfig;
  report: FinalReport;
  onBack?: () => void;
}

const scoreLabel = (score: number): string => {
  if (score >= 8.5) return 'Excelente trabalho!';
  if (score >= 7) return 'Boa evolucao!';
  if (score >= 5.5) return 'Bom com potencial de melhora';
  return 'Continue praticando';
};

const scoreText = (score: number): string => {
  if (score >= 8.5) return 'Sua performance foi forte e consistente em toda a entrevista.';
  if (score >= 7) return 'Voce demonstrou boa base tecnica e comunicacao clara.';
  if (score >= 5.5) return 'Ha sinais positivos, com pontos claros para evoluir rapido.';
  return 'Foque nos pontos de melhoria e pratique respostas estruturadas.';
};

const formatScore = (value: number): string => {
  const safe = Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 0;
  return safe.toFixed(1);
};

const Report: React.FC<Props> = ({ config, report, onBack }) => {
  const t = I18N[config.uiLanguage];
  const isHiringMode = config.interviewMode === 'hiring_assessment_mode';
  const overallScore = Number.isFinite(report.overallScore) ? Math.min(10, Math.max(0, report.overallScore)) : 0;
  const overallPercent = Math.round((overallScore / 10) * 100);

  const summary = report.scoresSummary;
  const criteria = report.criteriaSummary;
  const radarData = criteria
    ? [
        { subject: 'Clareza', A: criteria.clarity, fullMark: 10 },
        { subject: 'Estrutura', A: criteria.structure, fullMark: 10 },
        { subject: 'Relevancia', A: criteria.relevance, fullMark: 10 },
        { subject: 'Precisao Tec.', A: criteria.technicalPrecision, fullMark: 10 },
        { subject: 'Comunicacao', A: criteria.communication, fullMark: 10 },
      ]
    : [
        { subject: 'Comunicacao', A: summary?.communication ?? Math.max(3, overallScore + 1), fullMark: 10 },
        { subject: 'Tecnico', A: summary?.technical ?? Math.max(3, overallScore - 0.5), fullMark: 10 },
        { subject: 'Problemas', A: summary?.problemSolving ?? Math.max(3, overallScore + 0.8), fullMark: 10 },
        { subject: 'Postura', A: summary?.presence ?? Math.max(3, overallScore), fullMark: 10 },
      ];

  const technicalScore = summary?.technical ?? Math.max(3, overallScore - 0.5);
  const problemScore = summary?.problemSolving ?? Math.max(3, overallScore + 0.2);
  const communicationScore = summary?.communication ?? Math.max(3, overallScore + 0.4);

  const technicalFeedback = report.feedback?.technical || [];
  const communicationFeedback = report.feedback?.communication || [];
  const postureFeedback = report.feedback?.posture || [];

  const strengths = technicalFeedback.slice(0, 3);
  const improvements = communicationFeedback.slice(0, 3);
  const coachingTips = [...technicalFeedback, ...communicationFeedback, ...postureFeedback].slice(0, 4);
  const planSteps = (report.plan7Days || []).slice(0, 7);
  const behaviorTraits = report.behaviorProfile?.observedTraits || [];
  const cultureSignals = report.cultureFitSignals?.supportingSignals || [];

  const coveredSkills = report.jobMatch?.covered || [];
  const gapSkills = report.jobMatch?.gaps || [];
  const highlightSkills = coveredSkills.length > 0 ? coveredSkills.slice(0, 4) : (config.stacks || []).slice(0, 4);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    window.location.reload();
  };

  return (
    <div className={styles.page}>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.topBar}>
          <div className={styles.brandRow}>
            <div className={styles.logoBadge}>
              <img src="/img/logo.png" alt="Dev Interview AI" className="w-full h-full object-contain rounded-xl" />
            </div>
            <h1 className={styles.brandTitle}>
              Dev Interview <strong>AI</strong>
            </h1>
          </div>

          <div className={styles.profileChip}>
            <span className={styles.profileDot}>R</span>
            <span>Relatorio</span>
          </div>
        </header>

        <section className={styles.heroTitle}>
          <h2>Relatorio da Entrevista</h2>
          <p>
            {isHiringMode
              ? 'Confira sua performance, sinais comportamentais e evidencias da sessao avaliativa.'
              : 'Confira sua performance, feedbacks e proximos passos.'}
          </p>
        </section>

        <div className={styles.layout}>
          <section className={styles.mainCard}>
            <div className={styles.scoreHeader} data-tour-id="report-score">
              <div className={styles.scoreIntro}>
                <p className={styles.kicker}>{t.overall}</p>
                <h3>{scoreLabel(overallScore)}</h3>
                <p className={styles.scoreText}>{scoreText(overallScore)}</p>
              </div>

              <div className={styles.scoreVisual}>
                <div
                  className={styles.scoreRing}
                  style={{
                    background: `conic-gradient(#64eeff ${overallPercent}%, rgba(93, 112, 222, 0.28) ${overallPercent}% 100%)`,
                  }}
                >
                  <div className={styles.scoreCore}>
                    <strong>{formatScore(overallScore)}</strong>
                    <span>de 10</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.studyButton}
                onClick={() => {
                  const target = document.getElementById('study-plan');
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
              >
                Ver plano de estudo
              </button>
            </div>

            <div className={styles.breakdownGrid}>
              <article className={styles.metricCard}>
                <strong>{formatScore(technicalScore)}</strong>
                <span>Tecnico</span>
              </article>
              <article className={styles.metricCard}>
                <strong>{formatScore(problemScore)}</strong>
                <span>Resolucao de problemas</span>
              </article>
              <article className={styles.metricCard}>
                <strong>{formatScore(communicationScore)}</strong>
                <span>Comunicacao</span>
              </article>
            </div>

            <div className={styles.insightGrid} data-tour-id="report-feedback">
              <article className={styles.insightPanel}>
                <h4 className={styles.insightTitle}>{t.strengths}</h4>
                <ul className={styles.insightList}>
                  {strengths.length === 0 && <li className={styles.emptyText}>Sem pontos registrados.</li>}
                  {strengths.map((item, index) => (
                    <li key={`strength-${index}`}>
                      <span className={styles.bulletOk}>OK</span>
                      <p>{item}</p>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={styles.insightPanel}>
                <h4 className={styles.insightTitle}>{t.improvements}</h4>
                <ul className={styles.insightList}>
                  {improvements.length === 0 && <li className={styles.emptyText}>Sem pontos registrados.</li>}
                  {improvements.map((item, index) => (
                    <li key={`improvement-${index}`}>
                      <span className={styles.bulletWarn}>UP</span>
                      <p>{item}</p>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            {(report.behaviorProfile || report.cultureFitSignals) && (
              <div className={styles.insightGrid}>
                <article className={styles.insightPanel}>
                  <h4 className={styles.insightTitle}>Perfil comportamental</h4>
                  <ul className={styles.insightList}>
                    {report.behaviorProfile?.summary && (
                      <li>
                        <span className={styles.bulletOk}>OK</span>
                        <p>{report.behaviorProfile.summary}</p>
                      </li>
                    )}
                    {behaviorTraits.length === 0 && <li className={styles.emptyText}>Sem sinais suficientes.</li>}
                    {behaviorTraits.map((trait, index) => (
                      <li key={`behavior-${index}`}>
                        <span className={styles.bulletOk}>OK</span>
                        <p>{trait}</p>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className={styles.insightPanel}>
                  <h4 className={styles.insightTitle}>Culture fit</h4>
                  <ul className={styles.insightList}>
                    {report.cultureFitSignals?.summary && (
                      <li>
                        <span className={styles.bulletWarn}>UP</span>
                        <p>{report.cultureFitSignals.summary}</p>
                      </li>
                    )}
                    {cultureSignals.length === 0 && <li className={styles.emptyText}>Sem sinais suficientes.</li>}
                    {cultureSignals.map((signal, index) => (
                      <li key={`culture-${index}`}>
                        <span className={styles.bulletWarn}>UP</span>
                        <p>{signal}</p>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            )}
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.sideCard}>
              <h3 className={styles.sideTitle}>
                {isHiringMode ? 'Avaliacao e evidencias' : 'Coaching e feedback'}
              </h3>
              <div className={styles.sideScores}>
                <div className={styles.scoreLine}>
                  <span>Qualidade da resposta</span>
                  <strong>{formatScore(technicalScore)}</strong>
                </div>
                <div className={styles.scoreLine}>
                  <span>Confianca ao falar</span>
                  <strong>{formatScore(communicationScore)}</strong>
                </div>
              </div>

              <ul className={styles.tipsList}>
                {coachingTips.length === 0 && <li>Nenhuma dica adicional neste momento.</li>}
                {coachingTips.map((tip, index) => (
                  <li key={`tip-${index}`}>{tip}</li>
                ))}
              </ul>
            </section>

            <section className={styles.sideCard}>
              <h3 className={styles.sideTitle}>Analise de skills</h3>
              <div className={styles.radarWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                    <PolarGrid stroke="rgba(124, 171, 255, 0.35)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9fd6ff', fontSize: 10, fontWeight: 700 }} />
                    <Radar
                      name="Performance"
                      dataKey="A"
                      stroke="#62f0ff"
                      fill="#7f68ff"
                      fillOpacity={0.42}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className={styles.tagRow}>
                {highlightSkills.map((skill) => (
                  <span key={`highlight-${skill}`} className={styles.tagOk}>
                    {skill}
                  </span>
                ))}
                {highlightSkills.length === 0 && <span className={styles.emptyText}>Sem stack destacada.</span>}
              </div>
            </section>

            <button type="button" className={styles.retryButton} onClick={handleBack} data-tour-id="report-retry">
              Praticar novamente
            </button>
          </aside>
        </div>

        <section id="study-plan" className={styles.planCard} data-tour-id="report-study-plan">
          <div className={styles.planHeader}>
            <h3>{t.trainingPlan}</h3>
            <p>Roteiro objetivo para evoluir no proximo ciclo.</p>
          </div>

          <div className={styles.planList}>
            {planSteps.length === 0 && (
              <div className={styles.emptyText}>Nao foi gerado um plano de estudo nesta entrevista.</div>
            )}
            {planSteps.map((step) => (
              <article key={step.day} className={styles.planItem}>
                <span className={styles.dayBadge}>Dia {step.day}</span>
                <p>{step.task}</p>
              </article>
            ))}
          </div>
        </section>

        {config.jobDescription && (
          <section className={styles.matchCard}>
            <h3>{t.jobMatch}</h3>

            <div className={styles.matchGrid}>
              <div className={styles.matchBlock}>
                <p className={styles.blockLabel}>{t.covered}</p>
                <div className={styles.chipsRow}>
                  {coveredSkills.length === 0 && <span className={styles.emptyText}>Nenhuma habilidade coberta.</span>}
                  {coveredSkills.map((skill) => (
                    <span key={`covered-${skill}`} className={styles.chipPositive}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.matchBlock}>
                <p className={styles.blockLabel}>{t.gaps}</p>
                <div className={styles.chipsRow}>
                  {gapSkills.length === 0 && <span className={styles.emptyText}>Nenhum gap detectado.</span>}
                  {gapSkills.map((skill) => (
                    <span key={`gap-${skill}`} className={styles.chipNegative}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Report;
