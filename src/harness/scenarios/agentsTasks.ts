/**
 * The agent menu (⋯), the task line under the name and the task panel
 * (Designer's G-7 and G-6): every state. `Agent.tasks` is a fixture of the
 * agreed shape `{ doing?, toDo, waits }` until the Mac sends it.
 * Capture each with `--theme light` and `--theme dark`.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, agent, msg, overview, status } from './agents';

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
  { commands: extraCommands, ...more }: Partial<Scenario> = {}
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
    ...(extraCommands ?? {}),
  },
  ...more,
  steps: [{ click: `[data-agent-id="${ID}"]` }, ...(more.steps ?? [])],
});


/** The sidebar's three task sub lines (DRYRUN-MISSING.md): 5 to do, Idle, 14 to do · Busy. */
function sidebarRow(id: string, title: string, looksRightWhen: string): Scenario {
  return {
    id,
    title,
    looksRightWhen,
    openSelector: AGENTS_TAB,
    requires: '.agents-list',
    clipSelector: '.workspace-sidebar',
    viewport: { width: 1100, height: 720 },
    commands: {
      agents_overview: overview([
        agent('lead', 'Lead Gen', {
          color: 'green',
          minutesAgo: 3,
          tasks: { toDo: 5, waits: 0 },
        }),
        agent('mail', 'Mail', { color: 'blue', minutesAgo: 20 }),
        agent('scout', 'Scout', {
          color: 'orange',
          minutesAgo: 1,
          status: status('working', 'Sweeping invoices'),
          tasks: { doing: 'Sweeping invoices', toDo: 14, waits: 0 },
        }),
      ]),
      agents_messages: () => [],
    },
  };
}

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

  // ---- Fidelity QA's gate: the task data states (DRYRUN-MISSING.md, Chief Brain) ----
  scenario(
    'dropped',
    'the task panel, a dropped line',
    'Done today shows the dropped line muted with its reason (“Dropped · lead list was stale”); it is kept for the day, not struck through like a finished one.',
    { doing: 'Drafting intros', toDo: 2, waits: 0 },
    LOAD(OPEN.slice(0, 3), [
      task('d1', 'Re-send the October recap', 'dropped', 50, {
        note: 'The lead list was stale',
        version: 3,
      }),
      ...RECENT,
    ]),
    { steps: [{ click: '.agent-task-line' }, { wait: 500 }], requires: '.agent-tasks__group' }
  ),
  scenario(
    'assigned',
    'the task panel, a line another agent assigned',
    'Next shows “Chase the Globex invoice” with “from Mail · 09:10”; the chat behind has Mail’s centred team line “Mail added a task for Lead Gen · Chase the Globex invoice”.',
    { doing: 'Drafting intros', toDo: 2, waits: 0 },
    LOAD(
      [
        OPEN[0],
        task('a1', 'Chase the Globex invoice', 'next', 40, {
          source: 'assigned',
          from: { id: 'mail', name: 'Mail' },
          version: 1,
        }),
        OPEN[2],
      ],
      RECENT
    ),
    {
      steps: [{ click: '.agent-task-line' }, { wait: 500 }],
      requires: '.agent-tasks__group',
      commands: {
        agents_messages: () => [
          msg('user', 'Draft the intros.', 60, { agentId: ID }),
          msg('note', 'Mail added a task for Lead Gen · Chase the Globex invoice', 40, {
            agentId: ID,
          }),
        ],
      },
    }
  ),
  scenario(
    'unseen',
    'the task panel, finished lines not looked at yet',
    'Done · 2 shows “2 new” and a blue dot on the two unseen lines; the task line under the name says “· 2 finished”; the seen line has no dot.',
    { doing: 'Drafting intros', toDo: 1, waits: 0 },
    LOAD(OPEN.slice(0, 2), [
      task('u1', 'Pull the lead list from Native OS', 'done', 20, {
        seen: false,
        askedMsg: 'm-ask-1',
        deliveredMsg: 'm-del-1',
        version: 4,
      }),
      task('u2', 'Check the three leads that bounced', 'done', 35, {
        seen: false,
        askedMsg: 'm-ask-2',
        deliveredMsg: 'm-del-2',
        version: 3,
      }),
      task('u3', 'Rename the Acme folder', 'done', 150, { seen: true, version: 3 }),
    ]),
    { steps: [{ click: '.agent-task-line' }, { wait: 500 }], requires: '.agent-tasks__group' }
  ),
  scenario(
    'archived',
    'the task panel, Archived opened',
    'Under Done a quiet “Archived · 3” row, opened: lines newest first, each with its day (“done Sun”, “you archived it · Thu”), ending “Tasks you archive, and tasks done more than 3 days ago, show up here.”',
    { doing: 'Drafting intros', toDo: 1, waits: 0 },
    LOAD(OPEN.slice(0, 2), [
      task('r1', 'Rename the Acme folder', 'done', 60 * 24 * 4, { archived: true, seen: true }),
      task('r2', 'Pull 30 agencies from the list', 'done', 60 * 24 * 5, {
        archived: true,
        seen: true,
      }),
      task('r3', 'Check the Globex contract', 'done', 60 * 24 * 6, { archived: true, seen: true }),
    ]),
    { steps: [{ click: '.agent-task-line' }, { wait: 500 }], requires: '.agent-tasks__group' }
  ),
  scenario(
    'rewound',
    'the task panel, nothing archived and a rewound ask',
    'No “Archived” row at all (never “Archived · 0”). A finished line whose ask was rewound away has its “Open the ask” greyed “Rewound”; one in a deleted chat says “No longer in this chat”.',
    { doing: 'Drafting intros', toDo: 1, waits: 0 },
    LOAD(OPEN.slice(0, 2), [
      task('w1', 'Draft the Q3 recap', 'done', 45, {
        seen: true,
        askedMsg: 'folded-by-rewind',
        deliveredMsg: 'folded-by-rewind-2',
      }),
      task('w2', 'Pull the lead list', 'done', 90, {
        seen: true,
        askedMsg: 'in-a-deleted-chat',
        deliveredMsg: null,
      }),
    ]),
    { steps: [{ click: '.agent-task-line' }, { wait: 500 }], requires: '.agent-tasks__group' }
  ),
  sidebarRow(
    'agents-sidebar-row-busy',
    'Agents sidebar rows with task counts',
    'Three rows’ sub lines: “5 to do”, “Idle” and “14 to do · Busy”, with Busy in amber and the others muted.'
  ),
];
