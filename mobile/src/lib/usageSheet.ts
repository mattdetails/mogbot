/**
 * The chat header's usage ring and its Usage sheet, as figures and words.
 * The logic is shared with the desk's ring and popover, so both say the
 * same thing: `packages/companion-protocol/src/usageSheet.ts`. Only what the
 * Mac serves; the pace line is the Mac's own estimate, labelled as one.
 */

import type { UsageInventory } from '@shipstudio/companion-protocol';

export {
  accountBlocks,
  computeView,
  contextMeter,
  type ComputeRow,
  type ComputeView,
  paceLine,
  planUsage,
  resetsLine,
  ringPercent,
  roughWhen,
  tokensShort,
  usageSheet,
  weeklyLabel,
  type AccountBlock,
  type ActiveUsage,
  type PaceLine,
  type PlanUsage,
  type UsageMeter,
  type UsageTone,
} from '@shipstudio/companion-protocol';


/**
 * A new read of the Mac's accounts, keeping the last real reading of any
 * account this one came back without (a check that didn't answer, a Mac
 * still starting): its windows that haven't refilled yet stay, rather than
 * the sheet dropping to "Not read yet" or a figure that isn't one. Only
 * what the Mac once reported, never a guess; a window past its refill is
 * dropped, since what it said no longer holds.
 */
export function keepReadings(
  prev: UsageInventory | null,
  next: UsageInventory,
  now = Date.now()
): UsageInventory {
  if (!prev) return next;
  const accounts = next.accounts.map((a) => {
    if (a.windows.length > 0 || !a.signedIn) return a;
    const was = prev.accounts.find((p) => p.engine === a.engine && p.id === a.id);
    const still = (was?.windows ?? []).filter((w) => w.resetsAt === undefined || w.resetsAt > now);
    return still.length > 0 ? { ...a, windows: still, plan: a.plan ?? was?.plan } : a;
  });
  return { ...next, accounts };
}
