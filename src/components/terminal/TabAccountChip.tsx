/**
 * TabAccountChip — which account a project's Claude Code tab runs on, in the
 * terminal header, and one click to move it: "Account: Work ⌄". Picking
 * another account restarts the tab there with its conversation, the same way
 * a tab that runs out moves on (`lib/tabAccounts`, `agents/tab_accounts.rs`).
 * Shown only where the tab can change accounts (the Default workspace, two
 * Claude Code accounts signed in, switching not off); otherwise nothing.
 *
 * @module components/terminal/TabAccountChip
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckIcon, ChevronIcon } from '@/components/icons';
import { Dropdown, DropdownItem } from '../primitives/Dropdown';
import { MenuButton } from '../primitives/MenuButton';
import {
  chooseTabAccount,
  onAnyTabAccountNotice,
  tabAccountInfo,
  type TabAccountInfo,
  type TabAccountNotice,
} from '../../lib/tabAccounts';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { useOptionalToast } from '../../contexts/ToastContext';

/** What a tab on no account of the list runs on. */
export const THIS_MAC_SIGN_IN = 'This Mac’s sign-in';

/** After a move the tab restarts; its new account is read again after these. */
const AFTER_MOVE_MS = [1500, 5000];

interface TabAccountChipProps {
  /** The tab's session (its PTY session id). */
  sessionId: string;
  /** Run the move in the tab: restart on the account with its conversation. */
  onSwitch: (notice: TabAccountNotice) => void;
}

export function TabAccountChip({ sessionId, onSwitch }: TabAccountChipProps) {
  const { showToast } = useOptionalToast();
  // Kept with the session it was read for, so another tab's list never shows
  // while this one's loads (no reset in the effect).
  const [read, setRead] = useState<{ sessionId: string; info: TabAccountInfo | null }>({
    sessionId,
    info: null,
  });
  const info = read.sessionId === sessionId ? read.info : null;

  const load = useCallback(() => {
    tabAccountInfo(sessionId)
      .then((info) => setRead({ sessionId, info }))
      .catch(() => setRead({ sessionId, info: null }));
  }, [sessionId]);

  useEffect(() => {
    load();
    let live = true;
    let unlisten: (() => void) | null = null;
    void onAnyTabAccountNotice((n) => {
      if (n.sessionId === sessionId) window.setTimeout(load, AFTER_MOVE_MS[0]);
    }).then((u) => {
      if (live) unlisten = u;
      else u();
    });
    return () => {
      live = false;
      unlisten?.();
    };
  }, [sessionId, load]);

  const move = async (accountId: string) => {
    try {
      const notice = await chooseTabAccount(sessionId, accountId);
      onSwitch(notice);
      for (const ms of AFTER_MOVE_MS) window.setTimeout(load, ms);
    } catch (error) {
      showToast(formatCommandError(asCommandError(error)), 'error');
    }
  };

  if (!info || info.accounts.length < 2) return null;
  const current = info.current ?? THIS_MAC_SIGN_IN;
  return (
    <Dropdown
      align="right"
      portal
      quietOpen
      className="tab-account-chip"
      menuClassName="tab-account-chip__menu"
      onOpenChange={(open) => open && load()}
      trigger={(p) => (
        <MenuButton
          {...p}
          tabIndex={0}
          expanded={p['aria-expanded']}
          variant="ghost"
          size="compact"
          className="tab-account-chip__button"
          rightIcon={<ChevronIcon size={12} />}
          title={`This tab runs on ${current}. Click to continue it on another account.`}
          aria-label={`Account for this tab: ${current}. Change account`}
        >
          <span className="tab-account-chip__words">
            <span className="tab-account-chip__key">Account</span>
            {current}
          </span>
        </MenuButton>
      )}
    >
      <p className="tab-account-chip__heading">Continue this chat on</p>
      {info.accounts.map((a) => (
        <DropdownItem key={a.id} onSelect={() => !a.current && void move(a.id)}>
          <span className="tab-account-chip__label">{a.label}</span>
          <span className="tab-account-chip__check" aria-hidden="true">
            {a.current && <CheckIcon size={12} />}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
