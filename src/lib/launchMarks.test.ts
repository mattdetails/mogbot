import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';
import { markLaunch, markLaunchAfterPaint, resetLaunchMarks } from './launchMarks';

describe('launch marks', () => {
  afterEach(() => {
    resetLaunchMarks();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('logs each moment once, with the time since the page began loading', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    markLaunch('window-shown', () => 412.6);
    markLaunch('window-shown', () => 900);
    markLaunch('agents-list', () => 655);
    expect(info.mock.calls).toEqual([
      ['launch: window-shown', { ms: 413 }],
      ['launch: agents-list', { ms: 655 }],
    ]);
  });

  it('waits for the frame to be painted', () => {
    vi.useFakeTimers();
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    markLaunchAfterPaint('first-chat');
    expect(info).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe('launch: first-chat');
  });
});
