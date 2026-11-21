/**
 * The message ⋯ (spec-message-hover.md): one quiet control beside each bubble,
 * level with its first line, on the outside edge (left of yours, right of the
 * agent's), opening its menu beside it in words. Stress cases: a very long
 * message, code and links, a narrow window, a message at the window's edge
 * (the menu flips and stays on screen), many messages in a row, and the
 * keyboard. Hover itself and the sweep are shot with a real pointer
 * (scripts/message-menu-sweep.mjs); these hold the states a click reaches.
 * Fictional throughout.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, messagesFor, msg, overview } from './agents';

const LONG_USER =
  'Here is the full plan for the intros. Send them in three batches, starting with the four warmest leads from the list, then the middle group, then the cold ones. Each intro should mention the case study for their vertical and name one thing from their site. Keep every email under 120 words. Hold anything to a lead who has bounced before until you check the list with me. I have also put the send times in the drafts folder so you can see them before anything leaves.';

const LONG_AGENT = [
  'The sheet is above. Projects use Control-Option-Shift, agents use their own key. Catch up is Control-Option-C unless an agent already holds C, in which case it is Control-Option-Shift-C. Allow and Deny on cards are Command-Return and Command-Delete when no text box has focus.',
  '',
  'Three more things changed while I was in there. The palette now opens on the last group you used, so a second ⌘K lands where you left off. Rewind keeps its own shortcut, and Fork moved under it in the menu so the two read in the order you reach for them. The old shortcut for pinning is gone, because Remember this lives in each message’s menu now.',
  '',
  'Nothing else moved. If any of these clash with something you use every day, say which and I will put it back.',
].join('\n');

const CODE_AND_LINKS = [
  'Fixed. The check was reading the wrong field; see [the run](https://github.com/acme/site/actions/runs/1) and the diff below.',
  '',
  '```ts',
  'export function isLive(deploy: Deploy): boolean {',
  "  return deploy.state === 'READY' && deploy.sha === deploy.pushedSha;",
  '}',
  '```',
  '',
  'It also lives at ~/ShipStudio/acme/src/lib/deploy.ts, and the [provider’s docs](https://vercel.com/docs) say the same.',
].join('\n');

const ASKED = [
  'Can you check the footer links?',
  'And the pricing page?',
  'Ship it when green.',
  'Thanks.',
];
const SAID = [
  'All twelve work.',
  'Pricing renders on mobile now.',
  'Green: deployed to staging.',
  'Any time.',
];
const MANY = Array.from({ length: 14 }, (_, i) => {
  const n = Math.floor(i / 2) % 4;
  return i % 2 === 0 ? msg('user', ASKED[n], 40 - i) : msg('agent', SAID[n], 40 - i);
});

const chat = (lines: ReturnType<typeof msg>[]) => (args: Record<string, unknown>) =>
  args.agentId === 'chief' ? lines : messagesFor(args);

const OPEN_AGENT = { click: '.agent-chat__row--agent .agent-message__more' };
const OPEN_USER = { click: '.agent-chat__row--user .agent-message__more' };

const scenario = (
  id: string,
  title: string,
  looksRightWhen: string,
  lines: ReturnType<typeof msg>[],
  more: Partial<Scenario> = {}
): Scenario => ({
  id: `agents-message-menu-${id}`,
  title: `Agents — message ⋯: ${title}`,
  looksRightWhen,
  requires: '.agent-message__menu',
  openSelector: AGENTS_TAB,
  viewport: { width: 1280, height: 900 },
  ...more,
  steps: [{ click: '[data-agent-id="chief"]' }, { wait: 500 }, ...(more.steps ?? [])],
  commands: { agents_overview: overview(), agents_messages: chat(lines) },
});

const MENU_AGENT =
  'The menu beside it, in words with small icons: Copy, Reply, then Remember this after a divider. No circle or box around the ⋯; it is full ink while open.';
const MENU_USER =
  'The menu beside it, in words: Copy, Reply; a divider; Edit and resend, Fork from here, Rewind to here; a divider; Remember this. No circle or box around the ⋯; it is full ink while open.';

export const agentsMessageMenuScenarios: Scenario[] = [
  scenario(
    'long',
    'a very long message, its menu open',
    `The agent’s three-paragraph reply: its ⋯ sits 12px right of the bubble, level with the first line, not the middle. ${MENU_AGENT} It opens to the right of the ⋯, its top level with it.`,
    [msg('user', LONG_USER, 6), msg('agent', LONG_AGENT, 5)],
    { steps: [OPEN_AGENT] }
  ),
  scenario(
    'long-user',
    'your very long message, its menu open',
    `Your long message: its ⋯ sits 12px left of the bubble, level with the first line. ${MENU_USER} It opens to the left of the ⋯.`,
    [msg('user', LONG_USER, 6)],
    { steps: [OPEN_USER] }
  ),
  scenario(
    'code',
    'a reply with code and links',
    `A reply with a link, a code block and a path: the ⋯ is level with the first line, outside the bubble, and the code block’s own Copy is separate from it. ${MENU_AGENT}`,
    [msg('user', 'Why was the deploy marked live?', 6), msg('agent', CODE_AND_LINKS, 5)],
    { steps: [OPEN_AGENT] }
  ),
  scenario(
    'narrow',
    'a narrow window',
    `In a 700px window: your message’s ⋯ is still beside the bubble and the menu stays inside the chat, never over the sidebar or off the window. ${MENU_USER}`,
    [
      msg('user', 'Keyboard shortcuts, with my decisions.', 6),
      msg('agent', 'The sheet is above.', 5),
    ],
    { viewport: { width: 700, height: 800 }, steps: [OPEN_USER] }
  ),
  scenario(
    'edge-agent',
    'the agent’s message at the window’s right edge: the menu flips left',
    `In a 980px window the reply runs close to the chat’s right edge, so its menu, which would open to the right, opens to the left of the ⋯ instead, over the bubble, wholly on screen. ${MENU_AGENT}`,
    [msg('agent', LONG_AGENT, 5)],
    { viewport: { width: 980, height: 800 }, steps: [OPEN_AGENT] }
  ),
  scenario(
    'edge-user',
    'your message at the chat’s left edge: the menu flips right',
    `In a 760px window your long message reaches near the chat’s left edge, so its menu, which would open to the left, opens to the right of the ⋯ instead, over the bubble, inside the chat and never over the sidebar. ${MENU_USER}`,
    [msg('user', LONG_USER, 6)],
    { viewport: { width: 760, height: 800 }, steps: [OPEN_USER] }
  ),
  scenario(
    'many',
    'many messages in a row',
    'Fourteen short messages alternating. At rest no ⋯ shows anywhere; the rhythm is unchanged. (The hover sweep is recorded with a real pointer: each ⋯ appears beside its own bubble only, at the same place every time, and nothing moves.)',
    MANY,
    { requires: '.agent-chat__row--user .agent-message__more' }
  ),
  scenario(
    'keyboard',
    'the keyboard: Tab reaches the ⋯',
    'The agent’s ⋯ has keyboard focus: it shows (full opacity) with the neutral focus ring, and nothing else changed. Enter opens the menu with Copy focused; Esc closes it and focus is back on the ⋯ (checked by the sweep script with real keys).',
    [
      msg('user', 'Keyboard shortcuts, with my decisions.', 6),
      msg('agent', 'The sheet is above.', 5),
    ],
    {
      requires: '.agent-message__more:focus',
      steps: [{ focus: '.agent-chat__row--agent .agent-message__more' }],
    }
  ),
];
