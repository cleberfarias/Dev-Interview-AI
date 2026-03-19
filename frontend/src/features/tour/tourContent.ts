import type { LanguageCode } from '../../shared/types';
import type { ProductTourStep } from './components/ProductTour';

export type ProductTourId = 'dashboard' | 'profile' | 'onboarding' | 'lobby' | 'report';

const TOUR_STORAGE_PREFIX = 'dev-interview-tour';

type LocalizedTours = Record<ProductTourId, ProductTourStep[]>;

const TOUR_COPY: Record<LanguageCode, LocalizedTours> = {
  'pt-BR': {
    dashboard: [
      {
        id: 'dashboard-resume',
        target: '[data-tour-id="dashboard-resume-card"]',
        placement: 'bottom',
        title: 'Primeiro, analise seu curriculo',
        description: 'Comece por aqui para preencher e fortalecer o perfil do candidato com base no seu curriculo.',
      },
      {
        id: 'dashboard-job',
        target: '[data-tour-id="dashboard-job-card"]',
        placement: 'bottom',
        title: 'Depois, analise a vaga',
        description: 'Na sequencia, conecte seu perfil aos requisitos da vaga para personalizar perguntas e feedbacks.',
      },
      {
        id: 'dashboard-start',
        target: '[data-tour-id="dashboard-start-card"]',
        placement: 'bottom',
        title: 'Por ultimo, inicie a entrevista',
        description: 'Com curriculo e vaga analisados, use este atalho para seguir com seguranca para a entrevista.',
      },
      {
        id: 'dashboard-profile',
        target: '[data-tour-id="app-header-profile"]',
        placement: 'bottom',
        title: 'Seu menu de perfil',
        description: 'Se precisar revisar o perfil, historico ou configuracoes, volte por este atalho.',
      },
    ],
    profile: [
      {
        id: 'profile-candidate-form',
        target: '[data-tour-id="profile-candidate-form"]',
        placement: 'right',
        title: 'Complete o perfil do candidato',
        description: 'Preencha cargo alvo, nivel, skills principais e resumo. Sem isso, a entrevista nao comeca.',
      },
      {
        id: 'profile-resume',
        target: '[data-tour-id="profile-resume-analyzer"]',
        placement: 'right',
        title: 'Acelere com o curriculo',
        description: 'Use a analise de curriculo para preencher o perfil automaticamente e ganhar contexto tecnico.',
      },
      {
        id: 'profile-job',
        target: '[data-tour-id="profile-job-analyzer"]',
        placement: 'left',
        title: 'Cole a vaga aqui',
        description: 'Analise a descricao da vaga para personalizar perguntas, gaps e feedbacks da entrevista.',
      },
    ],
    onboarding: [
      {
        id: 'onboarding-progress',
        target: '[data-tour-id="onboarding-progress"]',
        placement: 'bottom',
        title: 'Onboarding rapido',
        description: 'Este fluxo tem 5 etapas curtas para configurar idioma, plano, trilha, stacks e estilo.',
      },
      {
        id: 'onboarding-content',
        target: '[data-tour-id="onboarding-content"]',
        placement: 'right',
        title: 'Defina a area da entrevista',
        description: 'Preencha a etapa atual e avance. A selecao aqui muda o contexto tecnico das perguntas.',
      },
      {
        id: 'onboarding-next',
        target: '[data-tour-id="onboarding-next"]',
        placement: 'top',
        title: 'Avance para a pre-sala',
        description: 'Use este botao para seguir no onboarding e liberar a tela de camera, microfone e inicio.',
      },
    ],
    lobby: [
      {
        id: 'lobby-preview',
        target: '[data-tour-id="lobby-preview"]',
        placement: 'right',
        title: 'Preview da entrevista',
        description: 'Confirme aqui se camera e microfone estao capturando antes de entrar na simulacao.',
      },
      {
        id: 'lobby-settings',
        target: '[data-tour-id="lobby-settings"]',
        placement: 'bottom',
        title: 'Configuracao de microfone',
        description: 'Se algo falhar, use este atalho para revisar permissoes e ajustes de audio e video do navegador.',
      },
      {
        id: 'lobby-level',
        target: '[data-tour-id="lobby-level"]',
        placement: 'right',
        title: 'Escolha a intensidade',
        description: 'Selecione o nivel da entrevista para controlar a dificuldade tecnica da sessao.',
      },
      {
        id: 'lobby-start',
        target: '[data-tour-id="lobby-start"]',
        placement: 'top',
        title: 'Entre na entrevista',
        description: 'Quando tudo estiver pronto, clique aqui para abrir a sala e iniciar a experiencia com IA.',
      },
    ],
    report: [
      {
        id: 'report-score',
        target: '[data-tour-id="report-score"]',
        placement: 'bottom',
        title: 'Relatorio final',
        description: 'Esta area resume sua nota geral e a leitura principal da performance na entrevista.',
      },
      {
        id: 'report-feedback',
        target: '[data-tour-id="report-feedback"]',
        placement: 'bottom',
        title: 'Pontos fortes e melhorias',
        description: 'Aqui voce encontra os feedbacks mais importantes para repetir acertos e corrigir gaps.',
      },
      {
        id: 'report-study-plan',
        target: '[data-tour-id="report-study-plan"]',
        placement: 'top',
        title: 'Plano de estudo',
        description: 'O app gera um roteiro objetivo para os proximos dias com base no seu desempenho.',
      },
      {
        id: 'report-retry',
        target: '[data-tour-id="report-retry"]',
        placement: 'left',
        title: 'Nova pratica',
        description: 'Use este atalho para iniciar outro ciclo de treino depois de revisar o relatorio.',
      },
    ],
  },
  en: {
    dashboard: [
      {
        id: 'dashboard-resume',
        target: '[data-tour-id="dashboard-resume-card"]',
        placement: 'bottom',
        title: 'First, analyze your resume',
        description: 'Start here to strengthen the candidate profile with information extracted from your resume.',
      },
      {
        id: 'dashboard-job',
        target: '[data-tour-id="dashboard-job-card"]',
        placement: 'bottom',
        title: 'Then analyze the job',
        description: 'Next, map your profile against the job description to make the interview more relevant.',
      },
      {
        id: 'dashboard-start',
        target: '[data-tour-id="dashboard-start-card"]',
        placement: 'bottom',
        title: 'Finally, start the interview',
        description: 'Once resume and job analysis are done, use this action to move into the interview flow.',
      },
      {
        id: 'dashboard-profile',
        target: '[data-tour-id="app-header-profile"]',
        placement: 'bottom',
        title: 'Your profile menu',
        description: 'If you need to review profile details, history or settings, come back through this shortcut.',
      },
    ],
    profile: [
      {
        id: 'profile-candidate-form',
        target: '[data-tour-id="profile-candidate-form"]',
        placement: 'right',
        title: 'Complete the candidate profile',
        description: 'Fill target role, level, main skills and summary first. Without this, the interview stays blocked.',
      },
      {
        id: 'profile-resume',
        target: '[data-tour-id="profile-resume-analyzer"]',
        placement: 'right',
        title: 'Speed it up with the resume',
        description: 'Use resume analysis to prefill the profile and add stronger technical context automatically.',
      },
      {
        id: 'profile-job',
        target: '[data-tour-id="profile-job-analyzer"]',
        placement: 'left',
        title: 'Paste the job description here',
        description: 'Analyze the role description to personalize questions, detected gaps and interview feedback.',
      },
    ],
    onboarding: [
      {
        id: 'onboarding-progress',
        target: '[data-tour-id="onboarding-progress"]',
        placement: 'bottom',
        title: 'Quick onboarding',
        description: 'This flow has 5 short steps to configure language, plan, track, stacks and style.',
      },
      {
        id: 'onboarding-content',
        target: '[data-tour-id="onboarding-content"]',
        placement: 'right',
        title: 'Choose the interview scope',
        description: 'Fill the current step and move forward. The choices here shape the technical context.',
      },
      {
        id: 'onboarding-next',
        target: '[data-tour-id="onboarding-next"]',
        placement: 'top',
        title: 'Continue to the lobby',
        description: 'Use this button to keep moving through onboarding and unlock the camera and mic screen.',
      },
    ],
    lobby: [
      {
        id: 'lobby-preview',
        target: '[data-tour-id="lobby-preview"]',
        placement: 'right',
        title: 'Interview preview',
        description: 'Check here whether camera and microphone are working before entering the simulation.',
      },
      {
        id: 'lobby-settings',
        target: '[data-tour-id="lobby-settings"]',
        placement: 'bottom',
        title: 'Microphone setup',
        description: 'If anything fails, use this shortcut to review browser audio and video permissions.',
      },
      {
        id: 'lobby-level',
        target: '[data-tour-id="lobby-level"]',
        placement: 'right',
        title: 'Pick the difficulty',
        description: 'Select the interview level to control how demanding the technical questions will be.',
      },
      {
        id: 'lobby-start',
        target: '[data-tour-id="lobby-start"]',
        placement: 'top',
        title: 'Enter the interview',
        description: 'When everything looks ready, click here to open the room and start the AI session.',
      },
    ],
    report: [
      {
        id: 'report-score',
        target: '[data-tour-id="report-score"]',
        placement: 'bottom',
        title: 'Final report',
        description: 'This area summarizes your overall score and the main reading of the interview result.',
      },
      {
        id: 'report-feedback',
        target: '[data-tour-id="report-feedback"]',
        placement: 'bottom',
        title: 'Strengths and improvements',
        description: 'Here you can review the strongest signals and the most important gaps to fix next.',
      },
      {
        id: 'report-study-plan',
        target: '[data-tour-id="report-study-plan"]',
        placement: 'top',
        title: 'Study plan',
        description: 'The app builds a practical next-step plan based on how you performed in the session.',
      },
      {
        id: 'report-retry',
        target: '[data-tour-id="report-retry"]',
        placement: 'left',
        title: 'Practice again',
        description: 'Use this action to start another training cycle after reviewing your report.',
      },
    ],
  },
  es: {
    dashboard: [
      {
        id: 'dashboard-resume',
        target: '[data-tour-id="dashboard-resume-card"]',
        placement: 'bottom',
        title: 'Primero, analiza tu CV',
        description: 'Empieza aqui para reforzar el perfil del candidato con informacion tomada de tu CV.',
      },
      {
        id: 'dashboard-job',
        target: '[data-tour-id="dashboard-job-card"]',
        placement: 'bottom',
        title: 'Despues, analiza la vacante',
        description: 'Luego conecta tu perfil con la descripcion del puesto para ajustar preguntas y feedback.',
      },
      {
        id: 'dashboard-start',
        target: '[data-tour-id="dashboard-start-card"]',
        placement: 'bottom',
        title: 'Por ultimo, inicia la entrevista',
        description: 'Con CV y vacante analizados, usa este acceso para seguir con la entrevista.',
      },
      {
        id: 'dashboard-profile',
        target: '[data-tour-id="app-header-profile"]',
        placement: 'bottom',
        title: 'Tu menu de perfil',
        description: 'Si necesitas revisar perfil, historial o configuraciones, vuelve por este acceso.',
      },
    ],
    profile: [
      {
        id: 'profile-candidate-form',
        target: '[data-tour-id="profile-candidate-form"]',
        placement: 'right',
        title: 'Completa el perfil del candidato',
        description: 'Completa cargo objetivo, nivel, skills principales y resumen. Sin esto, la entrevista queda bloqueada.',
      },
      {
        id: 'profile-resume',
        target: '[data-tour-id="profile-resume-analyzer"]',
        placement: 'right',
        title: 'Acelera con el CV',
        description: 'Usa el analisis del CV para autocompletar el perfil y sumar mejor contexto tecnico.',
      },
      {
        id: 'profile-job',
        target: '[data-tour-id="profile-job-analyzer"]',
        placement: 'left',
        title: 'Pega la vacante aqui',
        description: 'Analiza la descripcion del puesto para personalizar preguntas, gaps detectados y feedback.',
      },
    ],
    onboarding: [
      {
        id: 'onboarding-progress',
        target: '[data-tour-id="onboarding-progress"]',
        placement: 'bottom',
        title: 'Onboarding rapido',
        description: 'Este flujo tiene 5 pasos cortos para configurar idioma, plan, trayectoria, stacks y estilo.',
      },
      {
        id: 'onboarding-content',
        target: '[data-tour-id="onboarding-content"]',
        placement: 'right',
        title: 'Define el alcance',
        description: 'Completa el paso actual y sigue adelante. Estas elecciones cambian el contexto tecnico.',
      },
      {
        id: 'onboarding-next',
        target: '[data-tour-id="onboarding-next"]',
        placement: 'top',
        title: 'Continua al lobby',
        description: 'Usa este boton para avanzar y liberar la pantalla de camara, microfono e inicio.',
      },
    ],
    lobby: [
      {
        id: 'lobby-preview',
        target: '[data-tour-id="lobby-preview"]',
        placement: 'right',
        title: 'Vista previa',
        description: 'Confirma aqui si camara y microfono funcionan antes de entrar a la simulacion.',
      },
      {
        id: 'lobby-settings',
        target: '[data-tour-id="lobby-settings"]',
        placement: 'bottom',
        title: 'Configuracion del microfono',
        description: 'Si algo falla, usa este acceso para revisar permisos de audio y video del navegador.',
      },
      {
        id: 'lobby-level',
        target: '[data-tour-id="lobby-level"]',
        placement: 'right',
        title: 'Elige la dificultad',
        description: 'Selecciona el nivel de la entrevista para controlar la exigencia tecnica.',
      },
      {
        id: 'lobby-start',
        target: '[data-tour-id="lobby-start"]',
        placement: 'top',
        title: 'Entrar a la entrevista',
        description: 'Cuando todo este listo, haz clic aqui para abrir la sala e iniciar la sesion con IA.',
      },
    ],
    report: [
      {
        id: 'report-score',
        target: '[data-tour-id="report-score"]',
        placement: 'bottom',
        title: 'Informe final',
        description: 'Esta area resume tu nota general y la lectura principal del resultado.',
      },
      {
        id: 'report-feedback',
        target: '[data-tour-id="report-feedback"]',
        placement: 'bottom',
        title: 'Fortalezas y mejoras',
        description: 'Aqui revisas los mejores senales y los gaps mas importantes a corregir.',
      },
      {
        id: 'report-study-plan',
        target: '[data-tour-id="report-study-plan"]',
        placement: 'top',
        title: 'Plan de estudio',
        description: 'La app genera un plan concreto para los proximos dias segun tu desempeno.',
      },
      {
        id: 'report-retry',
        target: '[data-tour-id="report-retry"]',
        placement: 'left',
        title: 'Practicar otra vez',
        description: 'Usa esta accion para iniciar otro ciclo de entrenamiento despues del informe.',
      },
    ],
  },
};

export const buildTourStorageKey = (tourId: ProductTourId): string => `${TOUR_STORAGE_PREFIX}:${tourId}:v1`;

export const getTourSteps = (tourId: ProductTourId, locale: LanguageCode): ProductTourStep[] => {
  const localizedTours = TOUR_COPY[locale] || TOUR_COPY['pt-BR'];
  return localizedTours[tourId] || TOUR_COPY['pt-BR'][tourId];
};
