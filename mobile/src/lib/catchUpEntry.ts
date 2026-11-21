/**
 * Catch up's entry (Designer's spec-catchup-entry, option A, 20 Nov): one
 * hero card that says how much needs you and from whom, and one button into
 * the one-at-a-time flow. What it says, worked out from what's known: no
 * time estimate ("about 3 minutes" was a guess; the app shows only known data).
 */

import { useSyncExternalStore } from 'react';

export interface HeroWords {
  title: string;
  /** The line under it; null when there's nothing true to add. */
  sub: string | null;
  button: 'Start catching up' | 'Review it' | 'Continue';
  /** Mid-run: how far through, 0 to 1. */
  progress: number | null;
}

/**
 * The card for `waiting` things from `agents` agents. `one` is the single
 * thing's words ("Lead Gen · Send 12 intro emails as you"). `run` is how
 * many there were when you started catching up, if you did and left part way.
 */
export function heroWords(
  waiting: number,
  agents: number,
  one: string | null,
  run: number | null
): HeroWords | null {
  if (waiting <= 0) return null;
  const done = run !== null && run > waiting ? run - waiting : 0;
  if (done > 0) {
    const from = agents === 1 ? 'from 1 agent' : `from ${agents} agents`;
    return {
      title: `${waiting} left`,
      sub: `${done} done · ${from}`,
      button: 'Continue',
      progress: done / run!,
    };
  }
  if (waiting === 1) {
    return { title: '1 thing needs you', sub: one, button: 'Review it', progress: null };
  }
  return {
    title: `${waiting} things need you`,
    sub: agents > 1 ? `From ${agents} agents` : null,
    button: 'Start catching up',
    progress: null,
  };
}

/** Offline: "From 20:14 · couldn't reach your Mac" (the time only when known). */
export function staleLine(lastSeenAt: number, your: string, clock: (at: number) => string): string {
  return lastSeenAt
    ? `From ${clock(lastSeenAt)} · couldn’t reach ${your}`
    : `Couldn’t reach ${your}`;
}

// ---- A run: how many there were when you started ----------------------------------

let started: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** You started catching up with `count` waiting. */
export function startRun(count: number) {
  started = count;
  emit();
}

/** All caught up (or more came than there were): the next start is a new run. */
export function endRun() {
  if (started === null) return;
  started = null;
  emit();
}

/** The count a run started with, or null outside one. */
export function useRun(): number | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => started
  );
}
