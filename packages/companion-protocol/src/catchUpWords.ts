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
export const catchUpGroup = (label: string, n: number): string =>
  `${label} · ${catchUpCount(n)}`;

/** "1 thing", "6 things". */
export const catchUpThings = (n: number): string => `${catchUpCount(n)} ${n === 1 ? 'thing' : 'things'}`;

/** The summary row in the queue: "6 things, no decisions". */
export const catchUpThingsNoDecisions = (n: number): string => `${catchUpThings(n)}, no decisions`;

/** The summary card's head: "6 things · no decisions". */
export const catchUpThingsHead = (n: number): string => `${catchUpThings(n)} · no decisions`;

/**
 * The all-clear sentence. The time of the last decision is the user's own
 * clock format and appears only when it is known.
 */
export const catchUpAllClearBody = (lastDecision?: string): string =>
  lastDecision ? `${CATCH_UP.nothingNeedsYou} Last decision: ${lastDecision}.` : CATCH_UP.nothingNeedsYou;

/** How many rows the summary shows before "+ N more". */
export const CATCH_UP_SUMMARY_ROWS = 6;

/** "+ 3 more" under a long summary. */
export const catchUpMore = (n: number): string => `+ ${catchUpCount(n)} more`;
