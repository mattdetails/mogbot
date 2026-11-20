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
    'The agent’s message shows its quiet toolbar: Reply (an arrow), Copy and the time. Reply is first.',
    chat(),
    { steps: [{ focus: '[data-message-ids="orig-drafted"]' }] }
  ),
  scenario(
    'chip',
    'reply set, the chip above the box',
    'After R on the focused message, a chip sits directly above the box, its width: a 3px bar in Lead Gen’s green, “Replying to Lead Gen” in 12/600 and the first line of the original in muted 13px with an ellipsis, and a × on the right. The box under it has square top corners toward the chip.',
    chat(),
    {
      steps: [{ focus: '[data-message-ids="orig-drafted"]' }, { key: 'r' }],
      requires: '.agent-reply-chip',
    }
  ),
  scenario(
    'chip-yourself',
    'replying to your own message',
    'The chip says “Replying to you” with your message’s first line.',
    chat(),
    {
      steps: [{ focus: '[data-message-ids="orig-ask"]' }, { key: 'r' }],
      requires: '.agent-reply-chip',
    }
  ),
  scenario(
    'sent',
    'sent, with the quote',
    'Your bubble (Lead Gen’s green, dark ink) starts with a quote block: a bar in the bubble’s ink at 55%, “Lead Gen” in 12/600 and up to two lines of the original, on a faint tint of the bubble; then your words. Nothing is shown twice.',
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
    { requires: '.agent-reply-quote' }
  ),
  scenario(
    'unavailable',
    'the original is not loaded',
    'The quote block says “Message not available” in place of the name and excerpt, with no pointer cursor and nothing to click.',
    chat(
      msg('user', 'Going back to what you said yesterday: yes.', 6, {
        agentId: ID,
        replyTo: { id: 'gone', name: 'Lead Gen', excerpt: 'older', kind: 'message' },
      })
    ),
    { requires: '.agent-reply-quote[data-gone]' }
  ),
  scenario(
    'attachment',
    'a reply to a file',
    'The quote says “Lead Gen” over “File · intros.pdf”.',
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
    { requires: '.agent-reply-quote' }
  ),
  scenario(
    'narrow',
    'a narrow window',
    'Under 480px the toolbar’s Reply is not drawn (the ⋯ menu still has it); the chip and quote fit the column.',
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
    { viewport: { width: 440, height: 800 }, requires: '.agent-reply-quote' }
  ),
];
