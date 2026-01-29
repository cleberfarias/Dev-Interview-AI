
import React from 'react';
import { LanguageCode, PlanType } from './types';

const ENV = (import.meta as any).env || {};
const MIN_MINUTES = Number(ENV.VITE_INTERVIEW_MIN_MINUTES || 10);
const FREE_MAX = Number(ENV.VITE_INTERVIEW_MAX_MINUTES_FREE || 15);
const PRO_MAX = Number(ENV.VITE_INTERVIEW_MAX_MINUTES_PRO || 25);

export const INTERVIEW_LIMITS = {
  min: MIN_MINUTES,
  free: FREE_MAX,
  pro: PRO_MAX,
};

export const clampDuration = (duration: number, plan: PlanType): number => {
  const max = plan === 'pro' ? INTERVIEW_LIMITS.pro : INTERVIEW_LIMITS.free;
  const safe = Number.isFinite(duration) ? duration : max;
  return Math.max(INTERVIEW_LIMITS.min, Math.min(safe, max));
};

export const I18N: Record<LanguageCode, any> = {
  'en': {
    title: 'Dev Interview AI',
    subtitle: 'Simulate technical interviews with AI-powered feedback.',
    start: 'Start Interview',
    setup: 'Session Setup',
    uiLang: 'UI Language',
    intLang: 'Interview Language',
    track: 'Career Track',
    seniority: 'Seniority Level',
    stacks: 'Programming Languages & Stacks',
    style: 'Interviewer Style',
    duration: 'Duration (min)',
    jd: 'Job Description (Optional)',
    jdPlaceholder: 'Paste the Job Description here to customize your interview...',
    ready: 'Ready for your interview?',
    testMedia: 'Test Camera & Mic',
    enterRoom: 'Enter Interview Room',
    recording: 'Recording...',
    stopRecording: 'Stop & Submit',
    startRecording: 'Start Answer',
    analyzing: '',
    generatingReport: 'Finalizing your feedback report...',
    scores: 'Performance Scores',
    overall: 'Overall Score',
    strengths: 'Strengths',
    improvements: 'Areas to Improve',
    nextLevel: 'Road to Next Level',
    trainingPlan: '7-Day Training Plan',
    jobMatch: 'Job Description Match',
    covered: 'Skills Covered',
    gaps: 'Knowledge Gaps',
    finishEarly: 'Finish Session',
    confirmFinish: 'Are you sure you want to finish the interview now?',
    introLabel: 'Introduction',
    stepLabel: 'Stage {current} of {total}',
    introGreeting: 'Hello! Welcome to our session.',
    askName: 'I am your interviewer today. Before we start the technical challenge, how would you like to be called?',
    niceToMeet: 'Nice to meet you, {name}. Let’s start.',
    interviewerSpeaking: 'Interviewer speaking...',
    recordingAnswer: 'Recording your answer...',
    yourTurn: 'Your turn to speak',
    timeLimitReached: 'Time limit reached. Finishing the interview...'
  },
  'pt-BR': {
    title: 'Dev Interview AI',
    subtitle: 'Simule entrevistas técnicas com feedback via IA.',
    start: 'Iniciar Entrevista',
    setup: 'Configuração da Sessão',
    uiLang: 'Idioma da Interface',
    intLang: 'Idioma da Entrevista',
    track: 'Trilha de Carreira',
    seniority: 'Nível de Senioridade',
    stacks: 'Linguagens e Tecnologias',
    style: 'Estilo do Entrevistador',
    duration: 'Duração (min)',
    jd: 'Descrição da Vaga (Opcional)',
    jdPlaceholder: 'Cole a descrição da vaga aqui para personalizar...',
    ready: 'Pronto para sua entrevista?',
    testMedia: 'Testar Câmera e Mic',
    enterRoom: 'Entrar na Sala',
    recording: 'Gravando...',
    stopRecording: 'Parar e Enviar',
    startRecording: 'Começar Resposta',
    analyzing: '',
    generatingReport: 'Finalizando seu relatório...',
    scores: 'Notas de Desempenho',
    overall: 'Nota Geral',
    strengths: 'Pontos Fortes',
    improvements: 'Pontos a Melhorar',
    nextLevel: 'Caminho para o Próximo Nível',
    trainingPlan: 'Plano de Treino de 7 Dias',
    jobMatch: 'Match com a Vaga',
    covered: 'Habilidades Cobertas',
    gaps: 'Gaps de Conhecimento',
    finishEarly: 'Finalizar Consulta',
    confirmFinish: 'Deseja encerrar a sessão agora e gerar o relatório?',
    introLabel: 'Introdução',
    stepLabel: 'Etapa {current} de {total}',
    introGreeting: 'Olá! Bem-vindo à nossa sessão.',
    askName: 'Eu sou seu entrevistador de hoje. Antes de começarmos o desafio técnico, como você gostaria de ser chamado?',
    niceToMeet: 'Prazer em te conhecer, {name}. Vamos começar.',
    interviewerSpeaking: 'Entrevistador falando...',
    recordingAnswer: 'Gravando sua resposta...',
    yourTurn: 'Sua vez de falar',
    timeLimitReached: 'Tempo limite atingido. Finalizando a entrevista...'
  },
  'es': {
    title: 'Dev Interview AI',
    subtitle: 'Simula entrevistas técnicas con feedback de IA.',
    start: 'Iniciar Entrevista',
    setup: 'Configuración',
    uiLang: 'Idioma de Interfaz',
    intLang: 'Idioma de Entrevista',
    track: 'Trayectoria',
    seniority: 'Senioridad',
    stacks: 'Lenguajes y Tecnologías',
    style: 'Estilo del Entrevistador',
    duration: 'Duración (min)',
    jd: 'Descripción del Puesto (Opcional)',
    jdPlaceholder: 'Pega la descripción del puesto aquí...',
    ready: '¿Listo para tu entrevista?',
    testMedia: 'Probar Cámara y Mic',
    enterRoom: 'Entrar a la Sala',
    recording: 'Grabando...',
    stopRecording: 'Parar e Enviar',
    startRecording: 'Iniciar Respuesta',
    analyzing: '',
    generatingReport: 'Generando informe final...',
    scores: 'Puntuaciones',
    overall: 'Puntuación General',
    strengths: 'Fortalezas',
    improvements: 'Áreas de Mejora',
    nextLevel: 'Camino al Siguiente Nivel',
    trainingPlan: 'Plan de 7 Días',
    jobMatch: 'Ajuste al Puesto',
    covered: 'Habilidades Cubiertas',
    gaps: 'Brechas de Conocimiento',
    finishEarly: 'Finalizar Consulta',
    confirmFinish: '¿Cerrar la sesión ahora y generar el informe?',
    introLabel: 'Introducción',
    stepLabel: 'Etapa {current} de {total}',
    introGreeting: '¡Hola! Bienvenido a nuestra sesión.',
    askName: 'Soy tu entrevistador de hoy. Antes de empezar el reto técnico, ¿cómo te gustaría que te llamen?',
    niceToMeet: 'Mucho gusto, {name}. Empecemos.',
    interviewerSpeaking: 'Entrevistador hablando...',
    recordingAnswer: 'Grabando tu respuesta...',
    yourTurn: 'Tu turno de hablar',
    timeLimitReached: 'LÃ­mite de tiempo alcanzado. Finalizando la entrevista...'
  }
};

export const TRACKS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data'];
export const SENIORITIES = ['intern', 'junior', 'mid', 'senior', 'staff'];
export const STACKS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Rust', 'Go', 
  'PHP', 'Ruby', 'Swift', 'Kotlin', 'React', 'Vue', 'Angular', 'Node.js', 
  'Spring Boot', 'Django', 'Laravel', 'Flutter', 'SQL', 'MongoDB', 'AWS', 'Azure', 'Docker'
];
export const STYLES = ['friendly', 'neutral', 'strict'];
