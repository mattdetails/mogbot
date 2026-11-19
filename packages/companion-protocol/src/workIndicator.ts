/**
 * The working indicator's words (desk and phone): one row at the end of the
 * chat, the agent's key and one phrase made from what the Mac observed (a
 * step's own plain words, never a new model call). Pure, so both sides say the
 * same thing and the rules are tested.
 *
 * - No step observed yet: "Working on it".
 * - A step: its words as the Mac gave them ("Reading Northwind's site",
 *   "In Chrome on linkedin.com", "Running the tests"), and "3 of 8" only when
 *   the step itself reports it (`LiveCall.progress`), never worked out.
 * - A seconds timer only after 8s, then "1m 40s".
 * - Quiet (no new step for a minute): "Still working" and the time.
 * - Waiting on you: "Needs your OK on 12 emails" with a real Review.
 *
 * @module workIndicator
 */

import type { Approval, LiveCall, TurnWork } from './model';
import { formatDuration } from './work';

/** The timer shows only once a turn has run this long. */
export const TIMER_FROM_MS = 8_000;
/** No new step for this long reads as quiet: "Still working". */
export const STILL_WORKING_AFTER_MS = 60_000;
/** Said when no step has been observed yet. */
export const WORKING_ON_IT = 'Working on it';
export const STILL_WORKING = 'Still working';

export interface IndicatorWords {
  /** The phrase. */
  phrase: string;
  /** "3 of 8", only when the step reports it. */
  progress: string | null;
  /** "8s", "1m 40s": after 8s only. */
  elapsed: string | null;
  /** Quiet: no shimmer, "Still working". */
  quiet: boolean;
}

const progressOf = (call: LiveCall | undefined): string | null =>
  call?.progress && call.progress.total > 0 && call.progress.done <= call.progress.total
    ? `${call.progress.done} of ${call.progress.total}`
    : null;

/** When the newest thing happened: the last step, the call in flight, else the turn's start. */
export function lastMoveAt(work: TurnWork): number {
  const steps = work.steps;
  const lastStep = steps.length ? steps[steps.length - 1].at : 0;
  // A sign of life (output, CPU) counts as a move: a long test run isn't quiet.
  return Math.max(work.startedAt, lastStep, work.current?.startedAt ?? 0, work.lastSignAt ?? 0);
}

export function indicatorWords(
  activity: string | null | undefined,
  work: TurnWork | undefined,
  now: number
): IndicatorWords {
  const call = work?.current;
  const ran = work ? now - work.startedAt : 0;
  const elapsed = work && ran >= TIMER_FROM_MS ? formatDuration(ran) : null;
  const quiet = Boolean(work && now - lastMoveAt(work) >= STILL_WORKING_AFTER_MS);
  const observed = call?.label ?? activity ?? null;
  if (quiet) return { phrase: STILL_WORKING, progress: null, elapsed, quiet: true };
  return {
    phrase: observed || WORKING_ON_IT,
    progress: progressOf(call),
    elapsed,
    quiet: false,
  };
}

/** What waits on the user, in words: "12 emails" for one plan of twelve sends, else "3 requests". */
export function okWhat(pending: Approval[]): string {
  if (pending.length === 1) {
    const actions = pending[0].plan?.actions ?? [];
    const sends = actions.filter((a) => a.kind === 'send');
    if (sends.length > 0 && sends.length === actions.length && sends.every((a) => a.target.includes('@'))) {
      return `${sends.length} ${sends.length === 1 ? 'email' : 'emails'}`;
    }
  }
  return `${pending.length} ${pending.length === 1 ? 'request' : 'requests'}`;
}

export const needsOkLine = (pending: Approval[]): string => `Needs your OK on ${okWhat(pending)}`;
