/**
 * TabAccountChip — which account a project's Claude Code tab runs on, at the
 * foot of the terminal where it is seen: a small meter of what it has left,
 * "Work · 61% left", and "Auto" while tabs move on their own.
 *
 * One click opens the menu: continue this chat on another account (the tab
 * restarts there with its conversation, the same way a tab that runs out
 * moves on: `lib/tabAccounts`, `agents/tab_accounts.rs`), and what happens
 * when this account runs out: Switch on its own or Ask me (the same choice as
 * Settings → Accounts & usage; Off stays there, since an Off tab has no chip
 * until it restarts). Each account says its 5-hour and weekly room apart.
 *
 * When the tab's account will likely run out before it refills (an estimate
 * from its own readings, `tab_accounts::suggestion_of`) and another has room,
 * the chip says "Switch?" and its menu opens on that offer: continue on that
 * account, or Not now (for this tab and that account). Shown only where the tab can change accounts (the
 * Default workspace, two Claude Code accounts signed in, switching not off);
 * otherwise nothing.
 *
 * @module components/terminal/TabAccountChip
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckIcon, ChevronIcon } from '@/components/icons';
import { Dropdown, DropdownDivider, DropdownItem } from '../primitives/Dropdown';
import { MenuButton } from '../primitives/MenuButton';
import {
  chooseTabAccount,
  getTabAccountMode,
  onAnyTabAccountNotice,
  setTabAccountMode,
  tabAccountInfo,
  type TabAccountInfo,
  type TabAccountMode,
  type TabAccountNotice,
  type TabAccountOption,
} from '../../lib/tabAccounts';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { useOptionalToast } from '../../contexts/ToastContext';
import { usePolling } from '../../hooks/usePolling';

/** What a tab on no account of the list runs on. */
export const THIS_MAC_SIGN_IN = 'This Mac’s sign-in';

/** After a move the tab restarts; its new account is read again after these. */
const AFTER_MOVE_MS = [1500, 5000];
/** How often what's left is read again while the chip shows. */
const REFRESH_MS = 60_000;
/** At or under this much left, the meter turns amber. */
export const LOW_LEFT_PERCENT = 20;

/** The two choices offered here; Off is in Settings only. */
const MODES: { value: TabAccountMode; label: string }[] = [
  { value: 'auto', label: 'Switch on its own' },
  { value: 'ask', label: 'Ask me' },
];

interface TabAccountChipProps {
  /** The tab's session (its PTY session id). */
  sessionId: string;
  /** Run the move in the tab: restart on the account with its conversation. */
  onSwitch: (notice: TabAccountNotice) => void;
}

/**
 * What is left, said once: "5h 40% · week 61% left" when both limits were
 * read, else "61% left", "out", or nothing.
 */
export function leftWords(
  a: Pick<TabAccountOption, 'out' | 'leftPercent' | 'sessionLeft' | 'weekLeft'> | undefined
): string | null {
  if (!a) return null;
  if (a.out) return 'out';
  if (a.sessionLeft != null && a.weekLeft != null) {
    return `5h ${a.sessionLeft}% · week ${a.weekLeft}% left`;
  }
  return a.leftPercent != null ? `${a.leftPercent}% left` : null;
}

/** An account's second line in the menu: "5-hour 40% left · weekly 61% left". */
export function limitsLine(a: TabAccountOption): string | null {
  if (a.out) return null;
  const parts = [
    a.sessionLeft != null ? `5-hour ${a.sessionLeft}% left` : null,
    a.weekLeft != null ? `weekly ${a.weekLeft}% left` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** The meter's level: how full, and whether it is low or out. */
export function meterOf(
  left: number | null | undefined,
  out: boolean
): {
  fill: number;
  level: 'ok' | 'low' | 'out' | 'unknown';
} {
  if (out) return { fill: 0, level: 'out' };
  if (left == null) return { fill: 0, level: 'unknown' };
  const fill = Math.max(0, Math.min(100, left));
  return { fill, level: fill <= LOW_LEFT_PERCENT ? 'low' : 'ok' };
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
  const [mode, setMode] = useState<TabAccountMode | null>(null);
  // "Not now" on an offer: this tab, that account, until the tab moves.
  const [declined, setDeclined] = useState<string | null>(null);

  const load = useCallback(() => {
    tabAccountInfo(sessionId)
      .then((info) => setRead({ sessionId, info }))
      .catch(() => setRead({ sessionId, info: null }));
    getTabAccountMode()
      .then(setMode)
      .catch(() => undefined);
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

  const shown = Boolean(info && info.accounts.length >= 2);
  usePolling(() => Promise.resolve(load()), {
    intervalMs: REFRESH_MS,
    enabled: shown,
    name: 'tabAccountChip',
  });

  const move = async (accountId: string) => {
    try {
      const notice = await chooseTabAccount(sessionId, accountId);
      onSwitch(notice);
      for (const ms of AFTER_MOVE_MS) window.setTimeout(load, ms);
    } catch (error) {
      showToast(formatCommandError(asCommandError(error)), 'error');
    }
  };

  const chooseMode = async (next: TabAccountMode) => {
    if (next === mode) return;
    try {
      setMode(await setTabAccountMode(next));
    } catch (error) {
      showToast(formatCommandError(asCommandError(error)), 'error');
    }
  };

  if (!info || !shown) return null;
  const currentAccount = info.accounts.find((a) => a.current);
  const current = info.current ?? THIS_MAC_SIGN_IN;
  const meter = currentAccount ? meterOf(currentAccount.leftPercent, currentAccount.out) : null;
  const left = leftWords(currentAccount);
  const shortLeft = currentAccount?.out
    ? 'out'
    : currentAccount?.leftPercent != null
      ? `${currentAccount.leftPercent}% left`
      : null;
  const auto = mode === 'auto';
  const offer =
    info.suggest && declined !== `${sessionId}:${info.suggest.toId}` ? info.suggest : null;
  const summary = [
    current,
    left,
    offer ? `may run out before it refills, ${offer.toName} has room` : null,
    auto ? 'switches on its own when out' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Dropdown
      align="left"
      side="top"
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
          title={`This tab runs on ${current}. Click to continue it on another account, or choose what happens when it runs out.`}
          aria-label={`Account for this tab: ${summary}. Change account`}
        >
          {meter && meter.level !== 'unknown' && (
            <span
              className="tab-account-chip__meter"
              data-level={meter.level}
              style={{ '--tab-account-fill': `${meter.fill}%` } as React.CSSProperties}
              aria-hidden="true"
            />
          )}
          <span className="tab-account-chip__words">
            <span className="tab-account-chip__name">{current}</span>
            {left && (
              <span className="tab-account-chip__left" data-out={currentAccount?.out || undefined}>
                <span className="tab-account-chip__left-full">{left}</span>
                {/* A narrow pane: the tighter limit only. */}
                <span className="tab-account-chip__left-short" aria-hidden="true">
                  {shortLeft ?? left}
                </span>
              </span>
            )}
          </span>
          {offer ? (
            <span className="tab-account-chip__offer">Switch?</span>
          ) : (
            auto && <span className="tab-account-chip__auto">Auto</span>
          )}
        </MenuButton>
      )}
    >
      {offer && (
        <>
          <p className="tab-account-chip__suggest" role="note">
            {/* "5-hour" kept on one line. */}
            {offer.line.replace(/5-hour/g, '5\u2011hour')}
          </p>
          <DropdownItem onSelect={() => void move(offer.toId)}>
            <span className="tab-account-chip__label">Continue on {offer.toName}</span>
          </DropdownItem>
          <DropdownItem onSelect={() => setDeclined(`${sessionId}:${offer.toId}`)}>
            <span className="tab-account-chip__label">Not now</span>
          </DropdownItem>
          <DropdownDivider />
        </>
      )}
      <p className="tab-account-chip__heading">Continue this chat on</p>
      {info.accounts.map((a) => (
        <DropdownItem key={a.id} onSelect={() => !a.current && void move(a.id)}>
          <span className="tab-account-chip__label">
            {limitsLine(a) ? (
              <>
                <span className="tab-account-chip__account">{a.name}</span>
                <span className="tab-account-chip__limits">{limitsLine(a)}</span>
              </>
            ) : (
              a.label
            )}
          </span>
          <span className="tab-account-chip__check" aria-hidden="true">
            {a.current && <CheckIcon size={12} />}
          </span>
        </DropdownItem>
      ))}
      {mode && mode !== 'off' && (
        <>
          <DropdownDivider />
          <p className="tab-account-chip__heading">When an account runs out</p>
          {MODES.map((m) => (
            <DropdownItem key={m.value} onSelect={() => void chooseMode(m.value)}>
              <span className="tab-account-chip__label">{m.label}</span>
              <span className="tab-account-chip__check" aria-hidden="true">
                {mode === m.value && <CheckIcon size={12} />}
              </span>
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
