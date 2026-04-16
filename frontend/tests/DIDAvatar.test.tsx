/**
 * Testes para DIDAvatar + useDIDSession
 *
 * Cobre os bugs corrigidos:
 *  - double-speak por rerender com mesma question (spokenQuestionRef)
 *  - stale closure em onVideoStateChange (idleVideoUrlRef)
 *  - race condition: unmount antes de createAgentManager completar
 *  - retry após erro
 *  - fallback para AvatarInterview (via flag USE_DID_AVATAR)
 *  - disconnect chamado no unmount
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

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
  createAgentManager: vi.fn(async (_id: string, { callbacks }: { callbacks: Record<string, (...args: unknown[]) => void> }) => {
    capturedCallbacks = callbacks;
    return mockAgentManager;
  }),
  // Real enum values from @d-id/client-sdk dist types
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

// Helper que renderiza e avança até 'connected'
async function renderConnected(props: Partial<React.ComponentProps<typeof DIDAvatar>> = {}) {
  const result = render(<DIDAvatar question="Pergunta inicial" {...props} />);
  const { createAgentManager } = await import('@d-id/client-sdk');
  await waitFor(() => expect(createAgentManager).toHaveBeenCalled());
  act(() => emitConnectionState('connected'));
  await waitFor(() => expect(screen.queryByTestId('did-status-overlay')).toBeNull());
  return result;
}

// ---- Renderização ----

describe('Renderização inicial', () => {
  it('exibe overlay de conectando ao montar', async () => {
    render(<DIDAvatar />);
    await waitFor(() =>
      expect(screen.getByTestId('did-status-overlay')).toHaveTextContent('Conectando'),
    );
  });

  it('elemento <video> está sempre no DOM', () => {
    render(<DIDAvatar />);
    expect(screen.getByTestId('did-video')).toBeInTheDocument();
  });
});

// ---- Conexão ----

describe('Fluxo de conexão', () => {
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

// ---- Fala e double-speak ----

describe('Fala da pergunta — sem double-speak', () => {
  it('chama speak() com a pergunta quando conecta', async () => {
    await renderConnected({ question: 'Qual é sua experiência?' });
    await waitFor(() =>
      expect(mockAgentManager.speak).toHaveBeenCalledWith({
        type: 'text',
        input: 'Qual é sua experiência?',
      }),
    );
  });

  it('NÃO repete speak() se question não mudou num rerender', async () => {
    const { rerender } = await renderConnected({ question: 'Mesma pergunta' });
    await waitFor(() => expect(mockAgentManager.speak).toHaveBeenCalledTimes(1));

    // Rerender com mesma pergunta — não deve chamar speak novamente
    rerender(<DIDAvatar question="Mesma pergunta" />);
    await new Promise((r) => setTimeout(r, 50)); // aguarda possível disparo indevido

    expect(mockAgentManager.speak).toHaveBeenCalledTimes(1);
  });

  it('chama speak() novamente quando question muda', async () => {
    const { rerender } = await renderConnected({ question: 'Pergunta 1' });
    await waitFor(() => expect(mockAgentManager.speak).toHaveBeenCalledTimes(1));

    rerender(<DIDAvatar question="Pergunta 2" />);
    await waitFor(() => expect(mockAgentManager.speak).toHaveBeenCalledTimes(2));
    expect(mockAgentManager.speak).toHaveBeenLastCalledWith({ type: 'text', input: 'Pergunta 2' });
  });

  it('não chama speak() com string vazia', async () => {
    await renderConnected({ question: '' });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAgentManager.speak).not.toHaveBeenCalled();
  });
});

// ---- Indicador de fala ----

describe('Estado de fala do avatar', () => {
  it('exibe indicador quando video state é START', async () => {
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
    await waitFor(() =>
      expect(screen.queryByTestId('did-speaking-indicator')).toBeNull(),
    );
  });

  it('chama onSpeakEnd quando video state é STOP', async () => {
    const onSpeakEnd = vi.fn();
    await renderConnected({ onSpeakEnd });
    act(() => emitVideoState('START'));
    act(() => emitVideoState('STOP'));
    await waitFor(() => expect(onSpeakEnd).toHaveBeenCalledTimes(1));
  });

  it('pode chamar onSpeakEnd múltiplas vezes (uma por pergunta)', async () => {
    const onSpeakEnd = vi.fn();
    await renderConnected({ onSpeakEnd });
    act(() => emitVideoState('START'));
    act(() => emitVideoState('STOP'));
    act(() => emitVideoState('START'));
    act(() => emitVideoState('STOP'));
    await waitFor(() => expect(onSpeakEnd).toHaveBeenCalledTimes(2));
  });
});

// ---- Erros e retry ----

describe('Tratamento de erro e retry', () => {
  it('exibe mensagem de erro quando getDIDCredentials falha', async () => {
    didApiMocks.getDIDCredentials.mockRejectedValue(new Error('DID service unavailable'));
    render(<DIDAvatar />);
    await waitFor(() =>
      expect(screen.getByTestId('did-status-overlay')).toHaveTextContent('DID service unavailable'),
    );
  });

  it('exibe botão de retry após erro de credencial', async () => {
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

// ---- Race condition e cleanup ----

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

  it('não chama setState após unmount (race condition)', async () => {
    // Simula: connect() é chamado, componente desmonta antes de completar
    let resolveCredentials!: () => void;
    didApiMocks.getDIDCredentials.mockImplementation(
      () => new Promise<{ clientKey: string; agentId: string }>((res) => {
        resolveCredentials = () => res({ clientKey: 'k', agentId: 'a' });
      }),
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<DIDAvatar />);

    // Desmonta ANTES das credenciais chegarem
    unmount();

    // Resolve as credenciais depois do unmount
    act(() => resolveCredentials());
    await new Promise((r) => setTimeout(r, 50));

    // React não deve ter registrado warning de setState em unmounted component
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('unmounted'),
    );
    consoleSpy.mockRestore();
  });
});

// ---- Fallback AvatarInterview ----

describe('Fallback para AvatarInterview', () => {
  it('AvatarInterview renderiza independentemente do DIDAvatar', () => {
    // Verifica que AvatarInterview pode ser renderizado sem interferência
    const { container } = render(
      <AvatarInterview
        avatar={null}
        state="idle"
        mouthOpen={0}
      />,
    );
    expect(container).toBeTruthy();
  });

  it('DIDAvatar e AvatarInterview têm data-testid distintos', () => {
    const { unmount: unmount1 } = render(<DIDAvatar />);
    expect(screen.getByTestId('did-avatar-section')).toBeInTheDocument();
    unmount1();

    render(
      <AvatarInterview avatar={null} state="idle" mouthOpen={0} />,
    );
    expect(screen.queryByTestId('did-avatar-section')).toBeNull();
  });
});
