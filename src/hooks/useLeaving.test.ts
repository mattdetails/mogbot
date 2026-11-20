import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLeaving } from './useLeaving';

describe('useLeaving', () => {
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error jsdom has no Web Animations; the stub is removed again.
    delete Element.prototype.getAnimations;
  });

  it('unmounts at once where exits cannot animate (jsdom, Reduce Motion)', () => {
    const { result, rerender } = renderHook(({ open }) => useLeaving(open, 300), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(result.current.leaving).toBe(false);
  });

  it('stays for the exit, from the very render that closed it, until done or the backstop', () => {
    vi.useFakeTimers();
    Element.prototype.getAnimations = () => [];
    const { result, rerender } = renderHook(({ open }) => useLeaving(open, 300), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(result.current.leaving).toBe(true);
    act(() => result.current.done());
    expect(result.current.leaving).toBe(false);

    rerender({ open: true });
    rerender({ open: false });
    expect(result.current.leaving).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.leaving).toBe(false);
  });

  it('reopening while leaving is simply open', () => {
    Element.prototype.getAnimations = () => [];
    const { result, rerender } = renderHook(({ open }) => useLeaving(open, 300), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    rerender({ open: true });
    expect(result.current.leaving).toBe(false);
  });
});
