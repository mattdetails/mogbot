/**
 * The spec states Fidelity QA's release-gate run names, under the ids it
 * asked for. Most are an existing scenario with a step or a window size added;
 * the state each one shows is in its own `looksRightWhen`.
 */

import type { Scenario } from '../types';
import { agentsBubbleScenarios, agentsWideScenario } from './agentsBubbles';
import { agentsCatchUpScenarios } from './agentsCatchUp';
import { agentsNewAgentScenarios } from './agentsNewAgent';
import { agentsReplyScenarios } from './agentsReply';
import { agentsTasksScenarios } from './agentsTasks';
import { agentsScenarios } from './agents';

const find = (all: Scenario[], id: string): Scenario => {
  const hit = all.find((s) => s.id === id);
  if (!hit) throw new Error(`agentsQa: no scenario ${id}`);
  return hit;
};

const bubbles = (color: string) => find(agentsBubbleScenarios, `agents-bubbles-${color}`);
const reply = (id: string) => find(agentsReplyScenarios, `agents-reply-${id}`);
const newAgent = (id: string) => find(agentsNewAgentScenarios, `agents-new-agent-${id}`);
const tasks = (id: string) => find(agentsTasksScenarios, `agents-tasks-${id}`);

/** `base` under a new id, its steps extended and its words replaced. */
const as = (
  id: string,
  base: Scenario,
  looksRightWhen: string,
  more: Partial<Scenario> = {}
): Scenario => ({
  ...base,
  ...more,
  id,
  title: `${base.title} (${id})`,
  looksRightWhen,
  steps: [...(base.steps ?? []), ...(more.steps ?? [])],
});

export const agentsQaScenarios: Scenario[] = [
  // Chat
  as(
    'agents-chat-colourways',
    bubbles('blue'),
    'Your bubble is the blue key’s colour with white ink (at least 4.5:1); the agent’s bubble is a faint 4% (dark) / 6% (light) tint, 18px corners, 15/20 type.'
  ),
  as(
    'agents-chat-colourways-light',
    bubbles('amber'),
    'Your bubble is the gold key’s colour with near-black ink; the agent’s is the faint tint.'
  ),
  as(
    'agents-chat-timestamps',
    bubbles('green'),
    'The time line (“Today 7:24 PM”) is centred between messages, small and muted.'
  ),
  as(
    'agents-composer2-empty',
    bubbles('green'),
    'The box is one rounded bar: a + circle at the left, “Message <name>”, the mic, and a muted send arrow in the agent’s colour.',
    { clipSelector: '.agent-chat__footer' }
  ),
  as(
    'agents-composer2-typed',
    bubbles('green'),
    'With text typed the mic steps aside and the round send arrow is lit in the agent’s colour.',
    {
      steps: [{ fill: '.agent-composer__input', value: 'Yes, send them at 9 am' }],
      clipSelector: '.agent-chat__footer',
    }
  ),
  as(
    'agents-working-no-partial',
    find(agentsScenarios, 'agents-working-streaming'),
    'While a reply is being written nothing of it is on screen: no partial text, no dots; one working row stays until the reply lands whole.'
  ),
  as(
    'agents-chat-scrolled-up',
    bubbles('green'),
    'Scrolled up from the bottom, a floating round ↓ button sits centred above the composer.',
    { steps: [{ scroll: '[data-message-ids]' }] }
  ),
  as(
    'agents-column-2560',
    bubbles('green'),
    'At a 2560px window the chat is still one 720px column, centred in the space beside the sidebar; the header’s content sits at the column’s edges and the header has no border.',
    { viewport: { width: 2560, height: 1000 } }
  ),
  as(
    'agents-column-1600-cards',
    agentsWideScenario,
    'At 1600px the messages, the cards in the chat and the box all share the same 720px column.',
    { viewport: { width: 1600, height: 900 } }
  ),
  // Catch up
  as(
    'agents-catchup2-kinds',
    find(agentsCatchUpScenarios, 'agents-catchup-one'),
    'A card for a turn that didn’t finish: the eyebrow “DIDN’T FINISH” over the ask itself as its title (the “Needs your input” eyebrow is the same card for a question or a sign-in).'
  ),
  // Header and menu
  as(
    'agents-header2-idle',
    tasks('line-idle'),
    'The header: the key (36px), the name and one muted line of description, a plain 32px ⋯ at the right edge; no pill, no Share, no Tasks chip.'
  ),
  as(
    'agents-header2-task-line',
    tasks('line-doing'),
    'The quiet line under the name: a dot, “Drafting intros”, muted “· 3 to do”, and a chevron.'
  ),
  as(
    'agents-header2-task-line-waits',
    tasks('line-waits'),
    'With something waiting on you the dot and “· 1 waits” are amber.'
  ),
  as(
    'agents-header2-task-line-hover',
    tasks('line-doing'),
    'The task line pointed at: the text steps up to the primary colour.',
    { pointAt: '.agent-task-line' }
  ),
  as(
    'agents-header2-menu-hover',
    tasks('line-doing'),
    'The ⋯ pointed at: a soft rounded square behind it.',
    { pointAt: '.agent-chat__more' }
  ),
  as(
    'agents-header2-menu-open',
    tasks('menu'),
    'The ⋯ menu open, in spec-agent-menu §2’s groups: Tasks (with its counts), Usage, Routines, Conversations; Instructions and memory, Apps and logins, Model, Independence (its level); the agent’s other actions; Take over and Delete this agent (red, trash icon) last. Routines is listed once.'
  ),
  as(
    'agents-header2-menu-keys',
    tasks('menu'),
    'With the menu open, ↓ moves the focus ring down to the next row.',
    { steps: [{ key: 'ArrowDown' }, { wait: 200 }] }
  ),
  // Tasks
  as(
    'agents-tasks-panel',
    tasks('panel'),
    'The task panel: Doing, Next, Waits on you, Done today with their marks.'
  ),
  as(
    'agents-tasks-empty',
    tasks('panel-empty'),
    '“Nothing on the list. Ask for something and it lands here.”'
  ),
  as(
    'agents-tasks-failed',
    tasks('panel-failed'),
    '“Couldn’t reach your Mac. This list is from <time>.” above the panel’s content.'
  ),
  // New agent
  as(
    'agents-new2-empty',
    newAgent('faces'),
    'The empty dialog: key preview, an empty name field, one row of colours, Faces | Icons with Faces selected, the optional sentence, Create off.'
  ),
  as(
    'agents-new2-faces',
    newAgent('faces'),
    'Faces on the chosen colour, a name under each, the picked one ringed.'
  ),
  as(
    'agents-new2-icon-search',
    newAgent('icon-search'),
    'A search for “bot” on Icons: the matches with a count.'
  ),
  as(
    'agents-new2-named',
    newAgent('named'),
    'A name typed: Create is the strong neutral button and on.'
  ),
  as(
    'agents-new2-drafting',
    newAgent('drafting'),
    'Create reads “Drafting…” with a spinner; the dialog stays.'
  ),
  as(
    'agents-new2-draft-failed',
    newAgent('failed'),
    'An amber note with Create blank and Try again; what was typed is kept.'
  ),
  as(
    'agents-new2-name-long',
    newAgent('counter'),
    'At 28 characters the counter shows; typing stops at 32.'
  ),
  // Reply
  as(
    'agents-reply-typed',
    reply('chip'),
    'The reply line at the top of the box with the typed words under it.',
    { steps: [{ fill: '.agent-composer__input', value: 'Yes, send them at 9 am' }] }
  ),
  as(
    'agents-reply-jump',
    reply('flash'),
    'After clicking the pill the original is scrolled into view (the 600ms pulse is gone by the shot).'
  ),
  as(
    'agents-reply-cancelled',
    reply('chip'),
    'After the × the line is gone and the box is back to one line.',
    { steps: [{ click: '.agent-reply-line__cancel' }, { wait: 300 }], requires: '.agent-composer' }
  ),
  as(
    'agents-reply-keyboard',
    reply('chip'),
    'With a message focused, R sets the reply: the line appears in the box.'
  ),
];
