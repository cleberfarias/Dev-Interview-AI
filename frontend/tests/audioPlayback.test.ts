import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('audioPlayback', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('reuses a single hidden audio element for TTS playback', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-1');
    const revokeObjectURL = vi.fn();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });

    const { getSharedTtsAudioElement } = await import('../src/shared/utils/audioPlayback');

    const first = getSharedTtsAudioElement();
    const second = getSharedTtsAudioElement();

    expect(first).not.toBeNull();
    expect(first).toBe(second);
    expect(document.body.querySelectorAll('audio.fd-shared-tts-audio')).toHaveLength(1);
  });

  it('uses blob URLs for base64 audio and revokes them on cleanup', async () => {
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce('blob:test-1')
      .mockReturnValueOnce('blob:test-2');
    const revokeObjectURL = vi.fn();
    const load = vi.fn();
    const pause = vi.fn();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      writable: true,
      value: load,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      writable: true,
      value: pause,
    });

    const {
      clearAudioElementSource,
      getSharedTtsAudioElement,
      setAudioElementSourceFromBase64,
    } = await import('../src/shared/utils/audioPlayback');

    const audioEl = getSharedTtsAudioElement();
    if (!audioEl) {
      throw new Error('shared audio element was not created');
    }

    setAudioElementSourceFromBase64(audioEl, {
      audioBase64: 'YXVkaW8tMQ==',
      mimeType: 'audio/mpeg',
    });
    expect(audioEl.src).toBe('blob:test-1');

    setAudioElementSourceFromBase64(audioEl, {
      audioBase64: 'YXVkaW8tMg==',
      mimeType: 'audio/mpeg',
    });
    expect(audioEl.src).toBe('blob:test-2');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1');

    clearAudioElementSource(audioEl);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-2');
    expect(audioEl.getAttribute('src')).toBeNull();
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });

  it('primes the shared audio element with a silent clip', async () => {
    const createObjectURL = vi.fn(() => 'blob:silence');
    const revokeObjectURL = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const load = vi.fn();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: play,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      writable: true,
      value: pause,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      writable: true,
      value: load,
    });

    const { getSharedTtsAudioElement, primeSharedTtsAudio } = await import('../src/shared/utils/audioPlayback');

    const audioEl = getSharedTtsAudioElement();
    if (!audioEl) {
      throw new Error('shared audio element was not created');
    }

    await expect(primeSharedTtsAudio()).resolves.toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(audioEl.getAttribute('src')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:silence');
  });
});
