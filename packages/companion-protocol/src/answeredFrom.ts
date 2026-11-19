/**
 * How a card was answered, in the folded line ("Allowed on your phone"): the
 * Mac says where the answer came from (`Approval.answeredFrom`), desk and phone
 * word it once, here. A card from an older Mac has no field and says nothing
 * extra; an answer given at the desk, where the user is looking, needs none.
 * Also the one sentence under "Always allow" (`Approval.alwaysNote`) and the
 * test for a note that says there is no Always to offer.
 *
 * @module answeredFrom
 */

import type { AnsweredFrom } from './model';

const ALLOWED: Record<AnsweredFrom, string | null> = {
  desk: null,
  phone: 'Allowed on your phone',
  phoneLockScreen: 'Allowed from the Lock Screen',
  plan: 'Allowed with the plan',
  auto: 'Allowed on its own',
  admin: 'Allowed by the Chief',
  rule: 'Allowed by your rule',
};

const DENIED: Record<AnsweredFrom, string | null> = {
  desk: null,
  phone: 'Declined on your phone',
  phoneLockScreen: 'Declined from the Lock Screen',
  plan: 'Declined with the plan',
  auto: 'Declined on its own',
  admin: 'Declined by the Chief',
  rule: 'Declined by your rule',
};

/** The outcome line for where an answer came from, or null to keep the plain one. */
export function answeredWords(
  status: string,
  from: AnsweredFrom | undefined
): string | null {
  if (!from) return null;
  if (status === 'allowed') return ALLOWED[from] ?? null;
  if (status === 'denied') return DENIED[from] ?? null;
  return null;
}

/** The Mac's note says this can't be always allowed: it replaces the Always item. */
export function cantAlwaysAllow(note: string | undefined): boolean {
  return !!note && /^can['’]t be always allowed/i.test(note.trim());
}
