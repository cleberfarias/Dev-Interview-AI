import type { AnswerEvaluation, FinalReport, InterviewConfig, InterviewPlan } from '../../../shared/types';
import type { DifficultyLevel, InterviewQuestion } from '../../../shared/types/interview';

export type UiQuestion = InterviewQuestion & {
  section?: string;
  sourceDifficulty?: number;
};

export type HistoryItem = {
  questionId: string;
  question: string;
  section?: string;
  difficulty?: number;
  evaluation: AnswerEvaluation;
};

const mapDifficultyToLevel = (value?: number): DifficultyLevel => {
  const diff = typeof value === 'number' ? value : 3;
  if (diff <= 2) return 1;
  if (diff <= 4) return 2;
  return 3;
};

const mapSectionToTopic = (section?: string): string => {
  switch ((section || '').toLowerCase()) {
    case 'design':
      return 'system_design';
    case 'technical':
      return 'algorithms';
    case 'behavioral':
      return 'default';
    case 'hr':
      return 'default';
    default:
      return 'scalability';
  }
};

const LOCAL_FALLBACK_QUESTIONS: Record<string, Record<string, string[]>> = {
  'pt-BR': {
    frontend: [
      'Como voce estruturaria um componente React para ser reutilizavel sem perder legibilidade?',
      'Quando usar memoizacao no frontend e quais sinais mostram que ela e necessaria?',
      'Como voce investigaria uma tela lenta em producao no navegador?',
      'Qual estrategia usaria para tratar estados de erro e loading em uma pagina complexa?',
      'Como voce organizaria testes para garantir confianca em um fluxo critico de UI?',
      'Como evitar regressao de performance em bundles grandes de frontend?',
    ],
    backend: [
      'Como voce desenharia um endpoint resiliente para picos de requisicoes?',
      'Quando escolheria fila assincrona em vez de processamento sincrono?',
      'Como faria observabilidade de uma API para reduzir MTTR?',
      'Qual estrategia usaria para lidar com concorrencia em escrita de dados?',
      'Como voce decidiria entre cache local, Redis e CDN?',
      'Como protegeria endpoints criticos contra abuso e replay?',
    ],
    default: [
      'Descreva um desafio tecnico recente e como voce decidiu a solucao.',
      'Como voce prioriza trade-offs entre prazo, qualidade e manutencao?',
      'Quais metricas voce acompanha para validar impacto de uma entrega?',
      'Como voce faria rollout seguro de uma mudanca com risco alto?',
      'Como voce se prepara para debugar problemas intermitentes em producao?',
      'Qual foi uma decisao tecnica dificil e o que voce aprendeu?',
    ],
  },
  en: {
    frontend: [
      'How would you structure a reusable React component without hurting readability?',
      'When should you use memoization in frontend and what signals indicate it?',
      'How would you investigate a slow production screen in the browser?',
      'How do you handle loading and error states in a complex page?',
      'How would you design tests for a critical UI flow?',
      'How do you prevent performance regressions in large frontend bundles?',
    ],
    backend: [
      'How would you design a resilient API endpoint for traffic spikes?',
      'When would you choose async queues over synchronous processing?',
      'How would you implement observability to reduce MTTR?',
      'What strategy would you use for concurrent write operations?',
      'How do you choose between in-memory cache, Redis and CDN?',
      'How would you protect critical endpoints from abuse and replay?',
    ],
    default: [
      'Describe a recent technical challenge and how you chose the solution.',
      'How do you prioritize trade-offs between speed, quality and maintenance?',
      'Which metrics do you track to validate delivery impact?',
      'How would you do a safe rollout for a high-risk change?',
      'How do you prepare to debug intermittent production issues?',
      'Tell me about a hard technical decision and what you learned.',
    ],
  },
  es: {
    frontend: [
      'Como estructurarias un componente React reutilizable sin perder claridad?',
      'Cuando usarias memoizacion en frontend y que senales lo justifican?',
      'Como investigarias una pantalla lenta en produccion en el navegador?',
      'Como manejas estados de carga y error en una pagina compleja?',
      'Como organizarias pruebas para un flujo critico de UI?',
      'Como evitas regresiones de rendimiento en bundles grandes?',
    ],
    backend: [
      'Como disenarias un endpoint resiliente para picos de trafico?',
      'Cuando elegirias colas asincronas sobre procesamiento sincrono?',
      'Como implementarias observabilidad para reducir MTTR?',
      'Que estrategia usarias para escrituras concurrentes?',
      'Como eliges entre cache local, Redis y CDN?',
      'Como protegerias endpoints criticos contra abuso y replay?',
    ],
    default: [
      'Describe un desafio tecnico reciente y como elegiste la solucion.',
      'Como priorizas trade-offs entre velocidad, calidad y mantenimiento?',
      'Que metricas sigues para validar impacto de una entrega?',
      'Como harias un rollout seguro para un cambio de alto riesgo?',
      'Como te preparas para depurar fallas intermitentes en produccion?',
      'Cuentame una decision tecnica dificil y que aprendiste.',
    ],
  },
};

export const getLocalFallbackPrompt = (track: string, language: string, index: number): string | null => {
  const byLanguage = LOCAL_FALLBACK_QUESTIONS[language] || LOCAL_FALLBACK_QUESTIONS['pt-BR'];
  const list = byLanguage[track] || byLanguage.default;
  if (!list?.length) return null;
  return list[index % list.length];
};

export const toUiQuestion = (
  question: { id?: string; prompt: string; section?: string; difficulty?: number },
  index: number,
  bullets: string[],
): UiQuestion => ({
  id: question.id || `q${index + 1}`,
  title: question.prompt,
  type: 'open',
  difficulty: mapDifficultyToLevel(question.difficulty),
  topic: mapSectionToTopic(question.section),
  bullets,
  section: question.section,
  sourceDifficulty: question.difficulty,
});

export const buildUiQuestions = (plan: InterviewPlan): UiQuestion[] => {
  const baseBullets = (plan.mustHaveSkills ?? []).slice(0, 3);
  return (plan.questions ?? []).map((question, index) => toUiQuestion(question, index, baseBullets));
};

const pickVariant = (items: string[], index: number): string => (items.length ? items[index % items.length] : '');

export const buildSpokenPrompt = (
  question: string,
  index: number,
  style: string,
  language: string,
  candidateName?: string,
): string => {
  const safeCandidateName = String(candidateName || '').trim();
  const withName = (value: string) => value.replace(/\{name\}/g, safeCandidateName);
  const script: Record<string, any> = {
    'pt-BR': {
      friendly: {
        introNamed: [
          '{name}, seja bem-vindo. Vamos comecar nossa entrevista.',
          '{name}, vamos iniciar com a primeira pergunta.',
        ],
        intro: ['Oi! Vamos comecar.', 'Tudo certo? Vamos iniciar.'],
        nextNamed: [
          'Perfeito, {name}. Posso fazer a proxima pergunta?',
          'Muito bom, {name}. Vamos seguir para a proxima pergunta?',
        ],
        next: ['Perfeito, posso fazer a proxima pergunta?', 'Certo, vamos para a proxima pergunta.'],
        suffix: ['Pode responder com tranquilidade.', 'Use exemplos concretos se fizer sentido.'],
      },
      neutral: {
        introNamed: ['{name}, vamos iniciar a entrevista.', '{name}, comecando agora.'],
        intro: ['Vamos iniciar a entrevista.', 'Comecando agora.'],
        nextNamed: [
          'Perfeito, {name}. Posso seguir para a proxima pergunta?',
          'Obrigado, {name}. Vamos para a proxima pergunta.',
        ],
        next: ['Perfeito, posso seguir para a proxima pergunta?', 'Proxima pergunta.'],
        suffix: ['Fique a vontade para pensar alguns segundos.', ''],
      },
      strict: {
        introNamed: ['{name}, vamos direto ao ponto.', '{name}, comecemos agora.'],
        intro: ['Vamos direto ao ponto.', 'Comecemos sem rodeios.'],
        nextNamed: [
          'Certo, {name}. Posso avancar para a proxima pergunta?',
          'Obrigado, {name}. Proxima pergunta.',
        ],
        next: ['Posso avancar para a proxima pergunta?', 'Proxima pergunta.'],
        suffix: ['Seja direto, mas traga contexto.', ''],
      },
    },
    en: {
      friendly: {
        introNamed: [
          '{name}, welcome. Let us start the interview.',
          '{name}, let us begin with the first question.',
        ],
        intro: ['Hi! Let us get started.', 'Ready? Let us begin.'],
        nextNamed: [
          'Perfect, {name}. May I ask the next question?',
          'Great, {name}. Let us move to the next question.',
        ],
        next: ['Perfect, may I ask the next question?', 'Great, next question.'],
        suffix: ['Take your time.', 'Use a concrete example if it helps.'],
      },
      neutral: {
        introNamed: ['{name}, starting the interview now.', '{name}, let us begin.'],
        intro: ['Starting the interview now.', 'Let us begin.'],
        nextNamed: [
          'Perfect, {name}. May I continue with the next question?',
          'Thank you, {name}. Moving to the next question.',
        ],
        next: ['Perfect, may I continue with the next question?', 'Next question.'],
        suffix: ['', 'Take a brief moment to think if needed.'],
      },
      strict: {
        introNamed: ['{name}, let us go straight to it.', '{name}, we will begin now.'],
        intro: ['Let us go straight to it.', 'We will begin now.'],
        nextNamed: [
          'All right, {name}. May I move to the next question?',
          'Thank you, {name}. Next question.',
        ],
        next: ['May I move to the next question?', 'Next question.'],
        suffix: ['Be concise, but keep it grounded in your experience.', ''],
      },
    },
    es: {
      friendly: {
        introNamed: [
          '{name}, bienvenido. Vamos a empezar la entrevista.',
          '{name}, empecemos con la primera pregunta.',
        ],
        intro: ['Hola, vamos a empezar.', 'Todo listo? Comencemos.'],
        nextNamed: [
          'Perfecto, {name}. Puedo hacer la siguiente pregunta?',
          'Muy bien, {name}. Vamos con la siguiente pregunta.',
        ],
        next: ['Perfecto, puedo hacer la siguiente pregunta?', 'Vamos con la siguiente pregunta.'],
        suffix: ['Toma tu tiempo.', 'Usa un ejemplo concreto si ayuda.'],
      },
      neutral: {
        introNamed: ['{name}, iniciamos la entrevista.', '{name}, empecemos ahora.'],
        intro: ['Iniciamos la entrevista.', 'Empecemos ahora.'],
        nextNamed: [
          'Perfecto, {name}. Puedo seguir con la siguiente pregunta?',
          'Gracias, {name}. Seguimos con la siguiente pregunta.',
        ],
        next: ['Perfecto, puedo seguir con la siguiente pregunta?', 'Siguiente pregunta.'],
        suffix: ['', 'Puedes pensar unos segundos si hace falta.'],
      },
      strict: {
        introNamed: ['{name}, vamos directo al punto.', '{name}, comencemos sin rodeos.'],
        intro: ['Vamos directo al punto.', 'Comencemos sin rodeos.'],
        nextNamed: [
          'Bien, {name}. Puedo avanzar a la siguiente pregunta?',
          'Gracias, {name}. Siguiente pregunta.',
        ],
        next: ['Puedo avanzar a la siguiente pregunta?', 'Siguiente pregunta.'],
        suffix: ['Se conciso, pero con contexto real.', ''],
      },
    },
  };

  const langKey = script[language] ? language : 'pt-BR';
  const styleKey = script[langKey][style] ? style : 'neutral';
  const variants = script[langKey][styleKey];
  const intro = safeCandidateName && Array.isArray(variants.introNamed)
    ? withName(pickVariant(variants.introNamed, index))
    : pickVariant(variants.intro, index);
  const next = safeCandidateName && Array.isArray(variants.nextNamed)
    ? withName(pickVariant(variants.nextNamed, index))
    : pickVariant(variants.next, index);
  const suffix = pickVariant(variants.suffix, index);
  const opener = index === 0 ? intro : next;
  const spacer = opener ? `${opener} ` : '';
  const tail = suffix ? ` ${suffix}` : '';
  return `${spacer}${question}${tail}`.trim();
};

export const buildNoResponsePrompt = (language: string): string => {
  const map: Record<string, string> = {
    'pt-BR': 'Nao detectei resposta. Voce quer continuar ou cancelar?',
    en: "I didn't detect a response. Do you want to continue or cancel?",
    es: 'No detecte respuesta. Quieres continuar o cancelar?',
  };
  return map[language] || map['pt-BR'];
};

export const deriveContextLabel = (
  question: UiQuestion | undefined,
  stacks: string[] = [],
): string | undefined => {
  if (!question) return undefined;
  const text = `${question.title} ${(question.bullets ?? []).join(' ')}`.toLowerCase();
  const keywordMap: Array<{ keywords: string[]; label: string }> = [
    { keywords: ['javascript', 'js'], label: 'JavaScript' },
    { keywords: ['typescript', 'ts'], label: 'TypeScript' },
    { keywords: ['react', 'jsx'], label: 'React' },
    { keywords: ['vue'], label: 'Vue' },
    { keywords: ['angular'], label: 'Angular' },
    { keywords: ['node', 'node.js', 'nodejs'], label: 'Node.js' },
    { keywords: ['api', 'rest', 'graphql'], label: 'APIs' },
    { keywords: ['cache', 'redis'], label: 'Cache' },
    { keywords: ['cdn'], label: 'CDN' },
    { keywords: ['load balancer', 'balanceamento'], label: 'Load Balancer' },
    { keywords: ['sql', 'banco de dados', 'database'], label: 'Banco de Dados' },
    { keywords: ['seguranca', 'oauth', 'jwt', 'auth'], label: 'Seguranca' },
  ];

  for (const entry of keywordMap) {
    if (entry.keywords.some((keyword) => text.includes(keyword))) {
      return entry.label;
    }
  }

  for (const stack of stacks) {
    const normalized = stack.toLowerCase();
    if (normalized && text.includes(normalized)) {
      return stack;
    }
  }

  if (question.topic) {
    return question.topic.replace(/_/g, ' ');
  }

  return undefined;
};

export const normalizeQuestionPrompt = (value?: string | null): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const summarizeScores = (history: HistoryItem[]) => {
  if (!history.length) return { overall: 0, summary: undefined, criteriaSummary: undefined };
  const totals = { communication: 0, technical: 0, problemSolving: 0, presence: 0 };
  const criteriaTotals = { clarity: 0, structure: 0, relevance: 0, technicalPrecision: 0, communication: 0 };
  let count = 0;
  let criteriaCount = 0;
  history.forEach((item) => {
    const scores = item.evaluation?.scores;
    if (!scores) return;
    totals.communication += scores.communication ?? 0;
    totals.technical += scores.technical ?? 0;
    totals.problemSolving += scores.problemSolving ?? 0;
    totals.presence += scores.presence ?? 0;
    count += 1;

    const criteria = item.evaluation?.criteriaScores;
    if (criteria) {
      criteriaTotals.clarity += criteria.clarity ?? 0;
      criteriaTotals.structure += criteria.structure ?? 0;
      criteriaTotals.relevance += criteria.relevance ?? 0;
      criteriaTotals.technicalPrecision += criteria.technicalPrecision ?? 0;
      criteriaTotals.communication += criteria.communication ?? 0;
      criteriaCount += 1;
    }
  });
  if (!count) return { overall: 0, summary: undefined, criteriaSummary: undefined };
  const summary = {
    communication: Number((totals.communication / count).toFixed(2)),
    technical: Number((totals.technical / count).toFixed(2)),
    problemSolving: Number((totals.problemSolving / count).toFixed(2)),
    presence: Number((totals.presence / count).toFixed(2)),
  };

  const criteriaSummary =
    criteriaCount > 0
      ? {
          clarity: Number((criteriaTotals.clarity / criteriaCount).toFixed(2)),
          structure: Number((criteriaTotals.structure / criteriaCount).toFixed(2)),
          relevance: Number((criteriaTotals.relevance / criteriaCount).toFixed(2)),
          technicalPrecision: Number((criteriaTotals.technicalPrecision / criteriaCount).toFixed(2)),
          communication: Number((criteriaTotals.communication / criteriaCount).toFixed(2)),
        }
      : undefined;

  const overall = criteriaSummary
    ? (
        (criteriaSummary.clarity +
          criteriaSummary.structure +
          criteriaSummary.relevance +
          criteriaSummary.technicalPrecision +
          criteriaSummary.communication) /
        5
      )
    : (summary.communication + summary.technical + summary.problemSolving + summary.presence) / 4;

  return { overall: Number(overall.toFixed(2)), summary, criteriaSummary };
};

export const buildFallbackReport = (
  history: HistoryItem[],
  config: InterviewConfig,
  plan: InterviewPlan,
): FinalReport => {
  const { overall, summary, criteriaSummary } = summarizeScores(history);
  const strengths = history.flatMap((item) => item.evaluation?.strengths ?? []);
  const improvements = history.flatMap((item) => item.evaluation?.improvements ?? []);
  return {
    overallScore: overall,
    levelEstimate: config.seniority,
    jobMatch: {
      covered: plan.mustHaveSkills ?? [],
      gaps: [],
    },
    feedback: {
      posture: [],
      communication: improvements.slice(0, 5),
      technical: strengths.slice(0, 5),
      language: [],
    },
    plan7Days: [],
    scoresSummary: summary,
    criteriaSummary,
  };
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler audio.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};
