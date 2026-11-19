/**
 * "Mogbot for Chrome isn't installed / connected": the one notice, in every
 * agent's chat, with one button. Mogbot for Chrome is the only way agents
 * reach the user's Chrome (no Claude in Chrome, no built-in browser), so
 * when it's missing the user hears it here instead of from an agent saying
 * it "couldn't use Chrome".
 *
 * The button turns it on and does the next step: the Web Store listing when
 * there is one, else Settings → Chrome, whose steps tick by themselves. Not
 * now puts it away until the next launch (this window's memory only). Shown
 * in the Chief's chat as the onboarding step once the first result is back
 * (`AgentChat`), and in every other chat straight away. Never while the
 * answer is unknown: no notice on a guess.
 *
 * @module components/agents/ChromeNotice
 */

import { useCallback, useEffect, useState } from 'react';
import { ChromeIcon } from '@/components/icons';
import { Button } from '../primitives/Button';
import { AgentCard } from './AgentCard';
import { useOpenModal } from '../../contexts/ModalContext';
import { usePolling } from '../../hooks/usePolling';
import { requestSettingsTabOnOpen } from '../../lib/settings';
import {
  addUserChromeFromStore,
  chromeNeedsAttention,
  chromeNoticeLine,
  getUserChromeStatus,
  setUserChromeEnabled,
  USER_CHROME_TITLE,
  type UserChromeStatus,
} from '../../lib/userChrome';

/** Put away for this launch only: a window's memory, never storage. */
let putAway = false;

export const INSTALL_CHROME = 'Install Mogbot for Chrome';

export function ChromeNotice() {
  const openModal = useOpenModal();
  const [status, setStatus] = useState<UserChromeStatus | null>(null);
  const [hidden, setHidden] = useState(putAway);
  const [busy, setBusy] = useState(false);

  const read = useCallback(async () => {
    try {
      setStatus(await getUserChromeStatus());
    } catch {
      // Unknown stays unknown: no notice on a guess.
    }
  }, []);
  useEffect(() => {
    if (!hidden) void read();
  }, [hidden, read]);
  usePolling(read, { intervalMs: 5000, enabled: !hidden && chromeNeedsAttention(status) });

  if (hidden || !status || !chromeNeedsAttention(status)) return null;

  const install = async () => {
    setBusy(true);
    try {
      const next = status.enabled ? status : await setUserChromeEnabled(true);
      setStatus(next);
      if (next.webStoreUrl) {
        await addUserChromeFromStore();
      } else {
        requestSettingsTabOnOpen('chrome');
        openModal('settings');
      }
    } catch {
      requestSettingsTabOnOpen('chrome');
      openModal('settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AgentCard
      className="agent-chrome-notice"
      data-testid="chrome-notice"
      icon={<ChromeIcon size={14} />}
      title={`${USER_CHROME_TITLE} isn’t connected`}
      note={chromeNoticeLine(status)}
      actions={
        <>
          <Button
            variant="secondary"
            size="compact"
            onClick={() => {
              putAway = true;
              setHidden(true);
            }}
          >
            Not now
          </Button>
          <Button variant="strong" size="compact" disabled={busy} onClick={() => void install()}>
            {status.enabled ? 'Finish setting it up' : INSTALL_CHROME}
          </Button>
        </>
      }
    />
  );
}
