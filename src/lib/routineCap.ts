/**
 * An agent's routines cap, in words (`agents/routine_cap.rs`).
 *
 * The cap is in tokens as the engines report them, over the agent's own week
 * (today and the six days before, as its Usage tab counts it). Never a
 * percent of a plan's limit or a dollar figure: no engine reports either per
 * agent. Past the cap its scheduled and "When…" routines don't start; the
 * user's own messages still run.
 *
 * @module lib/routineCap
 */

import { tokensShortly } from '../../packages/companion-protocol/src/usageGlance';
import type { RoutineCapStatus } from './agents';

/** The caps offered, in tokens. A cap set from chat that isn't one is listed too. */
export const ROUTINE_CAP_PRESETS = [
  250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000,
] as const;

/** The control's one sentence about what it does. */
export const ROUTINE_CAP_NOTE =
  'Tokens as its engine reports them, this week being today and the 6 days before. Past the cap, its scheduled and “When…” routines don’t start; your own messages, Run now and one-time reminders still run. It lifts as older days leave the week, or when you raise or clear it.';

/** "2M tokens". */
export function capLabel(tokens: number): string {
  return `${tokensShortly(tokens)} tokens`;
}

/** The menu: Off, the presets, and the current cap when it isn't one of them. */
export function routineCapChoices(current?: number): { value: string; label: string }[] {
  const values: number[] = [...ROUTINE_CAP_PRESETS];
  if (current && !values.includes(current)) {
    values.push(current);
    values.sort((a, b) => a - b);
  }
  return [
    { value: '0', label: 'Off' },
    ...values.map((v) => ({ value: String(v), label: capLabel(v) })),
  ];
}

/** "tomorrow", "on Tue", "on Nov 26": a day ahead of `now`, as the chat says it. */
export function liftDayWords(day: string, now: Date = new Date()): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return 'later';
  const then = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((then.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 6) return `on ${then.toLocaleDateString('en-US', { weekday: 'short' })}`;
  return `on ${then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** Where it stands this week: "1.2M of 2M tokens this week", or reached and when it lifts. */
export function routineCapLine(status: RoutineCapStatus, now: Date = new Date()): string {
  const of = `${tokensShortly(status.used)} of ${tokensShortly(status.tokens)} tokens this week`;
  if (!status.reached) return of;
  const lifts = status.liftsOn
    ? ` They start again ${liftDayWords(status.liftsOn, now)} if nothing more runs.`
    : '';
  return `Reached: ${of}. Its routines don’t start.${lifts}`;
}
