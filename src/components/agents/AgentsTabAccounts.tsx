/**
 * Settings → Accounts & usage, "When a terminal tab runs out": what a Claude
 * Code tab in a project does when its account reaches its usage limit
 * (`agents/tab_accounts.rs`). Ask me (the default), Switch on its own, or Off.
 * Shown only with two or more Claude Code accounts signed in, since otherwise
 * there is nowhere to move to.
 *
 * @module components/agents/AgentsTabAccounts
 */

import { SegmentedControl } from '../primitives/SegmentedControl';
import { useAsyncState } from '../../hooks/useAsyncState';
import { useOptionalToast } from '../../contexts/ToastContext';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { THIS_COMPUTER } from '../../lib/computer';
import { getTabAccountMode, setTabAccountMode, type TabAccountMode } from '../../lib/tabAccounts';

const HEADING = 'When a terminal tab runs out';

const OPTIONS: { value: TabAccountMode; label: string }[] = [
  { value: 'ask', label: 'Ask me' },
  { value: 'auto', label: 'Switch on its own' },
  { value: 'off', label: 'Off' },
];

/** One muted line under the choice. */
export function tabAccountDetail(mode: TabAccountMode): string {
  switch (mode) {
    case 'auto':
      return 'A Claude Code tab in a project moves to your next account with room and carries on the same conversation. New tabs start on that account too.';
    case 'ask':
      return 'A Claude Code tab in a project asks before moving to your next account. New tabs start on the first account with room.';
    case 'off':
      return `Terminal tabs use ${THIS_COMPUTER}’s own sign-in, as before.`;
  }
}

export function AgentsTabAccounts({ claudeSignedIn }: { claudeSignedIn: number }) {
  const { showToast } = useOptionalToast();
  const state = useAsyncState<TabAccountMode>(getTabAccountMode, { immediate: true });
  const { setData } = state;
  const mode = state.data;
  if (!mode || claudeSignedIn < 2) return null;
  const choose = async (next: TabAccountMode) => {
    try {
      setData(await setTabAccountMode(next));
    } catch (e) {
      showToast(formatCommandError(asCommandError(e)), 'error');
    }
  };
  return (
    <div className="agents-usage__block" data-tab-accounts>
      <span className="agents-usage__heading">{HEADING}</span>
      <SegmentedControl
        aria-label={HEADING}
        value={mode}
        size="default"
        options={OPTIONS}
        onValueChange={(m) => void choose(m)}
      />
      <span className="agents-usage__muted">
        {tabAccountDetail(mode)} Projects in another workspace keep that workspace’s login.
      </span>
    </div>
  );
}
