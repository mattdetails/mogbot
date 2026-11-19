import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVEAL_STEP_MS, useReveal } from './useReveal';

describe('useReveal pacing', () => {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  beforeEach(() => {
    now = 1000;
    queue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Run `ms` of 60 Hz display frames; returns how many distinct texts were shown. */
  function frames(ms: number, read: () => string) {
    const seen = new Set<string>();
    for (let t = 0; t < ms; t += 16) {
      now += 16;
      const due = queue;
      queue = [];
      act(() => due.forEach((cb) => cb(now)));
      seen.add(read());
    }
    return seen.size;
  }

  it('steps about every 30 ms, not every frame, and still reaches the end', () => {
    const text = 'x'.repeat(400);
    const { result } = renderHook(() => useReveal('m1', text, true));
    const steps = frames(1000, () => result.current);
    // 60 frames a second, so at most about one step in two.
    expect(steps).toBeLessThanOrEqual(Math.ceil(1000 / REVEAL_STEP_MS) + 3);
    expect(steps).toBeGreaterThan(10);
    frames(2000, () => result.current);
    expect(result.current).toBe(text);
  });
});
