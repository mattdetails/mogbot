import { useCallback, useEffect, useRef, useState } from 'react';
import { canAnimateExit } from '../lib/motion';

/**
 * Keeps something that just closed on screen while its exit animation runs
 * (docs/MOTION.md: every enter has an exit). `open` false → `leaving` true for
 * at most `backstopMs`, or until the caller reports the exit animation ended
 * with `done()`. Set during render, so there is never a frame where the thing
 * is gone before it has left. Off where exits can't animate (jsdom, Reduce
 * Motion): it then unmounts the frame it closes.
 */
export function useLeaving(open: boolean, backstopMs: number) {
  const [wasOpen, setWasOpen] = useState(open);
  const [leaving, setLeaving] = useState(false);
  if (wasOpen !== open) {
    setWasOpen(open);
    setLeaving(!open && canAnimateExit());
  }
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!leaving) return;
    timer.current = window.setTimeout(() => setLeaving(false), backstopMs);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [leaving, backstopMs]);
  const done = useCallback(() => setLeaving(false), []);
  return { leaving, done };
}

/**
 * What an open thing showed, held while it leaves: `value` while `open`, else
 * the last value it had while open (a closed menu or dialog keeps its content
 * for its exit, docs/MOTION.md).
 */
export function useLastWhileOpen<T>(open: boolean, value: T): T {
  const last = useRef(value);
  // eslint-disable-next-line react-hooks/refs -- a render-time snapshot of the last open content; read only while closed, never drives an effect
  if (open) last.current = value;
  // eslint-disable-next-line react-hooks/refs -- see above
  return open ? value : last.current;
}
