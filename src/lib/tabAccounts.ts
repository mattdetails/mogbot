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
