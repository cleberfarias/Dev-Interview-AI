import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendApiMocks = vi.hoisted(() => ({
  generatePlan: vi.fn(),
  getCandidateProfile: vi.fn(),
  orchestratorBuildContext: vi.fn(),
  orchestratorStart: vi.fn(),
}));

const audioPlaybackMocks = vi.hoisted(() => ({
  primeSharedTtsAudio: vi.fn(),
}));

vi.mock('../src/shared/services/backendApi', () => ({
  BackendApi: {
    generatePlan: backendApiMocks.generatePlan,
    getCandidateProfile: backendApiMocks.getCandidateProfile,
    orchestratorBuildContext: backendApiMocks.orchestratorBuildContext,
    orchestratorStart: backendApiMocks.orchestratorStart,
  },
}));

vi.mock('../src/shared/utils/audioPlayback', () => ({
  primeSharedTtsAudio: audioPlaybackMocks.primeSharedTtsAudio,
}));

import Lobby from '../src/features/interview/components/Lobby';
import type { CandidateProfile, InterviewConfig } from '../src/shared/types';

const baseConfig: InterviewConfig = {
  uiLanguage: 'pt-BR',
  interviewLanguage: 'pt-BR',
  track: 'frontend',
  seniority: 'mid',
  stacks: ['React', 'TypeScript'],
  style: 'friendly',
  duration: 10,
  plan: 'free',
  interviewMode: 'candidate_coaching_mode',
  difficultyLevel: 2,
};

const completeProfile: CandidateProfile = {
  userId: 'user-1',
  targetRole: 'Frontend Engineer',
  experienceLevel: 'mid',
  primarySkills: ['React', 'TypeScript'],
  weakSkills: ['Docker'],
  resumeSummary: 'Perfil focado em frontend moderno.',
  jobDescription: 'Vaga frontend com foco em arquitetura.',
  lastJobAnalysisId: 'job-analysis-1',
};

class MockAudioContext {
  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 4,
      getByteFrequencyData: (array: Uint8Array) => array.set([24, 24, 24, 24]),
    };
  }

  createMediaStreamSource() {
    return {
      connect: vi.fn(),
    };
  }

  close() {
    return Promise.resolve();
  }
}

const mockTrackStop = vi.fn();
const mockStream = {
  getTracks: () => [{ stop: mockTrackStop }],
  getAudioTracks: () => [{}],
} as unknown as MediaStream;

class SilentAudioContext {
  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 4,
      getByteFrequencyData: (array: Uint8Array) => array.set([0, 0, 0, 0]),
    };
  }

  createMediaStreamSource() {
    return {
      connect: vi.fn(),
    };
  }

  close() {
    return Promise.resolve();
  }
}

describe('Lobby', () => {
  beforeEach(() => {
    backendApiMocks.generatePlan.mockReset();
    backendApiMocks.getCandidateProfile.mockReset().mockResolvedValue(completeProfile);
    backendApiMocks.orchestratorBuildContext.mockReset().mockResolvedValue({
      profile: {},
      candidate_memory: {},
      candidate: {},
      job: {},
      match: {},
      knowledgeRetrieval: {
        summary: '3 fontes conectadas ao contexto ativo.',
        quality: 'good',
        retrievalMode: 'semantic',
        indexStats: {
          chunks: 5,
          embeddingStrategy: 'local-hash-v1',
        },
        queryTerms: ['react', 'typescript', 'frontend'],
        sources: [
          {
            id: 'resume-summary',
            sourceType: 'resume',
            title: 'Resumo do curriculo',
            snippet: 'Perfil focado em frontend moderno.',
            score: 0.82,
            reason: 'Recuperado por sobreposicao de contexto: react, frontend.',
          },
          {
            id: 'job-description',
            sourceType: 'job',
            title: 'Descricao da vaga',
            snippet: 'Vaga frontend com foco em arquitetura.',
            score: 0.78,
            reason: 'Recuperado por sobreposicao de contexto: arquitetura.',
          },
        ],
      },
    });
    backendApiMocks.orchestratorStart.mockReset();
    audioPlaybackMocks.primeSharedTtsAudio.mockReset().mockResolvedValue(true);
    mockTrackStop.mockReset();

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: MockAudioContext,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      writable: true,
      value: MockAudioContext,
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 1),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get() {
        return null;
      },
      set() {},
    });
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });
  });

  it('shows the simplified readiness summary and retrieval preview', async () => {
    render(
      <Lobby
        config={baseConfig}
        userCredits={8}
        candidateProfile={completeProfile}
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText('Revise o setup e entre na sala')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => {
        const text = node?.textContent || '';
        return (
          node?.tagName === 'P'
          && text.includes('Frontend')
          && text.includes('Pleno')
          && text.includes('Portugues')
          && text.includes('Amigavel')
          && text.includes('10')
          && text.includes('min')
        );
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Fontes recuperadas')).toBeInTheDocument();
    expect(screen.getByText('3 fontes conectadas ao contexto ativo.')).toBeInTheDocument();
    expect(screen.getByText('Bom')).toBeInTheDocument();
  });

  it('guides the user back to the profile when candidate data is incomplete', async () => {
    const onOpenProfile = vi.fn();

    render(
      <Lobby
        config={baseConfig}
        userCredits={8}
        candidateProfile={{
          ...completeProfile,
          primarySkills: [],
          resumeSummary: '',
          lastJobAnalysisId: null,
        }}
        onOpenProfile={onOpenProfile}
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText('Complete o perfil do candidato antes de iniciar a entrevista.')).toBeInTheDocument();
    expect(screen.getByText('Finalize o perfil do candidato para liberar a entrevista.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ir para perfil' }));

    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('allows entering the interview when the microphone is granted even before signal is detected', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: SilentAudioContext,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      writable: true,
      value: SilentAudioContext,
    });

    render(
      <Lobby
        config={baseConfig}
        userCredits={8}
        candidateProfile={completeProfile}
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/Microfone liberado\. Se quiser testar antes, fale por alguns segundos\./),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Iniciar entrevista' })).toBeEnabled();
    });
  });

  it('primes audio playback before starting the interview flow', async () => {
    backendApiMocks.generatePlan.mockResolvedValue(null);
    backendApiMocks.orchestratorStart.mockResolvedValue({
      session: {
        sessionId: 'sess-1',
        credits: 6,
      },
      initialNextQuestion: {
        shouldFinish: false,
        question: {
          id: 'q1',
          prompt: 'Conte sobre um projeto recente.',
        },
      },
      initialAvatar: null,
    });

    const onStart = vi.fn();

    render(
      <Lobby
        config={baseConfig}
        userCredits={8}
        candidateProfile={completeProfile}
        onStart={onStart}
        onBack={vi.fn()}
      />,
    );

    const startButton = await screen.findByRole('button', { name: 'Iniciar entrevista' });
    await waitFor(() => expect(startButton).toBeEnabled());

    fireEvent.click(startButton);

    await waitFor(() => {
      expect(audioPlaybackMocks.primeSharedTtsAudio).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(backendApiMocks.orchestratorStart).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: [
            expect.objectContaining({
              id: 'q1',
            }),
          ],
        }),
        'sess-1',
        6,
        2,
        null,
        expect.objectContaining({
          knowledgeRetrieval: expect.objectContaining({
            quality: 'good',
          }),
        }),
      );
    });
  });

  it('keeps interview format separate from technical difficulty sent to the backend', async () => {
    backendApiMocks.generatePlan.mockResolvedValue(null);
    backendApiMocks.orchestratorStart.mockResolvedValue({
      session: {
        sessionId: 'sess-2',
        credits: 6,
      },
      initialNextQuestion: {
        shouldFinish: false,
        question: {
          id: 'q1',
          prompt: 'Conte sobre um projeto recente.',
        },
      },
      initialAvatar: null,
    });

    const onStart = vi.fn();

    render(
      <Lobby
        config={{ ...baseConfig, interviewModeLevel: 1, seniority: 'mid' }}
        userCredits={8}
        candidateProfile={completeProfile}
        onStart={onStart}
        onBack={vi.fn()}
      />,
    );

    const startButton = await screen.findByRole('button', { name: 'Iniciar entrevista' });
    await waitFor(() => expect(startButton).toBeEnabled());

    fireEvent.click(startButton);

    await waitFor(() => {
      expect(backendApiMocks.orchestratorStart).toHaveBeenCalledWith(
        expect.objectContaining({
          difficultyLevel: 2,
          config: expect.objectContaining({
            interviewModeLevel: 1,
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith(
        expect.anything(),
        'sess-2',
        6,
        1,
        null,
        expect.objectContaining({
          knowledgeRetrieval: expect.objectContaining({
            sources: expect.arrayContaining([
              expect.objectContaining({
                title: 'Resumo do curriculo',
              }),
            ]),
          }),
        }),
      );
    });
  });

  it('forwards orchestrator context to the next screen when available', async () => {
    backendApiMocks.generatePlan.mockResolvedValue(null);
    backendApiMocks.orchestratorStart.mockResolvedValue({
      session: {
        sessionId: 'sess-3',
        credits: 6,
      },
      context: {
        profile: {},
        candidate: {},
        job: {},
        match: {},
        agentRuntime: {
          candidate_agent: {
            name: 'candidate_agent',
            status: 'completed',
            source: 'heuristic',
            confidence: 0.72,
          },
        },
      },
      initialNextQuestion: {
        shouldFinish: false,
        question: {
          id: 'q1',
          prompt: 'Conte sobre um projeto recente.',
        },
      },
      initialAvatar: null,
    });

    const onStart = vi.fn();

    render(
      <Lobby
        config={baseConfig}
        userCredits={8}
        candidateProfile={completeProfile}
        onStart={onStart}
        onBack={vi.fn()}
      />,
    );

    const startButton = await screen.findByRole('button', { name: 'Iniciar entrevista' });
    await waitFor(() => expect(startButton).toBeEnabled());

    fireEvent.click(startButton);

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith(
        expect.anything(),
        'sess-3',
        6,
        2,
        null,
        expect.objectContaining({
          agentRuntime: expect.objectContaining({
            candidate_agent: expect.objectContaining({
              source: 'heuristic',
            }),
          }),
        }),
      );
    });
  });
});
