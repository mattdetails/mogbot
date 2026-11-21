import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';
import { countEvent, noteOverview, SLOW_OVERVIEW_MS, watchShown } from './shownTiming';

describe('shownTiming', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs, a second after the window is shown, its first frame, the events and the overviews', () => {
    vi.useFakeTimers();
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16));
    let hidden = false;
    const doc = new EventTarget() as unknown as Document;
    Object.defineProperty(doc, 'hidden', { get: () => hidden });
    watchShown(doc);

    hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    countEvent(); // while away: not counted as the first second's
    hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    countEvent();
    countEvent();
    noteOverview(12);
    vi.advanceTimersByTime(1100);

    const shown = info.mock.calls.find(([m]) => m === '[Timing] window shown');
    expect(shown?.[1]).toMatchObject({ eventsFirstSecond: 2, overviewMs: [12] });
    vi.unstubAllGlobals();
  });

  it('logs an overview the window waited on for long', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    noteOverview(SLOW_OVERVIEW_MS - 1);
    expect(info).not.toHaveBeenCalled();
    noteOverview(SLOW_OVERVIEW_MS + 10);
    expect(info).toHaveBeenCalledWith('[Timing] slow overview in the window', {
      ms: SLOW_OVERVIEW_MS + 10,
    });
  });
});
