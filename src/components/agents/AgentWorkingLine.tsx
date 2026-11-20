/**
 * A working agent's line in a list (the sidebar, What's in flight): the step
 * it's on in plain words and how long it's been at it ("Running the Cypress
 * tests · 5m"), or "No progress for 5 min" once the Mac says so. Its own
 * component, so only working rows tick (every few seconds, coarse on purpose).
 *
 * It must not make the row move. The words are steadied (`useSteadyLine`:
 * each step holds 1.8s, a "Thinking" between steps must last 2.5s), cut to
 * one line by CSS, and the time sits in its own column of tabular figures, so
 * "9s" becoming "10s" or a long step following a short one changes no width
 * and no height.
 *
 * @module components/agents/AgentWorkingLine
 */

import { useNow } from '../../hooks/useNow';
import { useSteadyLine } from '../../hooks/useSteadyLine';
import { plainActivity, type Agent } from '../../lib/agents';
import { workingRowLine } from '../../../packages/companion-protocol/src/work';

/** How often a working row's elapsed time is brought up to date. */
const ROW_TICK_MS = 5_000;

/**
 * The sidebar row's working clock, in the row's time column ("2m"), with the
 * step and a small grey dot in its line. Its own component so only working
 * rows tick.
 */
export function WorkingElapsed({ agent }: { agent: Agent }) {
  const working = agent.status.state === 'working';
  const now = useNow(working, ROW_TICK_MS);
  const { elapsed } = workingRowLine(
    plainActivity(agent.status.activity),
    agent.status.work,
    agent.status.since,
    now
  );
  return elapsed ? <span className="agents-list__time">{elapsed}</span> : null;
}

export function AgentWorkingLine({ agent, inRow = false }: { agent: Agent; inRow?: boolean }) {
  const working = agent.status.state === 'working';
  const now = useNow(working, ROW_TICK_MS);
  const { text, elapsed } = workingRowLine(
    plainActivity(agent.status.activity),
    agent.status.work,
    agent.status.since,
    now
  );
  const steady = useSteadyLine(text, working);
  if (inRow) {
    // The sidebar row: a 6px grey dot and the step; the clock is the time column's.
    return (
      <span className="agents-list__working">
        <span className="agents-list__working-dot" aria-hidden="true" />
        <span className="agents-list__step">{steady}</span>
      </span>
    );
  }
  return (
    <span className="agents-list__working">
      <span className="agents-list__step">{steady}</span>
      <span className="agents-list__elapsed">{elapsed && ` · ${elapsed}`}</span>
    </span>
  );
}
