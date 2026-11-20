/**
 * Words the desk and the phone both say about a card or a line, kept once
 * so the two never drift (docs/agents.md, "Lines, cards and bars": one word
 * per idea). Pure; no rendering.
 */

import type { Approval, CheckInMark, UsageAccount } from './model';
import { formatWhenInline } from './schedule';

// --- Step in (retired) ------------------------------------------------------

/**
 * An agent's own browser is gone, and with it Step in. A card from before
 * that (it arrives closed, with a legacy `stepIn` object) is this one muted
 * line on the desk and the phone: no Allow, no Deny, never a crash.
 */
export const STEP_IN_RETIRED_LINE = 'This sign-in used the old browser; ask again';

// --- Accounts: "Use this one now" and "Runs on" ---------------------------

// --- First run: bringing agents from another assistant --------------------

/**
 * The one-time card under the Chief's greeting (`ImportChoiceCard`, desk and
 * phone). Asked as "already have…?" because a first-timer read "Bring your
 * agents…?" with the bright button as the step they were meant to take, and
 * they have no agents anywhere.
 */
export const IMPORT_CHOICE_TITLE = 'Already have agents in another assistant?';
export const IMPORT_CHOICE_NOTE =
  'Bring them from Grok, ChatGPT, Claude or anything else. Nothing is created until you say so. New to agents? Start fresh.';
export const IMPORT_CHOICE_DECLINE = 'No thanks, start fresh';
export const IMPORT_CHOICE_BRING = 'Bring my agents';

/**
 * First run's ask under the Chief's greeting (`agents::guide`): a question
 * in the Chief's voice with the assistants as replies. Picking one is the
 * yes; the Chief then walks them through it in the chat, a step at a time.
 */
export const GUIDE_ASK_TEXT =
  'Already have agents somewhere else? Tell me where and I’ll bring them all over, with everything they know. You won’t need to set anything up by hand.';
export const GUIDE_ASK_OPTIONS = [
  { id: 'grok', label: 'Grok' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
  { id: 'other', label: 'Somewhere else' },
] as const;
export const GUIDE_ASK_FRESH = 'I’m starting fresh';

/**
 * Puts an account first in its engine's order, so new work starts on it
 * (desk Usage rows and pages, Settings, phone). Said as what it does: the
 * owner couldn't tell "Use this one now" from switching a running turn.
 */
export const USE_THIS_ONE_NOW = 'Use for new work';
/** Beside the account new work starts on: the one "Use for new work" made first. */
export const NEW_WORK_HERE = 'New work starts here';
/**
 * The same, as a row's state pill (desk Usage rows, phone account rows): the
 * account new work starts on is marked where its state is, not on a line of
 * its own floated under the row.
 */
export const NEW_WORK_PILL = 'Starts new work';

/** "Runs on": the default, the team's order. */
export const RUNS_ON_ANY = 'Any account';
export const RUNS_ON_ANY_DETAIL = 'In order, carrying on with the next when one runs out';

/** Under an account in "Runs on": what pinning to it means, and why it can't run now. */
export function runsOnDetail(a: Pick<UsageAccount, 'signedIn' | 'out'>): string {
  if (!a.signedIn) return 'Not signed in';
  return a.out ? 'Only this one, never another · out of usage now' : 'Only this one, never another';
}

// --- Models -----------------------------------------------------------------

/**
 * A model said by what it's for, desk and phone alike, with the model's own
 * name small beside it ("Smartest · Opus"). Claude Code's aliases always
 * mean the current model of that family, so these stay true as they move.
 * Codex's models have no such families and are shown by their own names.
 */
export const MODEL_PURPOSE: Readonly<Record<string, string>> = {
  opus: 'Smartest',
  sonnet: 'Balanced',
  haiku: 'Fastest',
};

/** No model chosen: whatever Claude Code or Codex picks by itself. */
export const MODEL_DEFAULT = 'Default';

/** "Model", in plain words, where the choice is made. */
export const MODEL_MEANS = 'the AI it thinks with';

// --- Routine lines ----------------------------------------------------------

/** "Routine", said once where someone first meets one (a drafted agent's review). */
export const ROUTINES_MEANS = 'What it does on its own, on a schedule or when something happens.';

/**
 * The head of a routine's line in the chat: "Routine" (repeating) or
 * "Scheduled" (one time), then what fired it, "run now", or that it was
 * late ("late, was due today at 9:00 AM": the app was closed, or it waited
 * for quiet hours).
 */
export function checkInHead(mark: CheckInMark | undefined | null, now = Date.now()): string {
  const parts = [mark?.repeats ? 'Routine' : 'Scheduled'];
  if (mark?.found) parts.push(mark.found);
  if (mark?.manual) parts.push('run now');
  if (mark?.late) parts.push(`late, was due ${formatWhenInline(mark.dueAt, now)}`);
  return parts.join(' · ');
}
