import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLipSync } from '../src/hooks/useLipSync';

describe('useLipSync', () => {
  it('tracks audio playback state without depending on Web Audio output routing', () => {
    const audioEl = document.createElement('audio');
    let paused = true;
    let ended = false;
    let readyState = 0;

    Object.defineProperty(audioEl, 'paused', {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(audioEl, 'ended', {
      configurable: true,
      get: () => ended,
    });
    Object.defineProperty(audioEl, 'readyState', {
      configurable: true,
      get: () => readyState,
    });

    const { result } = renderHook(() => useLipSync(audioEl));

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.mouthOpen).toBe(0);

    act(() => {
      readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
      paused = false;
      ended = false;
      audioEl.dispatchEvent(new Event('play'));
      audioEl.dispatchEvent(new Event('playing'));
    });

    expect(result.current.isSpeaking).toBe(true);
    expect(result.current.mouthOpen).toBe(0);

    act(() => {
      paused = true;
      ended = true;
      audioEl.dispatchEvent(new Event('ended'));
    });

    expect(result.current.isSpeaking).toBe(false);
  });
});
