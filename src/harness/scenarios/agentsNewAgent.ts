/**
 * New agent, the simple first screen (Designer's G-5), every state: the faces
 * (default), icons with search, a name typed (Create on), a long name's counter,
 * drafting, and a failed draft. Capture each with `--theme light` and `--theme dark`.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, agent, overview } from './agents';

const VIEW = { width: 1100, height: 900 };

const scenario = (
  id: string,
  title: string,
  looksRightWhen: string,
  steps: Scenario['steps'],
  commands: Scenario['commands'] = {}
): Scenario => ({
  id: `agents-new-agent-${id}`,
  title: `Agents — New agent: ${title}`,
  looksRightWhen,
  requires: '.new-agent',
  openSelector: AGENTS_TAB,
  viewport: VIEW,
  steps: [{ click: '.agents-list__new' }, ...(steps ?? [])],
  commands: {
    agents_overview: overview([agent('chief', 'Chief of Staff', { isMain: true })]),
    ...commands,
  },
});

const stall = () => new Promise(() => {});
const fail = () => {
  throw new Error('Claude Code is signed out.');
};

export const agentsNewAgentScenarios: Scenario[] = [
  scenario(
    'faces',
    'faces (the default)',
    'The Faces | Icons switch has Faces selected: the faces on the chosen colour in a grid, a name under each, the picked one ringed. Create is off (no name yet).',
    []
  ),
  scenario(
    'named',
    'a name typed',
    'The preview takes the name’s first letter if it has no face; Create is the strong neutral button and on.',
    [{ fill: '.new-agent input', value: 'Lead Gen' }]
  ),
  scenario(
    'icons',
    'the Icons side',
    'Icons is selected: a search field with its count, category chips, Recently used and Featured; the preview shows the icon.',
    [{ click: '[role="radio"][aria-checked]' }]
  ),
  scenario(
    'counter',
    'a long name',
    'At 28 characters a counter (28/32) shows at the right of the name field; typing stops at 32.',
    [{ fill: '.new-agent input', value: 'Quarterly Investor Reporting' }]
  ),
  scenario(
    'drafting',
    'drafting from a sentence',
    'With a sentence typed, Create reads “Drafting…” with a spinner and is off; the dialog stays open.',
    [
      { fill: '.new-agent input', value: 'Inbox' },
      {
        fill: '.new-agent textarea',
        value: 'Every morning, tell me the three emails that matter.',
      },
      { wait: 300 },
      { click: '.new-agent__footer button[type="submit"]' },
      { wait: 300 },
    ],
    { agents_draft: stall }
  ),
  scenario(
    'failed',
    'the draft failed',
    'An amber line: “Couldn’t draft this one just now. Create it blank, or try again.” with Create blank and Try again; what was typed is still there.',
    [
      { fill: '.new-agent input', value: 'Inbox' },
      {
        fill: '.new-agent textarea',
        value: 'Every morning, tell me the three emails that matter.',
      },
      { wait: 300 },
      { click: '.new-agent__footer button[type="submit"]' },
      { wait: 300 },
    ],
    { agents_draft: fail }
  ),
];
