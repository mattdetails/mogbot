/**
 * Terminal tabs on the wallet's accounts: the TS half of
 * `src-tauri/src/agents/tab_accounts.rs`.
 *
 * A Claude Code tab in a Default-workspace project that runs out of usage is
 * told so with one notice (`tab-account`): move to the next account (on its
 * own, or when the user says so), or every account is out and when the first
 * is back. Moving restarts the tab's process with `--resume` on the next
 * account (the backend picks it as the process opens) and `prompt` as its
 * opening message, so the same conversation carries on.
 *
 * @module lib/tabAccounts
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type TabAccountMode = 'auto' | 'ask' | 'off';

export interface TabAccountNotice {
  sessionId: string;
  kind: 'switch' | 'allOut';
  /** Wait for the user's click before switching. */
  ask: boolean;
  /** The one line said about it, written by the backend. */
  line: string;
  /** The account it moves to, as it is shown. */
  to?: string;
  /** The opening prompt on the next account. */
  prompt?: string;
}

/** A notice that came while no tab was showing this session. */
export function tabAccountNotice(sessionId: string): Promise<TabAccountNotice | null> {
  return invoke<TabAccountNotice | null>('tab_account_notice', { sessionId });
}

/** The tab switched, or the user put the notice away. */
export function settleTabAccount(sessionId: string): Promise<void> {
  return invoke('tab_account_settle', { sessionId });
}

export function getTabAccountMode(): Promise<TabAccountMode> {
  return invoke<TabAccountMode>('tab_account_mode');
}

export function setTabAccountMode(mode: TabAccountMode): Promise<TabAccountMode> {
  return invoke<TabAccountMode>('tab_account_set_mode', { mode });
}

/** Notices for one tab's session. */
export function onTabAccountNotice(
  sessionId: string,
  handler: (notice: TabAccountNotice) => void
): Promise<UnlistenFn> {
  return listen<TabAccountNotice>('tab-account', (event) => {
    if (event.payload.sessionId !== sessionId) return;
    handler(event.payload);
  });
}

/** One account on a terminal tab's chip (`tab_accounts::TabAccount`). */
export interface TabAccountOption {
  id: string;
  /** Its name as shown everywhere. */
  name: string;
  /** Its line in the menu: "Work · 61% left", "Personal · out until 4 PM". */
  label: string;
  /** Left of its tighter limit, 0–100. */
  leftPercent?: number | null;
  out: boolean;
  current: boolean;
  /** Left of its 5-hour limit, 0–100, when read. */
  sessionLeft?: number | null;
  /** Left of its weekly limit, 0–100, when read. */
  weekLeft?: number | null;
}

/**
 * "Continue on Personal?": the tab's account will likely run out before it
 * refills (an estimate from its own readings) and another has room
 * (`tab_accounts::Suggestion`). Offered, never done on its own.
 */
export interface TabAccountSuggestion {
  estimate: true;
  toId: string;
  toName: string;
  /** "At this pace Work runs out at 3:40 PM, before its 5-hour limit refills (an estimate). Personal has 80% left." */
  line: string;
}

/** What a terminal tab's account chip shows (`tab_accounts::TabAccounts`). */
export interface TabAccountInfo {
  /** The account the tab runs on; absent: this Mac's own sign-in. */
  current?: string | null;
  /** Empty: the tab can't change accounts, and no chip is shown. */
  accounts: TabAccountOption[];
  suggest?: TabAccountSuggestion | null;
}

export function tabAccountInfo(sessionId: string): Promise<TabAccountInfo> {
  return invoke<TabAccountInfo>('tab_account_info', { sessionId });
}

/**
 * Move a tab to another account: it starts there next, and the returned
 * notice is run by the tab (restart with its conversation, as a switch is).
 */
export function chooseTabAccount(sessionId: string, accountId: string): Promise<TabAccountNotice> {
  return invoke<TabAccountNotice>('tab_account_choose', { sessionId, accountId });
}

/** Any tab's account notice (the chip refreshes on one). */
export function onAnyTabAccountNotice(
  handler: (notice: TabAccountNotice) => void
): Promise<UnlistenFn> {
  return listen<TabAccountNotice>('tab-account', (event) => handler(event.payload));
}
