export type InterviewFlowState =
  | 'idle'
  | 'asking'
  | 'awaiting_answer'
  | 'recording'
  | 'evaluating'
  | 'finalizing'
  | 'no_response'
  | 'next_question'
  | 'finished';

export type ConversationState = 'idle' | 'listening' | 'processing' | 'ai_speaking' | 'candidate_speaking';

export type RuntimeTone = 'idle' | 'active' | 'warning' | 'done';

export interface RuntimeStatusItem {
  label: string;
  value: string;
  tone: RuntimeTone;
}

export interface RuntimeMetricItem {
  label: string;
  value: string;
  tone: RuntimeTone;
  hint?: string;
}

export interface RuntimeSignalItem {
  label: string;
  value: string;
  tone: RuntimeTone;
}

export interface RuntimeTimelineItem {
  key: 'opening' | 'question' | 'answer' | 'analysis' | 'fallback';
  label: string;
  tone: RuntimeTone;
}

export interface InterviewRuntimeStateInput {
  flowState: InterviewFlowState;
  conversationState: ConversationState;
  isOpeningStep: boolean;
  isTextMode: boolean;
  isFinished: boolean;
  isMediaReady: boolean;
  isMicrophoneReady: boolean;
  isCandidateCoachingMode: boolean;
  questionAudioFallbackActive: boolean;
  runtimeNotice?: string | null;
  timeLimitReached: boolean;
  textEntryEnabled: boolean;
  candidateFirstName: string;
  audioCaptureState?: string;
  audioUploadState?: string;
  pendingChunkCount: number;
  partialTranscriptActive: boolean;
  partialFeedbackVisible: boolean;
  showLiveCoachPanel: boolean;
  liveCoachLoading: boolean;
  liveCoachError?: string | null;
  hasLiveCoachInsight: boolean;
  liveCoachFeedCount: number;
  currentQuestionIndex: number;
  totalQuestions: number;
  stageElapsedMs: number;
  sessionElapsedSeconds: number;
  questionDeliveryLatencyMs?: number | null;
  analysisLatencyMs?: number | null;
}

export interface InterviewRuntimeStateViewModel {
  headline: string;
  summary: string;
  tone: RuntimeTone;
  statuses: RuntimeStatusItem[];
  metrics: RuntimeMetricItem[];
  signals: RuntimeSignalItem[];
  timeline: RuntimeTimelineItem[];
}

const formatCandidateLabel = (name: string) => {
  const normalized = String(name || '').trim();
  return normalized || 'Candidato';
};

const formatDurationMs = (value: number): string => {
  const safeValue = Math.max(0, value || 0);
  if (safeValue < 1000) return '<1s';
  if (safeValue < 60000) return `${(safeValue / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(safeValue / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};

const formatDurationSeconds = (value: number): string => {
  const safeValue = Math.max(0, Math.round(value || 0));
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const stageLabelMap: Record<'opening' | 'question' | 'answer' | 'analysis', string> = {
  opening: 'abertura',
  question: 'pergunta',
  answer: 'resposta',
  analysis: 'analise',
};

const getLatencyTone = (value?: number | null): RuntimeTone => {
  if (value == null) return 'idle';
  if (value <= 2500) return 'done';
  if (value <= 6000) return 'active';
  return 'warning';
};

const deriveAudioStatus = (input: InterviewRuntimeStateInput): RuntimeStatusItem => {
  if (input.isTextMode) {
    return {
      label: 'Audio',
      value: 'modo texto',
      tone: input.questionAudioFallbackActive ? 'warning' : 'idle',
    };
  }
  if (input.questionAudioFallbackActive) {
    return { label: 'Audio', value: 'fallback em texto', tone: 'warning' };
  }
  if (input.audioCaptureState === 'paused') {
    return { label: 'Audio', value: 'gravacao pausada', tone: 'warning' };
  }
  if (input.audioUploadState === 'retry_pending') {
    return { label: 'Audio', value: 'reenvio pendente', tone: 'warning' };
  }
  if (input.audioUploadState === 'uploading') {
    return { label: 'Audio', value: 'enviando chunks', tone: 'active' };
  }
  if (!input.isMicrophoneReady || !input.isMediaReady) {
    return { label: 'Audio', value: 'permissao pendente', tone: 'warning' };
  }
  if (input.flowState === 'recording' || input.conversationState === 'candidate_speaking') {
    return { label: 'Audio', value: 'capturando resposta', tone: 'active' };
  }
  return { label: 'Audio', value: 'captura pronta', tone: 'done' };
};

const deriveCoachStatus = (input: InterviewRuntimeStateInput): RuntimeStatusItem => {
  if (!input.isCandidateCoachingMode) {
    return { label: 'Coach', value: 'desligado', tone: 'idle' };
  }
  if (input.liveCoachError) {
    return { label: 'Coach', value: 'indisponivel', tone: 'warning' };
  }
  if (input.liveCoachLoading) {
    return { label: 'Coach', value: 'analisando', tone: 'active' };
  }
  if (input.partialFeedbackVisible || input.hasLiveCoachInsight || input.showLiveCoachPanel) {
    return { label: 'Coach', value: 'assistindo ao vivo', tone: 'done' };
  }
  return { label: 'Coach', value: 'em espera', tone: 'idle' };
};

const deriveInterviewerStatus = (input: InterviewRuntimeStateInput): RuntimeStatusItem => {
  if (input.isFinished) {
    return { label: 'Entrevistadora', value: 'sessao concluida', tone: 'done' };
  }
  if (input.conversationState === 'ai_speaking' || input.flowState === 'asking') {
    return { label: 'Entrevistadora', value: 'conduzindo a pergunta', tone: 'active' };
  }
  if (
    input.conversationState === 'processing' ||
    input.flowState === 'evaluating' ||
    input.flowState === 'next_question' ||
    input.flowState === 'finalizing'
  ) {
    return { label: 'Entrevistadora', value: 'pensando na proxima etapa', tone: 'active' };
  }
  if (input.isOpeningStep || input.flowState === 'idle') {
    return { label: 'Entrevistadora', value: 'alinhando a abertura', tone: 'idle' };
  }
  return { label: 'Entrevistadora', value: 'aguardando sua resposta', tone: 'done' };
};

const deriveCandidateStatus = (input: InterviewRuntimeStateInput): RuntimeStatusItem => {
  const candidate = formatCandidateLabel(input.candidateFirstName);
  if (input.isFinished) {
    return { label: candidate, value: 'entrevista encerrada', tone: 'done' };
  }
  if (input.flowState === 'no_response') {
    return { label: candidate, value: 'sem resposta detectada', tone: 'warning' };
  }
  if (input.flowState === 'recording' || input.conversationState === 'candidate_speaking') {
    return {
      label: candidate,
      value: input.isTextMode ? 'digitando resposta' : 'respondendo em voz',
      tone: 'active',
    };
  }
  if (input.flowState === 'awaiting_answer' || input.conversationState === 'listening') {
    return {
      label: candidate,
      value: input.isTextMode && input.textEntryEnabled ? 'pronto para digitar' : 'pronto para responder',
      tone: 'done',
    };
  }
  return { label: candidate, value: 'em espera', tone: 'idle' };
};

const derivePrimaryMoment = (input: InterviewRuntimeStateInput): {
  headline: string;
  summary: string;
  tone: RuntimeTone;
  activeStage: 'opening' | 'question' | 'answer' | 'analysis';
  fallbackActive: boolean;
} => {
  const fallbackActive =
    Boolean(input.runtimeNotice) ||
    input.questionAudioFallbackActive ||
    input.audioUploadState === 'retry_pending' ||
    input.flowState === 'no_response' ||
    input.timeLimitReached ||
    (!input.isTextMode && (!input.isMicrophoneReady || !input.isMediaReady));

  if (input.isFinished || input.flowState === 'finished') {
    return {
      headline: 'Entrevista encerrada',
      summary: 'Sessao concluida com material pronto para relatorio, auditoria e proximo ciclo de treino.',
      tone: 'done',
      activeStage: 'analysis',
      fallbackActive: false,
    };
  }

  if (fallbackActive) {
    return {
      headline: 'Modo de contingencia ativo',
      summary:
        input.runtimeNotice ||
        (input.questionAudioFallbackActive
          ? 'O audio caiu para fallback. A pergunta continua disponivel por texto para nao travar a sessao.'
          : input.flowState === 'no_response'
            ? 'Nao houve resposta suficiente. O sistema esta pronto para repetir a pergunta ou encerrar com seguranca.'
            : 'A sessao encontrou uma pendencia operacional e priorizou estabilidade antes de seguir.'),
      tone: 'warning',
      activeStage:
        input.flowState === 'recording' || input.conversationState === 'candidate_speaking'
          ? 'answer'
          : input.conversationState === 'processing' || input.flowState === 'evaluating'
            ? 'analysis'
            : 'question',
      fallbackActive: true,
    };
  }

  if (input.flowState === 'finalizing') {
    return {
      headline: 'Fechando a sessao',
      summary: 'A IA esta consolidando o fechamento da entrevista e preparando a entrega final.',
      tone: 'active',
      activeStage: 'analysis',
      fallbackActive: false,
    };
  }

  if (
    input.conversationState === 'processing' ||
    input.flowState === 'evaluating' ||
    input.flowState === 'next_question'
  ) {
    return {
      headline: 'IA processando a proxima etapa',
      summary: 'A resposta atual esta sendo analisada para ajustar a proxima pergunta e preservar o ritmo da entrevista.',
      tone: 'active',
      activeStage: 'analysis',
      fallbackActive: false,
    };
  }

  if (input.conversationState === 'ai_speaking' || input.flowState === 'asking') {
    return {
      headline: 'Entrevistadora conduzindo a pergunta',
      summary: 'A pergunta esta sendo entregue para manter a simulacao fluida e com ritmo de entrevista real.',
      tone: 'active',
      activeStage: 'question',
      fallbackActive: false,
    };
  }

  if (input.flowState === 'recording' || input.conversationState === 'candidate_speaking') {
    return {
      headline: input.isTextMode ? 'Resposta em texto em andamento' : 'Resposta em voz em andamento',
      summary: input.isCandidateCoachingMode
        ? 'Sua resposta esta em curso. O sistema acompanha sinais de clareza, contexto e profundidade.'
        : 'Sua resposta esta em curso. O sistema registra evidencias para a avaliacao final.',
      tone: 'active',
      activeStage: 'answer',
      fallbackActive: false,
    };
  }

  if (input.flowState === 'awaiting_answer' || input.conversationState === 'listening') {
    return {
      headline: 'Aguardando sua resposta',
      summary: input.isTextMode
        ? 'A pergunta ja foi entregue e o campo de texto esta pronto para receber sua resposta.'
        : 'A pergunta ja foi entregue. Inicie sua resposta quando estiver pronto.',
      tone: 'done',
      activeStage: 'answer',
      fallbackActive: false,
    };
  }

  return {
    headline: 'Preparando a abertura',
    summary: 'A sessao esta alinhando contexto inicial, dispositivos e o primeiro passo da entrevista.',
    tone: 'idle',
    activeStage: 'opening',
    fallbackActive: false,
  };
};

const deriveTransportMetric = (input: InterviewRuntimeStateInput): RuntimeMetricItem => {
  if (input.isTextMode) {
    return {
      label: 'Transporte',
      value: input.questionAudioFallbackActive ? 'texto em contingencia' : 'texto direto',
      tone: input.questionAudioFallbackActive ? 'warning' : 'idle',
      hint: 'Sem dependencias de captura de audio nesta etapa.',
    };
  }

  if (input.questionAudioFallbackActive) {
    return {
      label: 'Transporte',
      value: 'fallback em texto',
      tone: 'warning',
      hint: 'A pergunta segue por texto para evitar travar a sessao.',
    };
  }

  if (input.audioCaptureState === 'paused') {
    return {
      label: 'Transporte',
      value: 'gravacao pausada',
      tone: 'warning',
      hint: 'Retome a captura para voltar ao fluxo normal.',
    };
  }

  if (input.audioUploadState === 'retry_pending') {
    return {
      label: 'Transporte',
      value: 'retry de upload',
      tone: 'warning',
      hint: 'Existe audio aguardando novo envio.',
    };
  }

  if (input.audioUploadState === 'uploading') {
    return {
      label: 'Transporte',
      value: 'upload de audio',
      tone: 'active',
      hint: 'Chunks locais estao sendo sincronizados.',
    };
  }

  if (input.pendingChunkCount > 0) {
    return {
      label: 'Transporte',
      value: `${input.pendingChunkCount} chunk(s) na fila`,
      tone: 'active',
      hint: 'Ainda existe buffer local aguardando flush.',
    };
  }

  if (!input.isMicrophoneReady || !input.isMediaReady) {
    return {
      label: 'Transporte',
      value: 'permissao pendente',
      tone: 'warning',
      hint: 'Camera ou microfone ainda nao ficaram prontos.',
    };
  }

  if (input.flowState === 'recording' || input.conversationState === 'candidate_speaking') {
    return {
      label: 'Transporte',
      value: 'stream local ativo',
      tone: 'active',
      hint: 'A resposta esta sendo capturada em tempo real.',
    };
  }

  if (input.flowState === 'asking' || input.conversationState === 'ai_speaking') {
    return {
      label: 'Transporte',
      value: 'avatar/tts em saida',
      tone: 'active',
      hint: 'A entrega da pergunta esta em curso.',
    };
  }

  return {
    label: 'Transporte',
    value: 'canal pronto',
    tone: 'done',
    hint: 'Audio e transicao estao prontos para o proximo passo.',
  };
};

const deriveProgressMetric = (input: InterviewRuntimeStateInput): RuntimeMetricItem => {
  const total = Math.max(0, input.totalQuestions || 0);
  if (input.isOpeningStep) {
    return {
      label: 'Progresso',
      value: total > 0 ? `abertura • 0/${total}` : 'abertura',
      tone: 'idle',
      hint: 'A entrevista ainda esta na confirmacao inicial.',
    };
  }

  const current = total > 0 ? Math.min(total, Math.max(1, input.currentQuestionIndex + 1)) : input.currentQuestionIndex + 1;
  const tone: RuntimeTone = input.isFinished ? 'done' : 'active';
  return {
    label: 'Progresso',
    value: total > 0 ? `${current}/${total}` : String(current),
    tone,
    hint: total > 0 ? `${Math.round((current / total) * 100)}% da trilha atual.` : 'Turno atual em andamento.',
  };
};

const deriveAvatarSignal = (input: InterviewRuntimeStateInput): RuntimeSignalItem => {
  if (input.isFinished) {
    return { label: 'Avatar', value: 'encerrado', tone: 'done' };
  }
  if (input.conversationState === 'ai_speaking' || input.flowState === 'asking') {
    return { label: 'Avatar', value: 'voz ativa', tone: 'active' };
  }
  if (
    input.conversationState === 'processing' ||
    input.flowState === 'evaluating' ||
    input.flowState === 'next_question' ||
    input.flowState === 'finalizing'
  ) {
    return { label: 'Avatar', value: 'pensando', tone: 'active' };
  }
  if (input.conversationState === 'listening' || input.flowState === 'awaiting_answer') {
    return { label: 'Avatar', value: 'em escuta', tone: 'done' };
  }
  return { label: 'Avatar', value: 'em espera', tone: 'idle' };
};

const deriveCoachSignal = (input: InterviewRuntimeStateInput): RuntimeSignalItem => {
  if (!input.isCandidateCoachingMode) {
    return { label: 'Coach', value: 'desligado', tone: 'idle' };
  }
  if (input.liveCoachError) {
    return { label: 'Coach', value: 'erro', tone: 'warning' };
  }
  if (input.liveCoachLoading) {
    return { label: 'Coach', value: 'analisando', tone: 'active' };
  }
  if (input.partialFeedbackVisible || input.partialTranscriptActive) {
    return { label: 'Coach', value: 'parcial ao vivo', tone: 'done' };
  }
  if (input.liveCoachFeedCount > 0 || input.hasLiveCoachInsight || input.showLiveCoachPanel) {
    return { label: 'Coach', value: 'historico pronto', tone: 'done' };
  }
  return { label: 'Coach', value: 'em espera', tone: 'idle' };
};

export const deriveInterviewRuntimeState = (
  input: InterviewRuntimeStateInput,
): InterviewRuntimeStateViewModel => {
  const primaryMoment = derivePrimaryMoment(input);
  const order: Array<'opening' | 'question' | 'answer' | 'analysis'> = ['opening', 'question', 'answer', 'analysis'];
  const activeIndex = order.indexOf(primaryMoment.activeStage);

  return {
    headline: primaryMoment.headline,
    summary: primaryMoment.summary,
    tone: primaryMoment.tone,
    statuses: [
      deriveInterviewerStatus(input),
      deriveCandidateStatus(input),
      deriveAudioStatus(input),
      deriveCoachStatus(input),
    ],
    metrics: [
      {
        label: 'Etapa atual',
        value: formatDurationMs(input.stageElapsedMs),
        tone: primaryMoment.tone,
        hint: `Estado ${stageLabelMap[primaryMoment.activeStage]} em foco.`,
      },
      {
        label: 'Sessao',
        value: formatDurationSeconds(input.sessionElapsedSeconds),
        tone: input.isFinished ? 'done' : 'idle',
        hint: 'Tempo decorrido desde a abertura da sala.',
      },
      deriveTransportMetric(input),
      deriveProgressMetric(input),
    ],
    signals: [
      {
        label: 'Entrega',
        value: input.questionDeliveryLatencyMs != null ? formatDurationMs(input.questionDeliveryLatencyMs) : 'sem amostra',
        tone: getLatencyTone(input.questionDeliveryLatencyMs),
      },
      {
        label: 'Analise',
        value: input.analysisLatencyMs != null ? formatDurationMs(input.analysisLatencyMs) : 'sem amostra',
        tone: getLatencyTone(input.analysisLatencyMs),
      },
      deriveAvatarSignal(input),
      deriveCoachSignal(input),
    ],
    timeline: [
      { key: 'opening', label: 'Abertura', tone: input.isFinished ? 'done' : activeIndex > 0 ? 'done' : primaryMoment.activeStage === 'opening' ? primaryMoment.tone : 'idle' },
      { key: 'question', label: 'Pergunta', tone: input.isFinished ? 'done' : activeIndex > 1 ? 'done' : primaryMoment.activeStage === 'question' ? primaryMoment.tone : 'idle' },
      { key: 'answer', label: 'Resposta', tone: input.isFinished ? 'done' : activeIndex > 2 ? 'done' : primaryMoment.activeStage === 'answer' ? primaryMoment.tone : 'idle' },
      { key: 'analysis', label: 'Analise', tone: input.isFinished ? 'done' : primaryMoment.activeStage === 'analysis' ? primaryMoment.tone : 'idle' },
      { key: 'fallback', label: 'Fallback', tone: primaryMoment.fallbackActive ? 'warning' : 'idle' },
    ],
  };
};
