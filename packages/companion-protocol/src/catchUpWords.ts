/**
 * The words of Catch up, and their order, said once for the desk
 * (`components/agents/AgentsCatchUp.tsx`) and the phone, so the two can't
 * drift apart. Spec: Designer's "Catch up, direction 2".
 *
 * @module catchUpWords
 */

/** A count in a label: 99+ from a hundred. */
export const countLabel = (n: number): string => (n >= 100 ? '99+' : String(n));

export const CATCH_UP = {
  title: 'Catch up',
  inFlight: 'What’s in flight',
  close: 'Close',
  later: 'Later',
  laterTag: 'Later',
  openChat: 'Open chat',
  allow: 'Allow',
  deny: 'Deny',
  details: 'Details',
  gotIt: 'Got it',
  summaryTitle: 'While you were away',
  allClear: 'All clear',
  nothingWaiting: 'Nothing waiting',
  then: 'Then',
} as const;

/** The group labels, in order: Done (once something is answered), Needs you, Then. */
export const groupLabel = {
  needsYou: (n: number) => `Needs you · ${countLabel(n)}`,
  done: (n: number) => `Done · ${countLabel(n)}`,
  upNext: (n: number) => `Up next · ${countLabel(n)}`,
  then: CATCH_UP.then,
};

export type CatchUpHeadState =
  | { kind: 'left'; left: number }
  | { kind: 'later'; later: number }
  | { kind: 'summary' }
  | { kind: 'clear' };

/** The count beside the title: `N left`, `Summary`, `All clear`; the phone adds `1 of 3`. */
export function headCount(s: CatchUpHeadState): string {
  if (s.kind === 'left') return `${countLabel(s.left)} left`;
  if (s.kind === 'later') return `${countLabel(s.later)} for Later`;
  return s.kind === 'summary' ? 'Summary' : CATCH_UP.allClear;
}

/** "1 of 3" on the phone: where this decision is in what's left. */
export const position = (index: number, total: number): string => `${index + 1} of ${total}`;

/** The eyebrow over a card: what kind of ask it is, never the card's own title. */
export function eyebrow(kind: 'ok' | 'input' | 'unfinished'): string {
  return kind === 'unfinished'
    ? 'Didn’t finish'
    : kind === 'input'
      ? 'Needs your input'
      : 'Needs your OK';
}

/** "6 things, no decisions" (the row in Then) and "6 things · no decisions" (the card's head). */
export const summaryLine = (n: number): string =>
  `${n} ${n === 1 ? 'thing' : 'things'}, no decisions`;
export const summaryHead = (n: number): string =>
  `${n} ${n === 1 ? 'thing' : 'things'} · no decisions`;

/** "+ 3 more" under a full summary. */
export const moreLine = (n: number): string => `+ ${n} more`;

/** The empty state's line; the time only when it is known. */
export const allClearLine = (lastDecision?: string): string =>
  lastDecision ? `Nothing needs you. Last decision: ${lastDecision}.` : 'Nothing needs you.';

/** The most rows a summary shows. */
export const SUMMARY_MAX = 6;
