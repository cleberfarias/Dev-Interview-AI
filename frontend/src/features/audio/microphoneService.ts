const buildAudioConstraints = (deviceId?: string): MediaStreamConstraints => ({
  audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  video: false,
});

export const getFriendlyMicrophoneError = (error: unknown): string => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Permissao de microfone negada. Libere o acesso e tente novamente.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'Nenhum microfone foi encontrado neste dispositivo.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'Nao foi possivel acessar o microfone. Feche outros apps usando o audio e tente novamente.';
    }
    if (error.name === 'OverconstrainedError') {
      return 'O microfone selecionado nao esta disponivel. Escolha outro dispositivo.';
    }
  }
  return error instanceof Error ? error.message : 'Falha ao acessar o microfone.';
};

export async function requestMicrophonePermission(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microfone indisponivel neste navegador.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));
  } catch (error) {
    throw new Error(getFriendlyMicrophoneError(error));
  }
}

export async function listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'audioinput');
}

export async function getDefaultAudioInputId(): Promise<string | null> {
  const devices = await listAudioInputDevices();
  if (!devices.length) return null;
  const preferred = devices.find((device) => device.deviceId === 'default') || devices[0];
  return preferred?.deviceId || null;
}
