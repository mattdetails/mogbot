/**
 * Catch up (⌃⌥C, or ⌃⌥⇧C when an agent holds C) and Allow / Deny on the card
 * in front (⌘↩ / ⌘⌫, only when no text box has focus): page keys from the
 * keyboard map (`lib/designedShortcuts`). A project by its number is in
 * `useProjectNumberShortcuts`; ⇧⌘A is the menu's `toggle_mode`.
 *
 * @module hooks/useDesignedShortcuts
 */

import { useEffect, useRef } from 'react';
import { CATCHUP_ID } from '../lib/agents';
import { useAgentsSelector } from '../lib/agentsStore';
import {
  agentHoldsC,
  answerFrontCard,
  cardAnswerForKey,
  isCatchUpKey,
} from '../lib/designedShortcuts';
import { requestAgentsIntent } from '../commands/useAgentsCommands';
import type { AppView } from '../lib/types';

export function useDesignedShortcuts(setView: (view: AppView) => void): void {
  const cTaken = useAgentsSelector((s) => agentHoldsC(s.agents));
  const latest = useRef({ cTaken, setView });
  useEffect(() => {
    latest.current = { cTaken, setView };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { cTaken, setView } = latest.current;
      if (isCatchUpKey(event, cTaken)) {
        event.preventDefault();
        requestAgentsIntent({ kind: 'open', agentId: CATCHUP_ID });
        setView('agents');
        return;
      }
      const which = cardAnswerForKey(event);
      if (which && answerFrontCard(which)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** `useDesignedShortcuts` as a component that draws nothing (App must not re-render on agent changes). */
export function DesignedShortcutsHost({ setView }: { setView: (view: AppView) => void }): null {
  useDesignedShortcuts(setView);
  return null;
}
