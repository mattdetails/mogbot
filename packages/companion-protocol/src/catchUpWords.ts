/**
 * Catch up's words and order, one place for desk and phone (design: "Catch up,
 * direction 2", spec-catchup-dir2.md). The page is the queue and the open
 * decision; these are the exact words around them, so the two never differ.
 *
 * @module catchUpWords
 */

/** The page, its header count states and every fixed label. */
export const CATCH_UP = {
  title: 'Catch up',
  /** Header count while the summary card is open. */
  summary: 'Summary',
  /** Header count, and the title of the empty state. */
  allClear: 'All clear',
  needsYou: 'Needs you',
  /** The group after the decisions (desk), and the phone's label with a single item. */
  then: 'Then',
  /** The phone's queue under the card. */
  upNext: 'Up next',
  /** Answered rows, at the top of the desk's queue. */
  done: 'Done',
  /** The tag on an item moved to the end. */
  later: 'Later',
  whileAway: 'While you were away',
  gotIt: 'Got it',
  whatsInFlight: 'What’s in flight',
  close: 'Close',
  openChat: 'Open chat',
  allow: 'Allow',
  deny: 'Deny',
  details: 'Details',
  /** The empty queue's one row. */
  nothingWaiting: 'Nothing waiting',
  nothingNeedsYou: 'Nothing needs you.',
  /** A queue row's kind, where the eyebrow would be too long for it. */
  needsSignIn: 'Needs sign-in',
} as const;

/** What a decision is, over its title: the amber dot's words. */
export type CatchUpEyebrow = 'needsOk' | 'didntFinish' | 'needsInput';

export const CATCH_UP_EYEBROW: Record<CatchUpEyebrow, string> = {
  needsOk: 'Needs your OK',
  didntFinish: 'Didn’t finish',
  needsInput: 'Needs your input',
};

/** A count as the page shows it: `99+` from 100 up. */
export const catchUpCount = (n: number): string => (n >= 100 ? '99+' : String(n));

/** "N left": decisions remain. */
export const catchUpLeft = (n: number): string => `${catchUpCount(n)} left`;

/** The phone's header, with several: "1 of 3". */
export const catchUpOf = (at: number, n: number): string =>
  `${catchUpCount(at)} of ${catchUpCount(n)}`;

/** A group's label: "Needs you · 3", "Up next · 2". */
export const catchUpGroup = (label: string, n: number): string => `${label} · ${catchUpCount(n)}`;

/** "1 thing", "6 things". */
export const catchUpThings = (n: number): string =>
  `${catchUpCount(n)} ${n === 1 ? 'thing' : 'things'}`;

/** The summary row in the queue: "6 things, no decisions". */
export const catchUpThingsNoDecisions = (n: number): string => `${catchUpThings(n)}, no decisions`;

/** The summary card's head: "6 things · no decisions". */
export const catchUpThingsHead = (n: number): string => `${catchUpThings(n)} · no decisions`;

/**
 * The all-clear sentence. The time of the last decision is the user's own
 * clock format and appears only when it is known.
 */
export const catchUpAllClearBody = (lastDecision?: string): string =>
  lastDecision
    ? `${CATCH_UP.nothingNeedsYou} Last decision: ${lastDecision}.`
    : CATCH_UP.nothingNeedsYou;

/** How many rows the summary shows before "+ N more". */
export const CATCH_UP_SUMMARY_ROWS = 6;

/** "+ 3 more" under a long summary. */
export const catchUpMore = (n: number): string => `+ ${catchUpCount(n)} more`;

/**
 * A queue row's age, in the short style (no "ago"): `now`, `12m`, `1h`, `20h`,
 * `3d`, and a plain date ("Nov 18") from a week on.
 */
export function catchUpAge(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ------------------------------------------- the entry (spec-catchup-entry, A) */

/** The entry's fixed words: one hero card, then the quiet list. */
export const CATCH_UP_ENTRY = {
  start: 'Start catching up',
  review: 'Review it',
  continue: 'Continue',
  orPickOne: 'Or pick one',
  open: 'Open',
  allCaughtUp: 'All caught up',
  earlierToday: 'Earlier today',
} as const;

/** "7 things need you" / "1 thing needs you". */
export const catchUpNeedYou = (n: number): string =>
  `${catchUpThings(n)} ${n === 1 ? 'needs' : 'need'} you`;

/** "From 6 agents" / "From 1 agent". No time estimate: it would be a guess. */
export const catchUpFromAgents = (n: number): string =>
  `From ${catchUpCount(n)} ${n === 1 ? 'agent' : 'agents'}`;

/** One thing waiting: "From Mail", the agent it's from. */
export const catchUpFromAgent = (name: string): string => `From ${name}`;

/** Mid-run: "3 done · from 4 agents" (the agents still waiting). */
export const catchUpDoneFrom = (done: number, agents: number): string =>
  `${catchUpCount(done)} done · from ${catchUpCount(agents)} ${agents === 1 ? 'agent' : 'agents'}`;

/** All caught up's line: "Nothing needs you. Last one 2:02 pm." when known. */
export const catchUpCaughtUpBody = (lastDecision?: string): string =>
  lastDecision ? `${CATCH_UP.nothingNeedsYou} Last one ${lastDecision}.` : CATCH_UP.nothingNeedsYou;

/**
 * Stale: what the card shows was read at this time, and couldn't be read
 * since. The phone couldn't reach the Mac; on the desk the app is on the Mac,
 * so it says it couldn't refresh.
 */
export const catchUpStale = (readAt: string, on: 'desk' | 'phone' = 'phone'): string =>
  `From ${readAt} · ${on === 'desk' ? 'couldn’t refresh' : 'couldn’t reach your Mac'}`;
