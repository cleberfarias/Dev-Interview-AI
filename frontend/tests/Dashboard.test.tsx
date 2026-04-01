import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendApiMocks = vi.hoisted(() => ({
  getSessionAnalysisTrace: vi.fn(),
}));

vi.mock('../src/shared/services/backendApi', () => ({
  BackendApi: {
    getSessionAnalysisTrace: backendApiMocks.getSessionAnalysisTrace,
  },
}));

import Dashboard from '../src/features/dashboard/components/Dashboard';
import type { CandidateProfile, User } from '../src/shared/types';

const buildUser = (): User => ({
  uid: 'user-1',
  name: 'Cleber Farias',
  email: 'cleber_afd@hotmail.com',
  credits: 8,
  provider: 'firebase',
  interviews: [
    {
      id: 'session-1',
      date: '2026-03-23T19:51:00.000Z',
      role: 'Entrevista',
      score: 4.66,
      style: 'friendly',
      track: 'frontend',
    },
  ],
});

const buildCandidateProfile = (): CandidateProfile => ({
  userId: 'user-1',
  targetRole: 'Frontend Engineer',
  experienceLevel: 'mid',
  primarySkills: ['JavaScript', 'TypeScript', 'React'],
  weakSkills: ['Go'],
  resumeSummary: 'Desenvolvedor focado em React e TypeScript.',
  jobDescription: 'Vaga frontend com foco em sistemas escalaveis.',
  lastMatchScore: 81,
  lastResumeAnalysisTrace: {
    source: 'hybrid',
    aiProvider: 'openai',
    aiModel: 'gpt-5.4-mini',
    confidence: 0.84,
  },
  lastJobAnalysisTrace: {
    source: 'ai',
    aiProvider: 'google',
    aiModel: 'gemini-2.5-pro',
    confidence: 0.79,
  },
});

describe('Dashboard', () => {
  beforeEach(() => {
    backendApiMocks.getSessionAnalysisTrace.mockReset().mockResolvedValue({
      sessionId: 'session-1',
      hasTrace: true,
      analysisTraceSnapshot: {
        capturedAt: '2026-03-24T10:00:00.000Z',
        lastResumeAnalysisTrace: {
          source: 'ai',
          aiProvider: 'openai',
          aiModel: 'gpt-5.4',
        },
        lastJobAnalysisTrace: {
          source: 'heuristic',
        },
        agentRuntime: {
          candidate_agent: {
            name: 'candidate_agent',
            status: 'completed',
            source: 'ai',
            confidence: 0.91,
            aiProvider: 'openai',
            aiModel: 'gpt-5.4',
            summary: 'Perfil pronto.',
            evidence: ['profile.resumeSummary'],
          },
          job_agent: {
            name: 'job_agent',
            status: 'completed',
            source: 'heuristic',
            confidence: 0.74,
            summary: 'Vaga pronta.',
            evidence: ['profile.jobDescription'],
          },
          match_agent: {
            name: 'match_agent',
            status: 'completed',
            source: 'heuristic',
            confidence: 0.68,
            summary: 'Match tecnico ativo.',
          },
          candidate_memory: {
            name: 'candidate_memory',
            status: 'completed',
            source: 'system',
            confidence: 1,
            summary: 'Memoria consolidada.',
          },
        },
        knowledgeRetrieval: {
          summary: '5 fontes conectadas ao contexto inicial.',
          quality: 'good',
          retrievalMode: 'semantic',
          indexStats: { chunks: 11 },
          sources: [
            {
              id: 'job-focus',
              title: 'Foco tecnico da vaga',
              sourceType: 'job',
              snippet: 'React, TypeScript e observability.',
              score: 0.84,
            },
          ],
        },
        contextToolCalls: [
          {
            toolName: 'search_rubric_knowledge',
            status: 'ready',
            transport: 'local',
            contractVersion: 'mcp.devinterview.v1',
            summary: 'Rubrica pronta para frontend / mid com 3 stack(s).',
          },
        ],
        turnEvidenceTimeline: {
          answers: {
            'answer-1': {
              answerId: 'answer-1',
              capturedAt: '2026-03-24T10:05:00.000Z',
              question: 'Como voce monitora um fluxo critico no frontend?',
              transcriptSnippet: 'Eu uso logs estruturados, metricas e tracing.',
              improvements: ['observability'],
              strengths: ['react'],
              clientRuntime: {
                questionDeliveryLatencyMs: 1400,
                analysisLatencyMs: 3800,
                transportState: 'avatar/tts em saida',
                avatarState: 'voz ativa',
                coachState: 'parcial ao vivo',
              },
              nextQuestionContext: {
                quality: 'strong',
                retrievalMode: 'semantic',
                sources: [
                  {
                    title: 'Memoria consolidada',
                    sourceType: 'memory',
                    score: 0.74,
                  },
                ],
                episodeHighlights: [
                  {
                    answerId: 'answer-1',
                    question: 'Como voce monitora um fluxo critico no frontend?',
                  },
                ],
                toolCalls: [
                  {
                    toolName: 'search_rubric_knowledge',
                    status: 'ready',
                    transport: 'local',
                  },
                ],
              },
            },
          },
        },
        reportEvidence: {
          capturedAt: '2026-03-24T10:15:00.000Z',
          quality: 'good',
          retrievalMode: 'semantic',
          sources: [
            {
              title: 'Foco tecnico da vaga',
              sourceType: 'job',
              score: 0.84,
            },
          ],
          episodeHighlights: [
            {
              answerId: 'answer-1',
              question: 'Como voce monitora um fluxo critico no frontend?',
              clientRuntime: {
                questionDeliveryLatencyMs: 1400,
                analysisLatencyMs: 3800,
                transportState: 'avatar/tts em saida',
                avatarState: 'voz ativa',
                coachState: 'parcial ao vivo',
              },
            },
          ],
          toolCalls: [
            {
              toolName: 'search_rubric_knowledge',
              status: 'ready',
              transport: 'local',
            },
          ],
        },
      },
    });
  });

  it('prioritizes the main hero CTA', () => {
    const onStartInterview = vi.fn();

    render(
      <Dashboard
        user={buildUser()}
        candidateProfile={buildCandidateProfile()}
        onStartInterview={onStartInterview}
        onOpenProfile={vi.fn()}
        onOpenInterviewReport={vi.fn()}
        onDeleteInterview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Comecar entrevista' }));

    expect(onStartInterview).toHaveBeenCalledTimes(1);
  });

  it('reveals secondary activity actions behind the overflow control', async () => {
    render(
      <Dashboard
        user={buildUser()}
        candidateProfile={buildCandidateProfile()}
        onStartInterview={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenInterviewReport={vi.fn()}
        onDeleteInterview={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ver trace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir entrevista' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Mais acoes da entrevista/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Ver trace' }));

    await waitFor(() => {
      expect(backendApiMocks.getSessionAnalysisTrace).toHaveBeenCalledWith('session-1');
    });

    await waitFor(() => {
      expect(screen.getByText(/Capturado em:/)).toBeInTheDocument();
    });
    expect(screen.getByText('Tools do contexto inicial')).toBeInTheDocument();
    expect(screen.getAllByText(/Tools acionadas:/)[0]).toBeInTheDocument();
  });

  it('keeps profile signals structured without rendering the raw resume summary', () => {
    const onOpenProfile = vi.fn();

    render(
      <Dashboard
        user={buildUser()}
        candidateProfile={buildCandidateProfile()}
        onStartInterview={vi.fn()}
        onOpenProfile={onOpenProfile}
        onOpenInterviewReport={vi.fn()}
        onDeleteInterview={vi.fn()}
      />,
    );

    expect(screen.queryByText('Desenvolvedor focado em React e TypeScript.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar perfil completo' }));

    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('shows the applied AI engine panel using the latest trace when available', async () => {
    render(
      <Dashboard
        user={buildUser()}
        candidateProfile={buildCandidateProfile()}
        onStartInterview={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenInterviewReport={vi.fn()}
        onDeleteInterview={vi.fn()}
      />,
    );

    expect(screen.getByText('Motor de IA aplicado')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Snapshot da ultima sessao')).toBeInTheDocument();
    });

    expect(screen.getByText('Perfil do candidato')).toBeInTheDocument();
    expect(screen.getByText(/gpt-5.4/)).toBeInTheDocument();
    expect(screen.getByText(/Snapshot capturado em/)).toBeInTheDocument();
  });

  it('renders evidence timeline details inside the session trace', async () => {
    render(
      <Dashboard
        user={buildUser()}
        candidateProfile={buildCandidateProfile()}
        onStartInterview={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenInterviewReport={vi.fn()}
        onDeleteInterview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Mais acoes da entrevista/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver trace' }));

    await waitFor(() => {
      expect(screen.getByText('Timeline de evidencias')).toBeInTheDocument();
    });

    expect(screen.getByText('Como voce monitora um fluxo critico no frontend?')).toBeInTheDocument();
    expect(screen.getAllByText(/Runtime do turno:/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/entrega 1.4s/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/coach parcial ao vivo/)[0]).toBeInTheDocument();
    expect(screen.getByText(/Runtime observado:/)).toBeInTheDocument();
    expect(screen.getByText(/Proxima pergunta guiada por:/)).toBeInTheDocument();
    expect(screen.getByText('Contexto do relatorio final')).toBeInTheDocument();
  });
});
