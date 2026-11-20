/**
 * Reply to a message on the desk (Designer's spec-reply-to-message): the hover
 * toolbar, R to reply, the chip above the box, a sent reply's quote, a quote
 * whose original isn't loaded, and a quote of an attachment. The stored
 * `replyTo: { id, name, excerpt, kind }` is a fixture until the Mac's lands.
 * Capture each with `--theme light` and `--theme dark`.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, agent, msg, overview } from './agents';

const ID = 'leadgen';
const VIEW = { width: 1280, height: 860 };

const TEAM = [agent(ID, 'Lead Gen', { color: 'green', minutesAgo: 3, preview: 'Sent.' })];

const DRAFTED = msg(
  'agent',
  'Here are the 12 intros, one per lead from Native OS. I matched each to what their agency does and kept them under 90 words.\n\nNothing has been sent. Send time is 9:00 am their time, unless you say otherwise.',
  9,
  { agentId: ID, id: 'orig-drafted' }
);
const ASK = msg(
  'user',
  'Draft intros for the 12 leads from Native OS. Don’t send anything yet.',
  12,
  {
    agentId: ID,
    id: 'orig-ask',
  }
);

const chat = (...more: ReturnType<typeof msg>[]) => [ASK, DRAFTED, ...more];

const scenario = (
  id: string,
  title: string,
  looksRightWhen: string,
  lines: ReturnType<typeof msg>[],
  more: Partial<Scenario> = {}
): Scenario => ({
  id: `agents-reply-${id}`,
  title: `Agents — reply to a message: ${title}`,
  looksRightWhen,
  requires: '.agent-bubble--user',
  openSelector: AGENTS_TAB,
  viewport: VIEW,
  commands: {
    agents_overview: overview(TEAM),
    agents_messages: () => lines,
  },
  ...more,
  steps: [{ click: `[data-agent-id="${ID}"]` }, ...(more.steps ?? [])],
});

export const agentsReplyScenarios: Scenario[] = [
  scenario(
    'toolbar',
    'the toolbar on a focused message',
    'Beside the agent’s message, at its vertical centre and 14px from it, two bare icons: Reply (an arrow) and ⋯. No container, no Copy.',
    chat(),
    { steps: [{ focus: '[data-message-ids="orig-drafted"]' }] }
  ),
  scenario(
    'chip',
    'reply set, the chip above the box',
    'After R on the focused message, one outlined line sits at the top inside the box (1px strong border, radius 12, 32px tall): the first line of the original in muted 13px with an ellipsis, and a × at the right. No label, no bar, no agent colour. The box is one line taller.',
    chat(),
    {
      steps: [{ focus: '[data-message-ids="orig-drafted"]' }, { key: 'r' }],
      requires: '.agent-reply-line',
    }
  ),
  scenario(
    'chip-yourself',
    'replying to your own message',
    'Replying to your own message: the same line with your message’s first line; nothing else changes.',
    chat(),
    {
      steps: [{ focus: '[data-message-ids="orig-ask"]' }, { key: 'r' }],
      requires: '.agent-reply-line',
    }
  ),
  scenario(
    'sent',
    'sent, with the quote',
    'A one-line outlined pill sits directly above your bubble, outside it, 4px away and against its right edge: the quoted line only (a 1:1 chat). Nothing is inside the bubble, which holds only your words. Lead Gen’s green bubble with dark ink',
    chat(
      msg('user', 'Yes, send them at 9 am.', 6, {
        agentId: ID,
        replyTo: {
          id: 'orig-drafted',
          name: 'Lead Gen',
          excerpt:
            'Here are the 12 intros, one per lead from Native OS. I matched each to what their agency does and kept them under 90 words.',
          kind: 'message',
        },
      })
    ),
    { requires: '.agent-reply-pill' }
  ),
  scenario(
    'unavailable',
    'the original is not loaded',
    'The pill says “Message not available” with no pointer cursor and nothing to click.',
    chat(
      msg('user', 'Going back to what you said yesterday: yes.', 6, {
        agentId: ID,
        replyTo: { id: 'gone', name: 'Lead Gen', excerpt: 'older', kind: 'message' },
      })
    ),
    { requires: '.agent-reply-pill[data-gone]' }
  ),
  scenario(
    'attachment',
    'a reply to a file',
    'The pill reads “File · intros.pdf”.',
    chat(
      msg('user', 'Use the second page only.', 6, {
        agentId: ID,
        replyTo: {
          id: 'orig-drafted',
          name: 'Lead Gen',
          excerpt: 'File · intros.pdf',
          kind: 'file',
        },
      })
    ),
    { requires: '.agent-reply-pill' }
  ),
  scenario(
    'narrow',
    'a narrow window',
    'Under 480px the hover icons are not drawn (the ⋯ menu and R still reach Reply); the pill fits the column.',
    chat(
      msg('user', 'Yes, send them.', 6, {
        agentId: ID,
        replyTo: {
          id: 'orig-drafted',
          name: 'Lead Gen',
          excerpt: 'Here are the 12 intros',
          kind: 'message',
        },
      })
    ),
    { viewport: { width: 440, height: 800 }, requires: '.agent-reply-pill' }
  ),
];
