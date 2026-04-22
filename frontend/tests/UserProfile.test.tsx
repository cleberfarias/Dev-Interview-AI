import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { InterviewConfig, User } from '../src/shared/types';
import UserProfile from '../src/features/profile/components/UserProfile';
import { renderWithQueryClient } from './renderWithQueryClient';

const updateProfileMock = vi.fn();
const getIdTokenMock = vi.fn();
const updateMeNameMock = vi.fn();
const getSessionAnalysisTraceMock = vi.fn();
const getMcpToolDebuggerMock = vi.fn();

vi.mock('firebase/auth', () => ({
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'user-1',
      getIdToken: (...args: unknown[]) => getIdTokenMock(...args),
    },
  },
}));

vi.mock('../src/shared/services/backendApi', () => ({
  BackendApi: {
    getSessionAnalysisTrace: (...args: unknown[]) => getSessionAnalysisTraceMock(...args),
    getMcpToolDebugger: (...args: unknown[]) => getMcpToolDebuggerMock(...args),
    updateMeName: (...args: unknown[]) => updateMeNameMock(...args),
  },
}));

vi.mock('../src/features/profile/components/CandidateProfilePanel', () => ({
  default: () => <div>Candidate Profile Panel</div>,
}));

vi.mock('../src/features/live-coach', () => ({
  LiveCoachPreviewCard: () => <div>Live Coach Preview</div>,
}));

const baseUser: User = {
  uid: 'user-1',
  name: 'cleber_afd',
  email: 'cleber_afd@hotmail.com',
  credits: 27,
  interviews: [],
};

const baseConfig: InterviewConfig = {
  uiLanguage: 'pt-BR',
  interviewLanguage: 'pt-BR',
  track: 'frontend',
  seniority: 'mid',
  stacks: ['JavaScript', 'TypeScript', 'React'],
  style: 'friendly',
  duration: 20,
  plan: 'free',
  interviewMode: 'candidate_coaching_mode',
  difficultyLevel: 3,
};

const buildUserWithInterviews = (count: number): User => ({
  ...baseUser,
  interviews: Array.from({ length: count }, (_, index) => ({
    id: `session-${index + 1}`,
    date: `2026-03-${String(23 - index).padStart(2, '0')}T19:51:00.000Z`,
    role: 'Entrevista',
    score: 7 - index * 0.25,
    style: 'friendly',
    track: 'frontend',
  })),
});

describe('UserProfile', () => {
  beforeEach(() => {
    updateProfileMock.mockReset();
    getIdTokenMock.mockReset();
    updateMeNameMock.mockReset();
    getMcpToolDebuggerMock.mockReset().mockResolvedValue({
      generatedAt: '2026-03-24T10:20:00.000Z',
      sessionId: 'session-1',
      tools: [
        {
          name: 'get_candidate_memory',
          label: 'Memoria consolidada',
          contractVersion: 'mcp.devinterview.v1',
          status: 'ready',
          summary: 'Memoria consolidada pronta para orientar a entrevista.',
          data: {
            toolName: 'get_candidate_memory',
            memory: {
              strongSkills: ['react', 'typescript'],
              recurringGaps: ['observability'],
            },
          },
        },
        {
          name: 'get_session_trace',
          label: 'Trace da ultima sessao',
          contractVersion: 'mcp.devinterview.v1',
          status: 'ready',
          summary: 'Workflow com 4/4 etapa(s) prontas e 1 resposta(s) auditada(s). Retrieval semantic com qualidade good.',
          data: {
            toolName: 'get_session_trace',
            sessionId: 'session-1',
            hasTrace: true,
            workflowSummary: {
              currentStage: 'report',
              currentStageLabel: 'Relatorio final',
              answerCount: 1,
              retrievalMode: 'semantic',
              retrievalQuality: 'good',
              lastRuntime: {
                questionDeliveryLatencyMs: 1400,
                analysisLatencyMs: 3800,
                transportState: 'avatar/tts em saida',
                avatarState: 'voz ativa',
                coachState: 'parcial ao vivo',
              },
              stages: [
                { key: 'context', label: 'Contexto inicial', status: 'ready' },
                { key: 'retrieval', label: 'Knowledge retrieval', status: 'ready' },
                { key: 'turns', label: 'Turnos auditados', status: 'ready' },
                { key: 'report', label: 'Relatorio final', status: 'ready' },
              ],
            },
            analysisTraceSnapshot: {
              capturedAt: '2026-03-24T10:15:00.000Z',
              turnEvidenceTimeline: {
                answers: {
                  'answer-1': { answerId: 'answer-1' },
                },
              },
            },
          },
        },
        {
          name: 'search_rubric_knowledge',
          label: 'Rubrica aplicada',
          contractVersion: 'mcp.devinterview.v1',
          status: 'ready',
          summary: 'Rubrica pronta para frontend / mid com 3 stack(s).',
          data: {
            toolName: 'search_rubric_knowledge',
            focus: ['performance', 'acessibilidade'],
            goodSignals: ['estrutura'],
            redFlags: ['ignora a11y'],
          },
        },
      ],
    });
    getSessionAnalysisTraceMock.mockReset().mockResolvedValue({
      sessionId: 'session-1',
      hasTrace: true,
      analysisTraceSnapshot: {
        capturedAt: '2026-03-24T10:00:00.000Z',
        lastResumeAnalysisTrace: {
          source: 'ai',
          aiProvider: 'openai',
          aiModel: 'gpt-5.4',
        },
        knowledgeRetrieval: {
          summary: '5 fontes conectadas ao contexto inicial.',
          quality: 'good',
          retrievalMode: 'semantic',
          indexStats: { chunks: 11 },
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

  it('edits and persists the profile name', async () => {
    const onUserUpdated = vi.fn();
    updateProfileMock.mockResolvedValue(undefined);
    getIdTokenMock.mockResolvedValue('fresh-token');
    updateMeNameMock.mockResolvedValue({
      ...baseUser,
      name: 'Cleber Silva',
    });

    renderWithQueryClient(
      <UserProfile
        user={baseUser}
        config={baseConfig}
        onBack={vi.fn()}
        onLogout={vi.fn()}
        onAddCredits={vi.fn()}
        onDeleteInterview={vi.fn()}
        onOpenInterviewReport={vi.fn()}
        onUserUpdated={onUserUpdated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar nome' }));
    fireEvent.change(screen.getByLabelText('Nome que aparece na entrevista'), {
      target: { value: '  Cleber   Silva  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'user-1' }),
        { displayName: 'Cleber Silva' },
      );
    });

    expect(getIdTokenMock).toHaveBeenCalledWith(true);
    expect(updateMeNameMock).toHaveBeenCalledWith('Cleber Silva', 'fresh-token');
    expect(onUserUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'user-1',
        name: 'Cleber Silva',
      }),
    );
  });

  it('renders the MCP debugger for the latest session', async () => {
    renderWithQueryClient(
      <UserProfile
        user={buildUserWithInterviews(2)}
        config={baseConfig}
        onBack={vi.fn()}
        onLogout={vi.fn()}
        onAddCredits={vi.fn()}
        onDeleteInterview={vi.fn()}
        onOpenInterviewReport={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getMcpToolDebuggerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          track: 'frontend',
          seniority: 'mid',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Memoria consolidada pronta para orientar a entrevista.')).toBeInTheDocument();
    });

    expect(screen.getByText('Debugger de tools')).toBeInTheDocument();
    expect(screen.getByText('Workflow com 4/4 etapa(s) prontas e 1 resposta(s) auditada(s). Retrieval semantic com qualidade good.')).toBeInTheDocument();
    expect(screen.getByText('Rubrica pronta para frontend / mid com 3 stack(s).')).toBeInTheDocument();
    expect(screen.getByText(/Etapa atual:/)).toBeInTheDocument();
    expect(screen.getAllByText(/Relatorio final/)[0]).toBeInTheDocument();
    expect(screen.getByText(/Runtime recente:/)).toBeInTheDocument();
    expect(screen.getByText(/Retrieval:/)).toBeInTheDocument();
    expect(screen.getByText(/Contexto inicial: Ativo/)).toBeInTheDocument();
    expect(screen.getByText(/Skills fortes:/)).toBeInTheDocument();
    expect(screen.getByText(/Foco:/)).toBeInTheDocument();
  });

  it('paginates session history and keeps secondary actions behind the overflow control', async () => {
    renderWithQueryClient(
      <UserProfile
        user={buildUserWithInterviews(6)}
        config={baseConfig}
        onBack={vi.fn()}
        onLogout={vi.fn()}
        onAddCredits={vi.fn()}
        onDeleteInterview={vi.fn()}
        onOpenInterviewReport={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Ver relatorio' })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Ver trace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir entrevista' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /^Mais acoes da entrevista de/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver trace' }));

    await waitFor(() => {
      expect(getSessionAnalysisTraceMock).toHaveBeenCalledWith('session-1');
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Capturado em:/)[0]).toBeInTheDocument();
    });

    expect(screen.getByText('Timeline de evidencias')).toBeInTheDocument();
    expect(screen.getByText('Contexto do relatorio final')).toBeInTheDocument();
    expect(screen.getByText('Tools do contexto inicial')).toBeInTheDocument();
    expect(screen.getAllByText(/Runtime do turno:/)[0]).toBeInTheDocument();
    expect(screen.getByText(/Runtime observado:/)).toBeInTheDocument();
    expect(screen.getByText(/Proxima pergunta guiada por:/)).toBeInTheDocument();
    expect(screen.getAllByText(/Tools acionadas:/)[0]).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais entrevistas' }));

    expect(screen.getAllByRole('button', { name: 'Ver relatorio' })).toHaveLength(6);
  });
});
