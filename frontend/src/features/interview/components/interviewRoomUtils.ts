import type {
  AnswerEvaluation,
  CommunicationAnalysis,
  FinalReport,
  InterviewConfig,
  InterviewPlan,
  SessionClientRuntimeTrace,
  SpeechMetrics,
} from '../../../shared/types';
import type { DifficultyLevel, InterviewQuestion } from '../../../shared/types/interview';

export type UiQuestion = InterviewQuestion & {
  section?: string;
  sourceDifficulty?: number;
};

export type HistoryItem = {
  answerId?: string;
  questionId: string;
  question: string;
  section?: string;
  difficulty?: number;
  evaluation?: AnswerEvaluation;
  transcript?: string;
  speechMetrics?: SpeechMetrics | null;
  communicationAnalysis?: CommunicationAnalysis | null;
  clientRuntime?: SessionClientRuntimeTrace | null;
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

const hashFallbackSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getLocalFallbackPrompt = (
  track: string,
  language: string,
  index: number,
  options: {
    askedPrompts?: Array<string | null | undefined>;
    seed?: string;
  } = {},
): string | null => {
  const byLanguage = LOCAL_FALLBACK_QUESTIONS[language] || LOCAL_FALLBACK_QUESTIONS['pt-BR'];
  const list = byLanguage[track] || byLanguage.default;
  if (!list?.length) return null;
  const askedPrompts = new Set(
    (options.askedPrompts || []).map((prompt) => normalizeQuestionPrompt(prompt)).filter(Boolean),
  );
  const startIndex = hashFallbackSeed(`${track}|${language}|${options.seed || 'local-fallback'}|${index}`) % list.length;

  for (let offset = 0; offset < list.length; offset += 1) {
    const candidate = list[(startIndex + offset) % list.length];
    if (!askedPrompts.has(normalizeQuestionPrompt(candidate))) {
      return candidate;
    }
  }

  return list[startIndex];
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

export type SpokenPromptContext = {
  track?: string;
  seniority?: string;
  stacks?: string[];
  now?: Date;
};

const dayGreeting = (language: string, now: Date): string => {
  const hour = now.getHours();
  if (language === 'en') {
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }
  if (language === 'es') {
    if (hour < 12) return 'Buenos dias';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const joinNaturally = (items: string[], language: string): string => {
  const values = items.map((item) => String(item || '').trim()).filter(Boolean);
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  const connector = language === 'en' ? 'and' : language === 'es' ? 'y' : 'e';
  if (values.length === 2) return `${values[0]} ${connector} ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} ${connector} ${values[values.length - 1]}`;
};

const TRACK_LABELS: Record<string, Record<string, string>> = {
  'pt-BR': {
    frontend: 'frontend',
    backend: 'backend',
    fullstack: 'full stack',
    mobile: 'mobile',
    devops: 'DevOps',
    data: 'dados',
  },
  en: {
    frontend: 'frontend',
    backend: 'backend',
    fullstack: 'full stack',
    mobile: 'mobile',
    devops: 'DevOps',
    data: 'data',
  },
  es: {
    frontend: 'frontend',
    backend: 'backend',
    fullstack: 'full stack',
    mobile: 'mobile',
    devops: 'DevOps',
    data: 'datos',
  },
};

const SENIORITY_LABELS: Record<string, Record<string, string>> = {
  'pt-BR': {
    intern: 'estagio',
    junior: 'junior',
    mid: 'pleno',
    senior: 'senior',
    staff: 'staff',
  },
  en: {
    intern: 'intern',
    junior: 'junior',
    mid: 'mid-level',
    senior: 'senior',
    staff: 'staff',
  },
  es: {
    intern: 'practicas',
    junior: 'junior',
    mid: 'semi senior',
    senior: 'senior',
    staff: 'staff',
  },
};

const describeProfileContext = (language: string, context: SpokenPromptContext): string => {
  const langKey = TRACK_LABELS[language] ? language : 'pt-BR';
  const track = TRACK_LABELS[langKey][String(context.track || '').trim()] || String(context.track || '').trim();
  const seniority =
    SENIORITY_LABELS[langKey][String(context.seniority || '').trim()] || String(context.seniority || '').trim();
  const stacks = (context.stacks || []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
  const stackList = joinNaturally(stacks, langKey);

  if (langKey === 'en') {
    if (track && seniority && stackList) {
      return `I saw that your focus today is ${track} at the ${seniority} level and that your main stack includes ${stackList}.`;
    }
    if (track && seniority) {
      return `I saw that your focus today is ${track} at the ${seniority} level.`;
    }
    if (track && stackList) {
      return `I saw that your focus today is ${track} and that your main stack includes ${stackList}.`;
    }
    if (track) {
      return `I saw that your focus today is ${track}.`;
    }
    if (stackList) {
      return `I saw that your main stack today includes ${stackList}.`;
    }
    if (seniority) {
      return `I saw that this interview is calibrated for the ${seniority} level.`;
    }
    return '';
  }

  if (langKey === 'es') {
    if (track && seniority && stackList) {
      return `Vi que tu foco hoy es ${track} en nivel ${seniority} y que tu stack principal incluye ${stackList}.`;
    }
    if (track && seniority) {
      return `Vi que tu foco hoy es ${track} en nivel ${seniority}.`;
    }
    if (track && stackList) {
      return `Vi que tu foco hoy es ${track} y que tu stack principal incluye ${stackList}.`;
    }
    if (track) {
      return `Vi que tu foco hoy es ${track}.`;
    }
    if (stackList) {
      return `Vi que tu stack principal hoy incluye ${stackList}.`;
    }
    if (seniority) {
      return `Vi que esta entrevista esta calibrada para el nivel ${seniority}.`;
    }
    return '';
  }

  if (track && seniority && stackList) {
    return `Vi que seu foco hoje e ${track} no nivel ${seniority} e que sua stack principal inclui ${stackList}.`;
  }
  if (track && seniority) {
    return `Vi que seu foco hoje e ${track} no nivel ${seniority}.`;
  }
  if (track && stackList) {
    return `Vi que seu foco hoje e ${track} e que sua stack principal inclui ${stackList}.`;
  }
  if (track) {
    return `Vi que seu foco hoje e ${track}.`;
  }
  if (stackList) {
    return `Vi que sua stack principal hoje inclui ${stackList}.`;
  }
  if (seniority) {
    return `Vi que esta entrevista esta calibrada para o nivel ${seniority}.`;
  }
  return '';
};

const OPENING_PROMPT_SCRIPTS: Record<string, Record<string, { firstBridge: string; firstClose: string }>> = {
  'pt-BR': {
    friendly: {
      firstBridge: 'Podemos iniciar nossa entrevista tecnica?',
      firstClose: 'Vamos comecar por esse contexto, tudo bem?',
    },
    neutral: {
      firstBridge: 'Vamos iniciar nossa entrevista tecnica.',
      firstClose: 'Vamos comecar.',
    },
    strict: {
      firstBridge: 'Vamos iniciar a entrevista tecnica.',
      firstClose: 'Vamos direto para a primeira pergunta.',
    },
  },
  en: {
    friendly: {
      firstBridge: 'Can we start our technical interview?',
      firstClose: 'Let us begin from that context, all right?',
    },
    neutral: {
      firstBridge: 'Let us start our technical interview.',
      firstClose: 'Let us begin.',
    },
    strict: {
      firstBridge: 'We are starting the technical interview now.',
      firstClose: 'Let us go to the first question.',
    },
  },
  es: {
    friendly: {
      firstBridge: 'Podemos iniciar nuestra entrevista tecnica?',
      firstClose: 'Vamos a empezar por ese contexto, de acuerdo?',
    },
    neutral: {
      firstBridge: 'Vamos a iniciar la entrevista tecnica.',
      firstClose: 'Vamos a empezar.',
    },
    strict: {
      firstBridge: 'Iniciamos la entrevista tecnica ahora.',
      firstClose: 'Vamos a la primera pregunta.',
    },
  },
};

const QUESTION_PROMPT_SCRIPTS: Record<
  string,
  Record<
    string,
    {
      firstLeadNamed: string;
      firstLead: string;
      nextNamed: string;
      next: string;
      lastNamed: string;
      last: string;
    }
  >
> = {
  'pt-BR': {
    friendly: {
      firstLeadNamed: '{name}, quero comecar com a seguinte pergunta:',
      firstLead: 'Quero comecar com a seguinte pergunta:',
      nextNamed: 'Perfeito, {name}. Seguindo a entrevista, aqui vai a proxima pergunta:',
      next: 'Perfeito. Seguindo a entrevista, aqui vai a proxima pergunta:',
      lastNamed: 'Perfeito, {name}. Estamos na ultima pergunta da entrevista:',
      last: 'Perfeito. Estamos na ultima pergunta da entrevista:',
    },
    neutral: {
      firstLeadNamed: '{name}, quero comecar com a seguinte pergunta:',
      firstLead: 'Quero comecar com a seguinte pergunta:',
      nextNamed: '{name}, vamos para a proxima pergunta:',
      next: 'Vamos para a proxima pergunta:',
      lastNamed: '{name}, vamos para a ultima pergunta da entrevista:',
      last: 'Vamos para a ultima pergunta da entrevista:',
    },
    strict: {
      firstLeadNamed: '{name}, primeira pergunta:',
      firstLead: 'Primeira pergunta:',
      nextNamed: '{name}, proxima pergunta:',
      next: 'Proxima pergunta:',
      lastNamed: '{name}, ultima pergunta:',
      last: 'Ultima pergunta:',
    },
  },
  en: {
    friendly: {
      firstLeadNamed: '{name}, I want to start with the following question:',
      firstLead: 'I want to start with the following question:',
      nextNamed: 'Perfect, {name}. Here is the next question:',
      next: 'Perfect. Here is the next question:',
      lastNamed: 'Perfect, {name}. We are at the final question of the interview:',
      last: 'Perfect. We are at the final question of the interview:',
    },
    neutral: {
      firstLeadNamed: '{name}, I want to start with the following question:',
      firstLead: 'I want to start with the following question:',
      nextNamed: '{name}, let us move to the next question:',
      next: 'Let us move to the next question:',
      lastNamed: '{name}, let us move to the final question of the interview:',
      last: 'Let us move to the final question of the interview:',
    },
    strict: {
      firstLeadNamed: '{name}, first question:',
      firstLead: 'First question:',
      nextNamed: '{name}, next question:',
      next: 'Next question:',
      lastNamed: '{name}, final question:',
      last: 'Final question:',
    },
  },
  es: {
    friendly: {
      firstLeadNamed: '{name}, quiero empezar con la siguiente pregunta:',
      firstLead: 'Quiero empezar con la siguiente pregunta:',
      nextNamed: 'Perfecto, {name}. Aqui va la siguiente pregunta:',
      next: 'Perfecto. Aqui va la siguiente pregunta:',
      lastNamed: 'Perfecto, {name}. Estamos en la ultima pregunta de la entrevista:',
      last: 'Perfecto. Estamos en la ultima pregunta de la entrevista:',
    },
    neutral: {
      firstLeadNamed: '{name}, quiero empezar con la siguiente pregunta:',
      firstLead: 'Quiero empezar con la siguiente pregunta:',
      nextNamed: '{name}, vamos con la siguiente pregunta:',
      next: 'Vamos con la siguiente pregunta:',
      lastNamed: '{name}, vamos con la ultima pregunta de la entrevista:',
      last: 'Vamos con la ultima pregunta de la entrevista:',
    },
    strict: {
      firstLeadNamed: '{name}, primera pregunta:',
      firstLead: 'Primera pregunta:',
      nextNamed: '{name}, siguiente pregunta:',
      next: 'Siguiente pregunta:',
      lastNamed: '{name}, ultima pregunta:',
      last: 'Ultima pregunta:',
    },
  },
};

const CLOSING_PROMPTS: Record<string, string> = {
  'pt-BR': 'Encerramos as perguntas. Estou consolidando seu relatorio final agora.',
  en: 'We have finished the questions. I am consolidating your final report now.',
  es: 'Hemos terminado las preguntas. Estoy consolidando tu informe final ahora.',
};

export const buildInterviewOpeningPrompt = (
  style: string,
  language: string,
  candidateName?: string,
  context: SpokenPromptContext = {},
): string => {
  const langKey = OPENING_PROMPT_SCRIPTS[language] ? language : 'pt-BR';
  const styleKey = OPENING_PROMPT_SCRIPTS[langKey][style] ? style : 'neutral';
  const safeCandidateName = String(candidateName || '').trim();
  const now = context.now instanceof Date ? context.now : new Date();
  const greeting = dayGreeting(langKey, now);
  const profileSummary = describeProfileContext(langKey, context);
  const introLine = safeCandidateName ? `${greeting}, ${safeCandidateName}.` : `${greeting}.`;
  const variants = OPENING_PROMPT_SCRIPTS[langKey][styleKey];

  return [introLine, variants.firstBridge, profileSummary, variants.firstClose].filter(Boolean).join(' ').trim();
};

export const buildInterviewOpeningRetryPrompt = (language: string, candidateName?: string): string => {
  const safeCandidateName = String(candidateName || '').trim();
  const prompts: Record<string, string> = {
    'pt-BR': safeCandidateName
      ? `${safeCandidateName}, nao consegui ouvir sua confirmacao. Quando estiver pronto, me responda com um sim rapido para iniciarmos.`
      : 'Nao consegui ouvir sua confirmacao. Quando estiver pronto, me responda com um sim rapido para iniciarmos.',
    en: safeCandidateName
      ? `${safeCandidateName}, I could not hear your confirmation. When you are ready, give me a quick yes so we can begin.`
      : 'I could not hear your confirmation. When you are ready, give me a quick yes so we can begin.',
    es: safeCandidateName
      ? `${safeCandidateName}, no pude escuchar tu confirmacion. Cuando estes listo, respondeme con un si rapido para empezar.`
      : 'No pude escuchar tu confirmacion. Cuando estes listo, respondeme con un si rapido para empezar.',
  };
  return prompts[language] || prompts['pt-BR'];
};

export const buildSpokenPrompt = (
  question: string,
  index: number,
  style: string,
  language: string,
  candidateName?: string,
  context: SpokenPromptContext = {},
  options: { isLastQuestion?: boolean } = {},
): string => {
  const safeQuestion = String(question || '').trim();
  if (!safeQuestion) return '';

  const langKey = QUESTION_PROMPT_SCRIPTS[language] ? language : 'pt-BR';
  const safeCandidateName = String(candidateName || '').trim();
  const styleKey = QUESTION_PROMPT_SCRIPTS[langKey][style] ? style : 'neutral';
  const variants = QUESTION_PROMPT_SCRIPTS[langKey][styleKey];
  const withName = (value: string) => value.replace(/\{name\}/g, safeCandidateName);

  if (index === 0) {
    const opening = buildInterviewOpeningPrompt(styleKey, langKey, safeCandidateName, context);
    const lead = safeCandidateName ? withName(variants.firstLeadNamed) : variants.firstLead;
    return [opening, lead, safeQuestion].filter(Boolean).join(' ').trim();
  }

  const nextLead = options.isLastQuestion
    ? safeCandidateName
      ? withName(variants.lastNamed)
      : variants.last
    : safeCandidateName
      ? withName(variants.nextNamed)
      : variants.next;
  return [nextLead, safeQuestion].filter(Boolean).join(' ').trim();
};

export const buildInterviewClosingPrompt = (language: string, candidateName?: string): string => {
  const langKey = CLOSING_PROMPTS[language] ? language : 'pt-BR';
  const safeCandidateName = String(candidateName || '').trim();
  if (!safeCandidateName) return CLOSING_PROMPTS[langKey];
  if (langKey === 'en') {
    return `${safeCandidateName}, we have finished the questions. I am consolidating your final report now.`;
  }
  if (langKey === 'es') {
    return `${safeCandidateName}, hemos terminado las preguntas. Estoy consolidando tu informe final ahora.`;
  }
  return `${safeCandidateName}, encerramos as perguntas. Estou consolidando seu relatorio final agora.`;
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
  options?: {
    reason?: 'fallback' | 'payment_required';
    warning?: string;
  },
): FinalReport => {
  const { overall, summary, criteriaSummary } = summarizeScores(history);
  const strengths = history.flatMap((item) => item.evaluation?.strengths ?? []);
  const improvements = history.flatMap((item) => item.evaluation?.improvements ?? []);
  const warning = String(options?.warning || '').trim();
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
    reportSource: 'local_fallback',
    reportStatus: options?.reason || 'fallback',
    reportWarnings: warning ? [warning] : [],
    communicationScore: {
      clarity: criteriaSummary?.clarity ?? summary?.communication ?? 0,
      fluency: criteriaSummary?.communication ?? summary?.communication ?? 0,
      confidence: criteriaSummary?.communication ?? summary?.communication ?? 0,
      conciseness: criteriaSummary?.structure ?? summary?.problemSolving ?? 0,
      structure: criteriaSummary?.structure ?? summary?.problemSolving ?? 0,
      overall,
    },
    communicationStrengths: strengths.slice(0, 3),
    communicationImprovements: improvements.slice(0, 3),
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
