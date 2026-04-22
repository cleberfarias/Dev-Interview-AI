import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const didApiMocks = vi.hoisted(() => ({
  getDIDCredentials: vi.fn(),
}));

vi.mock('../services/didApi', () => ({
  getDIDCredentials: didApiMocks.getDIDCredentials,
}));

let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {};

const mockAgentManager = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  speak: vi.fn(),
  agent: { presenter: { idle_video: 'https://d-id.com/idle.mp4' } },
};

vi.mock('@d-id/client-sdk', () => ({
  createAgentManager: vi.fn(
    async (_id: string, { callbacks }: { callbacks: Record<string, (...args: unknown[]) => void> }) => {
      capturedCallbacks = callbacks;
      return mockAgentManager;
    },
  ),
  ConnectionState: {
    New: 'new',
    Fail: 'fail',
    Connected: 'connected',
    Connecting: 'connecting',
    Closed: 'closed',
    Completed: 'completed',
    Disconnecting: 'disconnecting',
    Disconnected: 'disconnected',
  },
  StreamingState: {
    Start: 'START',
    Stop: 'STOP',
  },
  Providers: {
    Microsoft: 'microsoft',
  },
}));

import DIDAvatar from '../src/features/avatar/DIDAvatar';
import { AvatarInterview } from '../src/features/avatar';

function emitConnectionState(state: string) {
  capturedCallbacks.onConnectionStateChange?.(state);
}

function emitVideoState(state: string) {
  capturedCallbacks.onVideoStateChange?.(state);
}

function emitError(error: Error) {
  capturedCallbacks.onError?.(error);
}

function expectSpeakPayload(callIndex: number, expectedText: string) {
  const payload = mockAgentManager.speak.mock.calls[callIndex]?.[0];
  expect(payload).toEqual(
    expect.objectContaining({
      type: 'text',
      ssml: true,
      provider: expect.objectContaining({
        type: 'microsoft',
        voice_id: 'pt-BR-FranciscaNeural',
      }),
    }),
  );
  expect(payload.input).toContain('<speak');
  expect(payload.input).toContain(expectedText);
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedCallbacks = {};
  didApiMocks.getDIDCredentials.mockResolvedValue({
    clientKey: 'test-client-key',
    agentId: 'agt_test123',
  });
  mockAgentManager.connect.mockResolvedValue(undefined);
  mockAgentManager.disconnect.mockResolvedValue(undefined);
  mockAgentManager.speak.mockClear();
});

async function renderConnected(props: Partial<React.ComponentProps<typeof DIDAvatar>> = {}) {
  const result = render(<DIDAvatar question="Pergunta inicial" {...props} />);
  const { createAgentManager } = await import('@d-id/client-sdk');
  await waitFor(() => expect(createAgentManager).toHaveBeenCalled());
  act(() => emitConnectionState('connected'));
  await waitFor(() => expect(screen.queryByTestId('did-status-overlay')).toBeNull());
  return result;
}

describe('Renderizacao inicial', () => {
  it('exibe overlay de conectando ao montar', async () => {
    render(<DIDAvatar />);
    await waitFor(() =>
      expect(screen.getByTestId('did-status-overlay')).toHaveTextContent('Conectando'),
    );
  });

  it('elemento video fica sempre no DOM', () => {
    render(<DIDAvatar />);
    expect(screen.getByTestId('did-video')).toBeInTheDocument();
  });
});

describe('Fluxo de conexao', () => {
  it('chama getDIDCredentials ao montar', async () => {
    render(<DIDAvatar />);
    await waitFor(() => expect(didApiMocks.getDIDCredentials).toHaveBeenCalledTimes(1));
  });

  it('cria agentManager com as credenciais corretas', async () => {
    const { createAgentManager } = await import('@d-id/client-sdk');
    render(<DIDAvatar />);
    await waitFor(() =>
      expect(createAgentManager).toHaveBeenCalledWith(
        'agt_test123',
        expect.objectContaining({ auth: { type: 'key', clientKey: 'test-client-key' } }),
      ),
    );
  });

  it('remove overlay e exibe controles quando recebe connected', async () => {
    await renderConnected();
    expect(screen.queryByTestId('did-status-overlay')).toBeNull();
    expect(screen.getByTestId('did-btn-disconnect')).toBeInTheDocument();
  });
});

describe('Fala da pergunta - sem double-speak', () => {
  it('chama speak() com a pergunta quando conecta', async () => {
    await renderConnected({ question: 'Qual e sua experiencia?' });
    await waitFor(() => expect(mockAgentManager.speak).toHaveBeenCalledTimes(1));
    expectSpeakPayload(0, 'Qual e sua experiencia?');
  });

  it('nao repete speak() se question nao mudou num rerender', async () => {
    const { rerender } = await renderConnected({ question: 'Mesma pergunta' });
    await waitFor(() => expect(mockAgentManager.speak).toHaveBeenCalledTimes(1));

    rerender(<DIDAvatar question="Mesma pergunta" />);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockAgentManager.speak).toHaveBeenCalledTimes(1);
  });

  it('chama speak() novamente quando question muda', async () => {
    const { rerender } = await renderConnected({ question: 'Pergunta 1' });
    await waitFor(() => expect(mockAgentManager.speak).toHaveBeenCalledTimes(1));

    rerender(<DIDAvatar question="Pergunta 2" />);
    await waitFor(() => expect(mockAgentManager.speak).toHaveBeenCalledTimes(2));
    expectSpeakPayload(1, 'Pergunta 2');
  });

  it('nao chama speak() com string vazia', async () => {
    await renderConnected({ question: '' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockAgentManager.speak).not.toHaveBeenCalled();
  });
});

describe('Estado de fala do avatar', () => {
  it('exibe indicador quando video state e START', async () => {
    await renderConnected();
    act(() => emitVideoState('START'));
    await waitFor(() =>
      expect(screen.getByTestId('did-speaking-indicator')).toBeInTheDocument(),
    );
  });

  it('remove indicador quando video state volta para STOP', async () => {
    await renderConnected();
    act(() => emitVideoState('START'));
    await waitFor(() => expect(screen.getByTestId('did-speaking-indicator')).toBeInTheDocument());
    act(() => emitVideoState('STOP'));
    await waitFor(() => expect(screen.queryByTestId('did-speaking-indicator')).toBeNull());
  });

  it('chama onSpeakEnd quando video state e STOP', async () => {
    const onSpeakEnd = vi.fn();
    await renderConnected({ onSpeakEnd });
    act(() => emitVideoState('START'));
    act(() => emitVideoState('STOP'));
    await waitFor(() => expect(onSpeakEnd).toHaveBeenCalledTimes(1));
  });

  it('pode chamar onSpeakEnd multiplas vezes', async () => {
    const onSpeakEnd = vi.fn();
    await renderConnected({ onSpeakEnd });
    act(() => emitVideoState('START'));
    act(() => emitVideoState('STOP'));
    act(() => emitVideoState('START'));
    act(() => emitVideoState('STOP'));
    await waitFor(() => expect(onSpeakEnd).toHaveBeenCalledTimes(2));
  });
});

describe('Tratamento de erro e retry', () => {
  it('exibe mensagem de erro quando getDIDCredentials falha', async () => {
    didApiMocks.getDIDCredentials.mockRejectedValue(new Error('DID service unavailable'));
    render(<DIDAvatar />);
    await waitFor(() =>
      expect(screen.getByTestId('did-status-overlay')).toHaveTextContent('DID service unavailable'),
    );
  });

  it('exibe botao de retry apos erro de credencial', async () => {
    didApiMocks.getDIDCredentials.mockRejectedValue(new Error('timeout'));
    render(<DIDAvatar />);
    await waitFor(() => expect(screen.getByTestId('did-btn-retry')).toBeInTheDocument());
  });

  it('exibe erro do SDK via onError', async () => {
    await renderConnected();
    act(() => emitError(new Error('WebRTC ICE failed')));
    await waitFor(() =>
      expect(screen.getByTestId('did-status-overlay')).toHaveTextContent('WebRTC ICE failed'),
    );
  });

  it('tenta reconectar ao clicar em retry', async () => {
    didApiMocks.getDIDCredentials
      .mockRejectedValueOnce(new Error('primeiro erro'))
      .mockResolvedValue({ clientKey: 'key', agentId: 'agt_123' });

    render(<DIDAvatar />);
    await waitFor(() => expect(screen.getByTestId('did-btn-retry')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('did-btn-retry'));
    await waitFor(() => expect(didApiMocks.getDIDCredentials).toHaveBeenCalledTimes(2));
  });
});

describe('Race condition e cleanup', () => {
  it('chama disconnect ao desmontar', async () => {
    const { unmount } = await renderConnected();
    unmount();
    await waitFor(() => expect(mockAgentManager.disconnect).toHaveBeenCalled());
  });

  it('chama disconnect ao clicar em Encerrar', async () => {
    await renderConnected();
    fireEvent.click(screen.getByTestId('did-btn-disconnect'));
    await waitFor(() => expect(mockAgentManager.disconnect).toHaveBeenCalled());
  });

  it('nao chama setState apos unmount', async () => {
    let resolveCredentials!: () => void;
    didApiMocks.getDIDCredentials.mockImplementation(
      () =>
        new Promise<{ clientKey: string; agentId: string }>((resolve) => {
          resolveCredentials = () => resolve({ clientKey: 'k', agentId: 'a' });
        }),
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<DIDAvatar />);

    unmount();
    act(() => resolveCredentials());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('unmounted'));
    consoleSpy.mockRestore();
  });
});

describe('Fallback para AvatarInterview', () => {
  it('AvatarInterview renderiza independentemente do DIDAvatar', () => {
    const { container } = render(<AvatarInterview avatar={null} state="idle" mouthOpen={0} />);
    expect(container).toBeTruthy();
  });

  it('DIDAvatar e AvatarInterview tem data-testid distintos', () => {
    const { unmount } = render(<DIDAvatar />);
    expect(screen.getByTestId('did-avatar-section')).toBeInTheDocument();
    unmount();

    render(<AvatarInterview avatar={null} state="idle" mouthOpen={0} />);
    expect(screen.queryByTestId('did-avatar-section')).toBeNull();
  });
});
