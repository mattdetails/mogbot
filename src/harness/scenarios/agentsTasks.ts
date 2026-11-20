/**
 * The agent menu (⋯), the task line under the name and the task panel
 * (Designer's G-7 and G-6): every state. `Agent.tasks` is a fixture of the
 * agreed shape `{ doing?, toDo, waits }` until the Mac sends it.
 * Capture each with `--theme light` and `--theme dark`.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, agent, msg, overview } from './agents';

const ID = 'leadgen';
const VIEW = { width: 1280, height: 860 };
const NOW = Date.now();
const MIN = 60_000;

const task = (
  id: string,
  title: string,
  state: string,
  minutesAgo: number,
  more: Record<string, unknown> = {}
) => ({
  id,
  title,
  source: 'user',
  state,
  createdAt: NOW - minutesAgo * MIN,
  updatedAt: NOW - minutesAgo * MIN,
  chased: 0,
  ...more,
});

const LOAD = (open: unknown[], recent: unknown[]) => [
  {
    agentId: ID,
    name: 'Lead Gen',
    role: 'Drafts and sends the intro emails.',
    doing: 'Drafting intros',
    open,
    recent,
    overloaded: false,
    overloadedWhy: null,
    stuck: 0,
  },
];

const OPEN = [
  task('t1', 'Draft intros for the 12 leads from Native OS', 'doing', 95),
  task('t2', 'Chase the Globex invoice', 'next', 40, {
    source: 'agent',
    from: { id: 'mail', name: 'Mail' },
  }),
  task('t3', 'Check the three leads that bounced', 'next', 30),
  task('t4', 'Send the batch at 9 am', 'waiting', 20, { waitingOn: 'Needs your OK on the send' }),
];
const RECENT = [task('t5', 'Pull the lead list from Native OS', 'done', 180)];

const scenario = (
  id: string,
  title: string,
  looksRightWhen: string,
  tasks: { doing?: string; toDo: number; waits: number } | undefined,
  board: unknown,
  more: Partial<Scenario> = {}
): Scenario => ({
  id: `agents-tasks-${id}`,
  title: `Agents — ${title}`,
  looksRightWhen,
  requires: '.agent-chat__header',
  openSelector: AGENTS_TAB,
  viewport: VIEW,
  commands: {
    agents_overview: overview([
      agent(ID, 'Lead Gen', {
        color: 'green',
        role: 'Drafts and sends the intro emails.',
        minutesAgo: 3,
        ...(tasks ? { tasks } : {}),
      }),
    ]),
    agents_messages: () => [msg('user', 'Draft the intros.', 9, { agentId: ID })],
    agents_task_board: board,
  },
  ...more,
  steps: [{ click: `[data-agent-id="${ID}"]` }, ...(more.steps ?? [])],
});

export const agentsTasksScenarios: Scenario[] = [
  scenario(
    'line-doing',
    'task line, working',
    'Under the name, in place of the description: a green dot, “Drafting intros”, then muted “· 3 to do”, and a chevron. No amber.',
    { doing: 'Drafting intros', toDo: 3, waits: 0 },
    LOAD(OPEN, RECENT),
    { requires: '.agent-task-line' }
  ),
  scenario(
    'line-waits',
    'task line, something waits on you',
    'The dot is amber and “· 1 waits” is amber; “5 to do” stays muted.',
    { doing: 'Drafting intros', toDo: 5, waits: 1 },
    LOAD(OPEN, RECENT),
    { requires: '.agent-task-line__waits' }
  ),
  scenario(
    'line-idle',
    'no open tasks',
    'Nothing is open and it isn’t working, so the line is hidden and the muted description shows under the name.',
    undefined,
    LOAD([], []),
    { requires: '.agent-chat__subtitle' }
  ),
  scenario(
    'panel',
    'the task panel',
    'A 320px panel opens at the right under the header: “Tasks” and “4 to do”; groups Doing, Next, Waits on you, Done today with a 18px mark each (a ring with a filled centre, an empty square, an amber square, a green check); Mail’s line says “from Mail · 40m ago”; the waiting line is amber; the done title is struck through and muted.',
    { doing: 'Drafting intros', toDo: 2, waits: 1 },
    LOAD(OPEN, RECENT),
    { steps: [{ click: '.agent-task-line' }, { wait: 500 }], requires: '.agent-tasks__group' }
  ),
  scenario(
    'panel-empty',
    'the task panel, empty',
    '“Nothing on the list. Ask for something and it lands here.”',
    { doing: 'Drafting intros', toDo: 0, waits: 0 },
    LOAD([], []),
    { steps: [{ click: '.agent-task-line' }, { wait: 500 }], requires: '.agent-tasks__empty' }
  ),
  scenario(
    'panel-failed',
    'the task panel, the Mac not reached',
    'An amber line “Couldn’t reach your Mac. This list is from <time>.” above the panel’s content; never blank.',
    { doing: 'Drafting intros', toDo: 2, waits: 0 },
    () => {
      throw new Error('offline');
    },
    { steps: [{ click: '.agent-task-line' }, { wait: 500 }], requires: '.agent-tasks__failed' }
  ),
  scenario(
    'menu',
    'the agent menu',
    'The header’s right edge is one plain 32px ⋯ (no circle, no Routines or Model buttons). Opened, a 316px menu: Tasks first with “1 waits · 2 to do” at the right, then Usage, Routines and Model (“Claude Code” at the right, opens the editor), then the agent’s own actions with Delete last.',
    { doing: 'Drafting intros', toDo: 2, waits: 1 },
    LOAD(OPEN, RECENT),
    { steps: [{ click: '.agent-chat__more' }, { wait: 400 }], requires: '.agent-menu' }
  ),
];
