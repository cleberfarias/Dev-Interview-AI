import { describe, expect, it } from 'vitest';

import {
  buildInterviewClosingPrompt,
  buildInterviewOpeningPrompt,
  buildInterviewOpeningRetryPrompt,
  buildSpokenPrompt,
} from '../src/features/interview/components/interviewRoomUtils';

describe('buildSpokenPrompt', () => {
  it('builds an opening prompt before the first technical question', () => {
    const prompt = buildInterviewOpeningPrompt('friendly', 'pt-BR', 'Cleber', {
      track: 'frontend',
      seniority: 'mid',
      stacks: ['React', 'TypeScript'],
      now: new Date('2026-03-23T09:00:00'),
    });

    expect(prompt).toContain('Bom dia, Cleber.');
    expect(prompt).toContain('Podemos iniciar nossa entrevista tecnica?');
    expect(prompt).toContain('seu foco hoje e frontend no nivel pleno');
    expect(prompt).toContain('React e TypeScript');
    expect(prompt).toContain('Vamos comecar por esse contexto, tudo bem?');
  });

  it('builds a natural first-question opening with greeting, profile context and stack', () => {
    const prompt = buildSpokenPrompt(
      'Como voce estruturaria um componente React para ser reutilizavel?',
      0,
      'friendly',
      'pt-BR',
      'Cleber',
      {
        track: 'frontend',
        seniority: 'mid',
        stacks: ['React', 'TypeScript'],
        now: new Date('2026-03-23T09:00:00'),
      },
    );

    expect(prompt).toContain('Bom dia, Cleber.');
    expect(prompt).toContain('Podemos iniciar nossa entrevista tecnica?');
    expect(prompt).toContain('seu foco hoje e frontend no nivel pleno');
    expect(prompt).toContain('React e TypeScript');
    expect(prompt).toContain('Cleber, quero comecar com a seguinte pergunta:');
    expect(prompt).toContain('Como voce estruturaria um componente React para ser reutilizavel?');
  });

  it('keeps follow-up questions concise and conversational', () => {
    const prompt = buildSpokenPrompt(
      'Como voce investigaria uma tela lenta em producao?',
      1,
      'friendly',
      'pt-BR',
      'Cleber',
      {
        track: 'frontend',
        seniority: 'mid',
        stacks: ['React'],
        now: new Date('2026-03-23T15:00:00'),
      },
    );

    expect(prompt).toContain('Perfeito, Cleber.');
    expect(prompt).toContain('aqui vai a proxima pergunta:');
    expect(prompt).toContain('Como voce investigaria uma tela lenta em producao?');
    expect(prompt).not.toContain('Boa tarde');
  });

  it('marks the final question explicitly near the end of the interview', () => {
    const prompt = buildSpokenPrompt(
      'Como voce garantiria rollout seguro dessa mudanca?',
      4,
      'friendly',
      'pt-BR',
      'Cleber',
      {
        track: 'frontend',
        seniority: 'mid',
        stacks: ['React'],
        now: new Date('2026-03-23T15:00:00'),
      },
      { isLastQuestion: true },
    );

    expect(prompt).toContain('Estamos na ultima pergunta da entrevista:');
    expect(prompt).toContain('Como voce garantiria rollout seguro dessa mudanca?');
  });

  it('builds a short retry prompt for the opening confirmation', () => {
    const prompt = buildInterviewOpeningRetryPrompt('pt-BR', 'Cleber');

    expect(prompt).toContain('Cleber');
    expect(prompt).toContain('nao consegui ouvir sua confirmacao');
    expect(prompt).toContain('sim rapido');
  });

  it('builds a closing prompt before the final report', () => {
    const prompt = buildInterviewClosingPrompt('pt-BR', 'Cleber');

    expect(prompt).toContain('Cleber');
    expect(prompt).toContain('encerramos as perguntas');
    expect(prompt).toContain('consolidando seu relatorio final');
  });
});
