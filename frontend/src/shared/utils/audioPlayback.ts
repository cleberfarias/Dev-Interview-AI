type Base64AudioPayload = {
  audioBase64: string;
  mimeType: string;
};

let sharedTtsAudioElement: HTMLAudioElement | null = null;
let sharedTtsAudioPrimed = false;

const objectUrlByElement = new WeakMap<HTMLAudioElement, string>();

const canUseDom = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const configureAudioElement = (audioEl: HTMLAudioElement) => {
  audioEl.preload = 'auto';
  audioEl.playsInline = true;
  audioEl.setAttribute('playsinline', 'true');
};

const decodeBase64Audio = (audioBase64: string): Uint8Array => {
  const normalized = String(audioBase64 || '').trim();
  if (!normalized || typeof window === 'undefined' || typeof window.atob !== 'function') {
    return new Uint8Array(0);
  }

  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const createAudioObjectUrl = (payload: Base64AudioPayload): string | null => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  const bytes = decodeBase64Audio(payload.audioBase64);
  if (!bytes.length) {
    return null;
  }

  return URL.createObjectURL(new Blob([bytes], { type: payload.mimeType || 'audio/mpeg' }));
};

const revokeAudioObjectUrl = (audioEl: HTMLAudioElement) => {
  const previousUrl = objectUrlByElement.get(audioEl);
  if (!previousUrl) {
    return;
  }

  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(previousUrl);
  }
  objectUrlByElement.delete(audioEl);
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const createSilentWavBlob = (): Blob => {
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = 1;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = sampleCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([buffer], { type: 'audio/wav' });
};

export const getSharedTtsAudioElement = (): HTMLAudioElement | null => {
  if (!canUseDom()) {
    return null;
  }

  if (sharedTtsAudioElement) {
    return sharedTtsAudioElement;
  }

  const audioEl = document.createElement('audio');
  audioEl.className = 'fd-shared-tts-audio';
  audioEl.style.display = 'none';
  configureAudioElement(audioEl);
  document.body.appendChild(audioEl);
  sharedTtsAudioElement = audioEl;
  return sharedTtsAudioElement;
};

export const setAudioElementSourceFromBase64 = (
  audioEl: HTMLAudioElement,
  payload: Base64AudioPayload,
) => {
  revokeAudioObjectUrl(audioEl);
  configureAudioElement(audioEl);

  const objectUrl = createAudioObjectUrl(payload);
  if (objectUrl) {
    objectUrlByElement.set(audioEl, objectUrl);
    audioEl.src = objectUrl;
    return;
  }

  audioEl.src = `data:${payload.mimeType};base64,${payload.audioBase64}`;
};

export const clearAudioElementSource = (audioEl: HTMLAudioElement) => {
  revokeAudioObjectUrl(audioEl);
  audioEl.pause();
  try {
    audioEl.currentTime = 0;
  } catch {}
  audioEl.removeAttribute('src');
  audioEl.load();
};

export const primeSharedTtsAudio = async (): Promise<boolean> => {
  const audioEl = getSharedTtsAudioElement();
  if (!audioEl) {
    return false;
  }

  if (sharedTtsAudioPrimed) {
    return true;
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }

  const silentUrl = URL.createObjectURL(createSilentWavBlob());
  const previousMuted = audioEl.muted;
  const previousVolume = audioEl.volume;

  try {
    audioEl.muted = true;
    audioEl.volume = 0;
    audioEl.src = silentUrl;
    audioEl.load();
    await audioEl.play();
    audioEl.pause();
    sharedTtsAudioPrimed = true;
    return true;
  } catch {
    return false;
  } finally {
    audioEl.muted = previousMuted;
    audioEl.volume = previousVolume;
    try {
      audioEl.currentTime = 0;
    } catch {}
    audioEl.removeAttribute('src');
    audioEl.load();
    URL.revokeObjectURL(silentUrl);
  }
};
