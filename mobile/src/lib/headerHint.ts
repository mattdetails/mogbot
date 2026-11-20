/**
 * The quiet chat header (Designer's spec-header-dropdown, Julian's pick, 20 Nov):
 * the bar holds only who you're talking to, plus one 6px hint dot, and
 * everything about the agent right now lives behind the name, in a sheet.
 * This is what the dot and the sheet's Now row say, worked out from what the
 * Mac sent and nothing else.
 */

import { failureFix, failureLine, previewText } from '@shipstudio/companion-protocol';
import type { Agent } from '@shipstudio/companion-protocol';
import { failedTurn, needsYou } from './agents';

/** The dot after the name: one at a time, by priority; null draws none. */
export type HeaderHint = 'waits' | 'failed' | 'working' | null;

/**
 * Amber when something waits on you (a request, or a task line waiting on
 * you), red when the last turn didn't finish, blue while it works, none when
 * idle or paused for the refill (a usage limit isn't a failure: it ends by
 * itself).
 */
export function headerHint(agent: Agent): HeaderHint {
  if (needsYou(agent) || (agent.tasks?.waits ?? 0) > 0) return 'waits';
  const failure = failedTurn(agent);
  if (failure && failure.kind !== 'usage_limit') return 'failed';
  if (agent.status.state === 'working' || agent.takeover) return 'working';
  return null;
}

/** The dot's words, for VoiceOver (the dot alone says nothing to it). */
export function headerHintLabel(hint: HeaderHint): string | undefined {
  switch (hint) {
    case 'waits':
      return 'Waits on you';
    case 'failed':
      return 'Didn’t finish';
    case 'working':
      return 'Working';
    default:
      return undefined;
  }
}

export type NowTone = 'working' | 'waits' | 'failed' | 'idle';

/** The sheet's Now row: a dot, the line, and how long it's been at it. */
export interface NowLine {
  tone: NowTone;
  text: string;
  /** "3m": only while working, from when the Mac says the turn began. */
  time?: string;
  /** A failed turn: whether it can be picked up from here ("Try again"). */
  retryable?: boolean;
}

/** "3m", "1h 5m", "2d 4h": the short form the spec's rows use. */
export function shortSpan(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/**
 * The Now row, in the spec's words: "Drafting intros · 3m", "Waiting for your
 * OK", "Didn't finish: <reason>", "Paused until the refill · 1d 10h", "Idle".
 */
export function nowLine(agent: Agent, engine: string, now = Date.now()): NowLine {
  if (needsYou(agent)) return { tone: 'waits', text: 'Waiting for your OK' };
  const failure = failedTurn(agent);
  if (failure?.kind === 'usage_limit') {
    return {
      tone: 'idle',
      text: failure.resetsAt
        ? `Paused until the refill · ${shortSpan(failure.resetsAt - now)}`
        : 'Paused until the refill',
    };
  }
  if (failure) {
    const reason = failureLine(failure, previewText(agent.preview), engine, now).replace(
      / · didn’t finish$/,
      ''
    );
    const fix = failureFix(failure.kind);
    return {
      tone: 'failed',
      text: reason === 'Didn’t finish' ? reason : `Didn’t finish: ${reason}`,
      retryable: fix === 'retry' || fix === 'continue',
    };
  }
  if (agent.takeover) return { tone: 'working', text: 'You’re driving it on your Mac' };
  if (agent.status.state === 'working') {
    const text = agent.status.activity?.trim() || agent.tasks?.doing?.trim() || 'Working';
    return {
      tone: 'working',
      text,
      time: agent.status.since ? shortSpan(now - agent.status.since) : undefined,
    };
  }
  return { tone: 'idle', text: 'Idle' };
}

/** "5 to do", and "2 wait on you" / "1 waits on you", for the Tasks label row. */
export function taskSummary(toDo: number, waits: number): { toDo: string; waits?: string } {
  return {
    toDo: `${toDo} to do`,
    waits: waits > 0 ? `${waits} ${waits === 1 ? 'waits' : 'wait'} on you` : undefined,
  };
}

/** "2 requests need your OK" / "1 request needs your OK". */
export function requestsLine(n: number): string {
  return n === 1 ? '1 request needs your OK' : `${n} requests need your OK`;
}
