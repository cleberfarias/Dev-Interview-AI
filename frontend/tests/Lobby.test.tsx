import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendApiMocks = vi.hoisted(() => ({
  generatePlan: vi.fn(),
  getCandidateProfile: vi.fn(),
  orchestratorStart: vi.fn(),
}));

vi.mock('../src/shared/services/backendApi', () => ({
  BackendApi: {
    generatePlan: backendApiMocks.generatePlan,
    getCandidateProfile: backendApiMocks.getCandidateProfile,
    orchestratorStart: backendApiMocks.orchestratorStart,
  },
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
    backendApiMocks.orchestratorStart.mockReset();
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

  it('shows a structured readiness summary and session facts', async () => {
    render(
      <Lobby
        config={baseConfig}
        userCredits={8}
        candidateProfile={completeProfile}
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText('Tudo pronto para entrar?')).toBeInTheDocument();
    expect(screen.getByLabelText('Resumo da sessao')).toBeInTheDocument();
    expect(screen.getByText('Senioridade')).toBeInTheDocument();
    expect(screen.getByText('Amigavel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }));

    await waitFor(() => {
      expect(
        screen.getByText('Ajuste permissoes de camera e microfone nas configuracoes do navegador.'),
      ).toBeInTheDocument();
    });
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
      await screen.findByText(/Microfone liberado, mas ainda sem atividade detectada\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Microfone liberado\. Se quiser testar antes, fale por alguns segundos\./),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Iniciar entrevista' })).toBeEnabled();
    });
  });
});
