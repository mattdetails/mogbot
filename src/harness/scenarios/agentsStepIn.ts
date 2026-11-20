/**
 * A retired "Step in" card (agents' own browser is gone): an old stored card
 * arrives closed with its legacy `stepIn` object and is drawn as one quiet
 * line, never a card with answers. Fictional accounts.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, messagesFor, msg, overview, TEAM } from './agents';

const LEGACY = {
  reason: 'approve the Microsoft sign-in on your phone',
  site: 'login.microsoftonline.com',
  url: 'https://login.microsoftonline.com/common/oauth2/authorize',
  pageTitle: 'Verify your identity',
  tab: 2,
};

const chat = (args: Record<string, unknown>) =>
  args.agentId === 'finance'
    ? [
        msg('user', 'Pull last month’s invoices from the Acme billing portal.', 12, {
          agentId: 'finance',
        }),
        msg(
          'agent',
          'The portal sends me to Acme’s Microsoft sign-in and wants a tap on your phone.',
          3,
          { agentId: 'finance' }
        ),
        msg('approval', '', 2, {
          agentId: 'finance',
          approval: {
            requestId: 'step-1',
            title: `Finance needs you in its browser: ${LEGACY.reason}`,
            detail: 'Its tab opens on this Mac for you to do this yourself.',
            status: 'expired',
            stepIn: LEGACY,
          },
        }),
      ]
    : messagesFor(args);

export const agentsStepInScenarios: Scenario[] = [
  {
    id: 'agents-step-in-legacy',
    title: 'Agents — an old Step in card',
    looksRightWhen:
      'Under Finance’s line, one muted line: “This sign-in used the old browser; ask again”. No card, no buttons, no globe, no accent.',
    openSelector: AGENTS_TAB,
    requires: '.agent-note--expired',
    clipSelector: '.agent-note--expired',
    steps: [{ click: '[data-agent-id="finance"]' }],
    commands: { agents_overview: overview(TEAM), agents_messages: chat },
  },
];
