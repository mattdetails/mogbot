/**
 * A weekly grocery order done in the user's own Chrome, ending on the card
 * for the one click that spends money. The words are the app's own: the
 * step labels `agents::work` writes for the app's Chrome extension ("Used
 * your Chrome · walmart.com") and the click card `browser_gate::describe`
 * writes ("Click “Place order” on walmart.com" · "This would spend your
 * money, in your signed-in Chrome.").
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, MIN, TEAM, agent, messagesFor, msg, now, overview, status } from './agents';

const SEC = 1000;
const at = (startMin: number, s: number) => now - startMin * MIN + s * SEC;
const step = (s: number, kind: string, label: string) => ({ at: at(4, s), kind, label });

const GROCERIES = agent('groceries', 'Groceries', {
  shape: 2,
  color: 'green',
  colorway: 'sage',
  icon: 'face-07',
  minutesAgo: 1,
  role: 'Does the weekly Walmart order from your list.',
  preview: 'Ready to place the order: 6 items, pickup Thursday.',
});

const TURN = {
  startedAt: at(4, 0),
  stepCount: 6,
  fileCount: 0,
  doing: 'Using your Chrome · walmart.com',
  steps: [
    step(5, 'web', 'Used your Chrome · walmart.com'),
    step(18, 'web', 'Used your Chrome · walmart.com'),
    step(64, 'web', 'Used your Chrome · walmart.com'),
    step(120, 'web', 'Used your Chrome · walmart.com'),
    step(171, 'approval', 'Asked you: Click “Place order” on walmart.com'),
  ],
};

const CHAT = [
  msg('user', 'can you do this week’s Walmart order? same list as last week', 4, {
    agentId: 'groceries',
  }),
  msg('agent', 'On it: opening Walmart in your Chrome.', 4, { agentId: 'groceries' }),
  msg('agent', 'Last week’s 6 items are in the cart. Thursday pickup is open, so I picked it.', 1, {
    agentId: 'groceries',
  }),
  msg('approval', '', 1, {
    agentId: 'groceries',
    approval: {
      requestId: 'walmart-order',
      title: 'Click “Place order” on walmart.com',
      summary: 'This would spend your money, in your signed-in Chrome.\n\n6 items, pickup Thursday.',
      detail: 'left_click ref_42 (“Place order”) on walmart.com/checkout',
      tool: 'mcp__user_chrome__click',
      status: 'pending',
    },
  }),
];

const team = overview([
  {
    ...GROCERIES,
    status: {
      ...status('working', 'Using your Chrome · walmart.com'),
      since: now - 4 * MIN,
      work: TURN,
    } as ReturnType<typeof status>,
  },
  ...TEAM.filter((a) => a.id !== 'acme'),
]);

const commands = {
  agents_overview: team,
  agents_messages: (args: Record<string, unknown>) =>
    args.agentId === 'groceries' ? CHAT : messagesFor(args),
};

export const agentsWalmartScenarios: Scenario[] = [
  {
    id: 'agents-walmart-order',
    title: 'Agents — Groceries places the Walmart order in your Chrome',
    looksRightWhen:
      'Groceries’ chat: “can you do this week’s Walmart order? same list as last week”, then “On it: opening Walmart in your Chrome.”, “Last week’s 6 items are in the cart…”, and the card “Click “Place order” on walmart.com” with “This would spend your money, in your signed-in Chrome.” and “6 items, pickup Thursday.”, Deny and Allow (neutral).',
    requires: '.agent-approval',
    openSelector: AGENTS_TAB,
    commands,
    steps: [{ click: '[data-agent-id="groceries"]' }],
  },
];
