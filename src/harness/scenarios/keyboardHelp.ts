/**
 * The Help sheet (F1) with the keyboard map's new keys: Catch up, a project by
 * its number, and Allow / Deny on the card in front. Capture with light and dark.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, TEAM, overview, messagesFor } from './agents';

export const keyboardHelpScenarios: Scenario[] = [
  {
    id: 'keyboard-help',
    title: 'Help — the keyboard map',
    looksRightWhen:
      'F1 opens the shortcuts sheet. Near the top: Catch up (⌃⌥C), Open a project by its number (⌃⌥⇧1–9), Allow / Deny the card in front (⌘↩, ⌘⌫, with “Only when no text box has the cursor”); keys drawn as keycaps, nothing clipped.',
    openSelector: AGENTS_TAB,
    requires: '.help-modal, [role="dialog"]',
    viewport: { width: 1100, height: 860 },
    commands: { agents_overview: overview(TEAM), agents_messages: messagesFor },
    steps: [{ key: 'F1' }, { wait: 600 }],
  },
];
