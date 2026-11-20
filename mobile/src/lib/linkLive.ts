/**
 * The link as screens should feel it: a drop shorter than `QUIET_MS` changes
 * nothing on screen (docs/mobile.md, "Connection status"). Kept apart from
 * the bar's component so any screen can use it.
 */

import { useEffect, useRef, useState } from 'react';
import { feelsLive } from './connection';
import { useApp } from './store';

/** When the link last went down, kept while it stays down (for states that carry no `since`). */
export function useFirstDown(down: boolean): number | undefined {
  const at = useRef<number | undefined>(undefined);
  if (!down) at.current = undefined;
  // eslint-disable-next-line react-hooks/purity -- the clock is read in render on purpose; it only feeds a label that is re-read on the next render
  else if (at.current == null) at.current = Date.now();
  return at.current;
}

/**
 * Whether a screen should act as if the Mac were there: connected, or down
 * for less than `QUIET_MS`. Buttons stay on, nothing swaps for a spinner,
 * and what's sent waits its turn (`session.call`, the outbox).
 */
export function useLinkLive(): boolean {
  const link = useApp((s) => s.link);
  // Only ticks while the link is down: a healthy link costs nothing here.
  // eslint-disable-next-line react-hooks/purity -- the clock is read in render on purpose; it only feeds a label that is re-read on the next render
  const [now, setNow] = useState(Date.now());
  const down = link.kind !== 'connected' || link.stuck != null;
  useEffect(() => {
    if (!down) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [down]);
  const first = useFirstDown(link.kind !== 'connected');
  // eslint-disable-next-line react-hooks/purity -- the clock is read in render on purpose; it only feeds a label that is re-read on the next render
  return feelsLive(link, Math.max(now, Date.now()), first);
}
