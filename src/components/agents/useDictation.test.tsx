import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictationEvent, DictationStart } from '../../lib/dictation';

let emit: (event: DictationEvent) => void = () => {};
const start = vi.fn<(vocabulary: string[]) => Promise<DictationStart>>();
const stop = vi.fn((_session: number) => Promise.resolve());
const cancel = vi.fn((_session: number) => Promise.resolve());
const retry = vi.fn((_session: number) => Promise.resolve());
const learn = vi.fn((_dictated: string, _sent: string) => Promise.resolve<string[]>([]));

vi.mock('../../lib/dictation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/dictation')>()),
  startDictation: (vocabulary: string[]) => start(vocabulary),
  stopDictation: (s: number) => stop(s),
  cancelDictation: (s: number) => cancel(s),
  retryDictation: (s: number) => retry(s),
  learnFromDictation: (d: string, t: string) => learn(d, t),
  onDictationEvent: (handler: (event: DictationEvent) => void) => {
    emit = handler;
    return Promise.resolve(() => {});
  },
}));

import { HELD_MAX_MS, useDictation } from './useDictation';

function setup(initial = 'Hi', holdOnSend = false) {
  let draft = initial;
  const setDraft = vi.fn((text: string) => {
    draft = text;
  });
  const hook = renderHook(() =>
    useDictation({
      getDraft: () => draft,
      setDraft,
      getVocabulary: () => Promise.resolve(['Finance']),
      meterRef: { current: null },
      enabled: true,
      holdOnSend,
    })
  );
  return {
    hook,
    draft: () => draft,
    type: (text: string) => {
      draft = text;
    },
  };
}

describe('useDictation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    start.mockResolvedValue({ status: 'listening', session: 7 });
  });

  it('shows no live words; the written-out words arrive after what was typed', async () => {
    const { hook, draft } = setup();
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(start).toHaveBeenCalledWith(['Finance']);
    expect(hook.result.current.phase).toBe('listening');

    act(() => emit({ kind: 'partial', session: 7, text: 'call' }));
    expect(draft()).toBe('Hi');

    act(() => hook.result.current.toggle());
    expect(stop).toHaveBeenCalledWith(7);
    expect(hook.result.current.phase).toBe('finishing');
    act(() => emit({ kind: 'final', session: 7, text: 'call finance' }));
    act(() => emit({ kind: 'improving', session: 7 }));
    expect(draft()).toBe('Hi');
    act(() =>
      emit({
        kind: 'improved',
        session: 7,
        text: 'Call Finance.',
        raw: 'Call finance.',
        tidied: true,
      })
    );
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    expect(draft()).toBe('Hi Call Finance.');
    expect(hook.result.current.phase).toBe('idle');
  });

  it('with nothing written out, the live words across every segment are kept', async () => {
    const { hook, draft } = setup();
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => emit({ kind: 'final', session: 7, text: 'First part.' }));
    act(() => emit({ kind: 'partial', session: 7, text: 'and more' }));
    act(() => emit({ kind: 'final', session: 7, text: 'And more.' }));
    expect(draft()).toBe('Hi');
    act(() => hook.result.current.toggle());
    // No model yet: no improving, straight to ended.
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    expect(draft()).toBe('Hi First part. And more.');
  });

  it('heard but not written out: nothing in the field, Try again writes it out', async () => {
    const { hook, draft } = setup('');
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => hook.result.current.toggle());
    act(() => emit({ kind: 'improving', session: 7 }));
    act(() => emit({ kind: 'unwritten', session: 7 }));
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    expect(draft()).toBe('');
    expect(hook.result.current.retry).not.toBeNull();
    act(() => hook.result.current.retry?.());
    expect(retry).toHaveBeenCalledWith(7);
    expect(hook.result.current.phase).toBe('tidying');
    expect(hook.result.current.retry).toBeNull();
    act(() =>
      emit({ kind: 'improved', session: 7, text: 'Ship it.', raw: 'Ship it.', tidied: false })
    );
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    expect(draft()).toBe('Ship it.');
  });

  it('cancel puts the typed draft back', async () => {
    const { hook, draft } = setup();
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => emit({ kind: 'partial', session: 7, text: 'oops' }));
    act(() => hook.result.current.cancel());
    expect(cancel).toHaveBeenCalledWith(7);
    expect(draft()).toBe('Hi');
    expect(hook.result.current.phase).toBe('idle');
  });

  it('Enter while listening finishes the dictation and sends nothing', async () => {
    const { hook, draft } = setup();
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => emit({ kind: 'partial', session: 7, text: 'ship it' }));
    const preventDefault = vi.fn();
    let handled = false;
    act(() => {
      handled = hook.result.current.onComposerKeyDown({
        key: 'Enter',
        code: 'Enter',
        preventDefault,
      } as unknown as Parameters<typeof hook.result.current.onComposerKeyDown>[0]);
    });
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stop).toHaveBeenCalledWith(7);
    expect(hook.result.current.phase).toBe('finishing');
    expect(draft()).toBe('Hi');
  });

  it('Enter with a send stops, waits for the tidied words, then sends', async () => {
    const { hook, draft } = setup();
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => emit({ kind: 'partial', session: 7, text: 'tell mogbert' }));
    const send = vi.fn(() => draft());
    act(() => {
      hook.result.current.onComposerKeyDown(
        { key: 'Enter', code: 'Enter', preventDefault: () => {} } as unknown as Parameters<
          typeof hook.result.current.onComposerKeyDown
        >[0],
        send
      );
    });
    expect(stop).toHaveBeenCalledWith(7);
    act(() => emit({ kind: 'final', session: 7, text: 'tell mogbert' }));
    act(() => emit({ kind: 'improving', session: 7 }));
    expect(hook.result.current.phase).toBe('tidying');
    expect(send).not.toHaveBeenCalled();
    act(() =>
      emit({
        kind: 'improved',
        session: 7,
        text: 'Tell Mogbot.',
        raw: 'Tell Mogbert.',
        tidied: true,
      })
    );
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.results[0].value).toBe('Hi Tell Mogbot.');
  });

  it('held: Enter empties the field at once, the better words go to the message, then it sends', async () => {
    const { hook, draft, type } = setup('Hi', true);
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => emit({ kind: 'partial', session: 7, text: 'tell mogbert' }));
    const send = vi.fn(() => draft());
    act(() => {
      hook.result.current.onComposerKeyDown(
        { key: 'Enter', code: 'Enter', preventDefault: () => {} } as unknown as Parameters<
          typeof hook.result.current.onComposerKeyDown
        >[0],
        send
      );
    });
    // Moved up: the field is empty, the message shows as held (no live words).
    expect(draft()).toBe('');
    expect(hook.result.current.held).toBe('Hi');
    act(() => emit({ kind: 'final', session: 7, text: 'tell mogbert' }));
    act(() => emit({ kind: 'improving', session: 7 }));
    act(() =>
      emit({
        kind: 'improved',
        session: 7,
        text: 'Tell Mogbot.',
        raw: 'Tell Mogbert.',
        tidied: true,
      })
    );
    expect(hook.result.current.held).toBe('Hi Tell Mogbot.');
    expect(draft()).toBe('');
    // Typed meanwhile: kept for the next message.
    type('next one');
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.results[0].value).toBe('Hi Tell Mogbot.');
    expect(draft()).toBe('next one');
    expect(hook.result.current.held).toBeNull();
  });

  it('held, and the written-out words never come: it goes with the live words after HELD_MAX_MS', async () => {
    vi.useFakeTimers();
    try {
      const { hook, draft } = setup('Hi', true);
      await act(async () => {
        hook.result.current.toggle();
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => emit({ kind: 'final', session: 7, text: 'ship it' }));
      const send = vi.fn(() => draft());
      act(() => hook.result.current.stopAndSend(send));
      expect(hook.result.current.held).toBe('Hi');
      act(() => emit({ kind: 'improving', session: 7 }));
      act(() => {
        vi.advanceTimersByTime(HELD_MAX_MS);
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.results[0].value).toBe('Hi ship it');
      expect(hook.result.current.held).toBeNull();
      expect(hook.result.current.phase).toBe('idle');
      expect(cancel).toHaveBeenCalledWith(7);
      // Anything it says later lands nowhere.
      act(() => emit({ kind: 'improved', session: 7, text: 'Late.', raw: 'Late.', tidied: true }));
      act(() => emit({ kind: 'ended', session: 7, cancelled: true }));
      expect(draft()).toBe('');
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('held when the chat closes (another agent opened): it is sent, never lost', async () => {
    const { hook, draft } = setup('Hi', true);
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => emit({ kind: 'final', session: 7, text: 'ship it' }));
    const send = vi.fn(() => draft());
    act(() => hook.result.current.stopAndSend(send));
    hook.unmount();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.results[0].value).toBe('Hi ship it');
  });

  it('held, then not written out: the message comes back to the field and nothing is sent', async () => {
    const { hook, draft } = setup('Hi', true);
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    const send = vi.fn();
    act(() => hook.result.current.stopAndSend(send));
    expect(hook.result.current.held).toBe('Hi');
    act(() => emit({ kind: 'improving', session: 7 }));
    act(() => emit({ kind: 'unwritten', session: 7 }));
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    expect(send).not.toHaveBeenCalled();
    expect(hook.result.current.held).toBeNull();
    expect(draft()).toBe('Hi');
    expect(hook.result.current.retry).not.toBeNull();
  });

  it('Esc while tidying throws the dictation away', async () => {
    const { hook, draft } = setup();
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => emit({ kind: 'final', session: 7, text: 'nope' }));
    act(() => hook.result.current.toggle());
    act(() => emit({ kind: 'improving', session: 7 }));
    act(() => hook.result.current.cancel());
    expect(cancel).toHaveBeenCalledWith(7);
    expect(draft()).toBe('Hi');
    expect(hook.result.current.phase).toBe('idle');
  });

  it('gives the field back if the stop never reaches the Mac', async () => {
    stop.mockRejectedValueOnce(new Error('gone'));
    const { hook, draft } = setup();
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => emit({ kind: 'partial', session: 7, text: 'kept' }));
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(hook.result.current.phase).toBe('idle');
    expect(draft()).toBe('Hi kept');
  });

  it('reports a denied permission instead of listening', async () => {
    start.mockResolvedValue({ status: 'blocked', reason: 'microphone' });
    const { hook } = setup();
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(hook.result.current.blocked).toBe('microphone');
    expect(hook.result.current.phase).toBe('idle');
  });

  it('learns from a dictated message only when you changed it before sending', async () => {
    const { hook } = setup('');
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => hook.result.current.toggle());
    act(() => emit({ kind: 'final', session: 7, text: 'ask mog about' }));
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    act(() => hook.result.current.noteSent('ask Mogbot'));
    expect(learn).toHaveBeenCalledWith('ask mog about', 'ask Mogbot');
    // Once per dictation: a later typed message teaches nothing.
    act(() => hook.result.current.noteSent('something else'));
    expect(learn).toHaveBeenCalledTimes(1);
  });

  it('sent as dictated teaches nothing', async () => {
    const { hook } = setup('');
    await act(async () => {
      hook.result.current.toggle();
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => hook.result.current.toggle());
    act(() => emit({ kind: 'final', session: 7, text: 'ship it' }));
    act(() => emit({ kind: 'ended', session: 7, cancelled: false }));
    act(() => hook.result.current.noteSent('ship it'));
    expect(learn).not.toHaveBeenCalled();
  });
});
