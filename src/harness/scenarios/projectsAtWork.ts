/**
 * An agent at work in a codebase, seen from Projects (`agents::workplace`):
 * the project it works in is pinned at the top of the sidebar with a line
 * under its row saying who is in it and the step they're on. Fictional team
 * and repos.
 */

import type { Scenario } from '../types';
import { HARNESS_ROOT, dashboardProject } from './base';
import { MIN, TEAM, messagesFor, now, overview } from './agents';
import { workspaceCommands } from './workspace';

const SITE = `${HARNESS_ROOT}/lumen-site`;
const ACME = `${HARNESS_ROOT}/acme-marketing`;

const turn = (label: string, project: string) => ({
  startedAt: now - 4 * MIN,
  stepCount: 6,
  fileCount: 2,
  doing: label,
  current: { kind: 'command', label, startedAt: now - 2 * MIN, streams: false, canStop: true },
  lastSignAt: now - 2_000,
  steps: [{ at: now - 4 * MIN, kind: 'read', label: 'Read package.json' }],
  project,
});

const team = () =>
  TEAM.map((a) => {
    if (a.id === 'acme') {
      return {
        ...a,
        status: {
          state: 'working' as const,
          activity: 'Running the build',
          since: now - 4 * MIN,
          work: turn('Running the build', SITE),
        },
      };
    }
    if (a.id === 'finance') {
      return {
        ...a,
        status: {
          state: 'working' as const,
          activity: 'Running the tests',
          since: now - 3 * MIN,
          work: turn('Running the tests', ACME),
        },
      };
    }
    return a;
  });

const MEMBER = `${HARNESS_ROOT}/northwind-docs`;

/** Three projects; agents working in two of them (four in one, to show the +N). */
const busyTeam = () =>
  TEAM.map((a) => {
    const at = (project: string, label: string, mins: number) => ({
      ...a,
      status: {
        state: 'working' as const,
        activity: label,
        since: now - mins * MIN,
        work: turn(label, project),
      },
    });
    if (a.id === 'chief')
      return at(SITE, 'Running a Python script to merge the exported invoices', 6);
    if (a.id === 'acme') return at(SITE, 'Thinking', 4);
    if (a.id === 'finance') return at(SITE, 'Running the tests', 3);
    if (a.id === 'leadgen') return at(SITE, 'Reading the pricing page', 2);
    if (a.id === 'native') return at(MEMBER, 'Editing PricingTable.tsx', 2);
    return a;
  });

const busyCommands = {
  get_dashboard_projects: [
    dashboardProject('lumen-site'),
    dashboardProject('acme-marketing'),
    dashboardProject('northwind-docs'),
  ],
  list_pinned_projects: [SITE, ACME, MEMBER],
  agents_overview: overview(busyTeam()),
  agents_with_projects: busyTeam(),
};

const chatCommands = {
  ...workspaceCommands,
  get_current_branch: 'feat/pricing-page',
  get_hide_main_branch_warning: true,
  get_dashboard_projects: [dashboardProject('lumen-site'), dashboardProject('acme-marketing')],
  list_pinned_projects: [SITE],
  agents_overview: overview(team()),
  agents_with_projects: team(),
  agents_messages: messagesFor,
};

/** Acme Site bound to lumen-site, Finance on another project, nobody at work. */
const boundTeam = () =>
  TEAM.map((a) =>
    a.id === 'acme' ? { ...a, project: SITE } : a.id === 'finance' ? { ...a, project: ACME } : a
  );

const pickCommands = {
  ...chatCommands,
  agents_overview: overview(TEAM.map((a) => (a.id === 'finance' ? { ...a, project: ACME } : a))),
  agents_with_projects: TEAM,
};

export const projectsAtWorkScenarios: Scenario[] = [
  {
    id: 'project-opens-on-agent',
    title: 'Opening a project an agent works on lands on its chat',
    looksRightWhen:
      'lumen-site’s workspace opens straight on Acme Site’s conversation in the Session panel (no click): its own header, the composer at the bottom, no Terminal bar and no terminal footer.',
    project: SITE,
    requires: '[data-testid="session-agent-chat"]',
    commands: {
      ...chatCommands,
      agents_overview: overview(boundTeam()),
      agents_with_projects: boundTeam(),
    },
  },
  {
    id: 'project-opens-pick-agent',
    title: 'Opening a project nobody works on asks who should',
    looksRightWhen:
      '“Who should work on lumen-site?” in the Session panel: one line under it, then a card of agents (each key, name and “Also on acme-marketing” or its role), “New agent for this project” last, and “Rather type commands yourself?” with a Use a terminal button. No Terminal bar or footer. The Chief is not listed.',
    project: SITE,
    requires: '[data-testid="project-pick-agent"]',
    commands: pickCommands,
  },
  {
    id: 'project-opens-pick-terminal',
    title: 'Use a terminal: which one',
    looksRightWhen:
      'Back at the top, “Which terminal?”, a line, then Claude Code, Codex, OpenCode and Plain terminal rows, each with its icon and one line, and an “Open lumen-site this way next time” tick box under them.',
    project: SITE,
    requires: '[data-testid="project-pick-agent"]',
    steps: [{ click: '.project-pick__foot button' }],
    commands: pickCommands,
  },
  {
    id: 'project-agent-chat-in-session',
    title: 'A project: an agent at work in it, its chat open in the Session panel',
    looksRightWhen:
      'lumen-site’s workspace. The sidebar reads Agents (Acme Site, selected), Terminals (Claude Code 1), Dev server. The panel where the terminal was shows Acme Site’s conversation under its own header, as in Agents, with the composer at the bottom; no Terminal bar above it and no terminal footer under it.',
    project: SITE,
    requires: '[data-testid="session-agent-chat"]',
    steps: [{ click: '.sidebar-row--agent .sidebar-row-hit[aria-label="Acme Site"]' }],
    commands: chatCommands,
  },
  // The message box in a project's Session panel (narrow): the words on their
  // own row, the tools under them, at its one-line height when empty.
  ...(
    [
      ['empty', ''],
      ['short', 'Looks good, ship it'],
      [
        'wrapped',
        'Can you check the nav again on the phone width, it still does not stick to the top when you scroll down and the logo looks squished',
      ],
    ] as const
  ).map(([state, text]) => ({
    id: `project-composer-${state}`,
    title: `A project: the message box in the Session panel, ${state}`,
    looksRightWhen:
      'Acme Site’s chat in lumen-site’s Session panel. The message box: the words (or “Message”) across the whole box, not indented; under them + and the model chip on the left, mic and Send on the right; one line tall when empty, never a tall empty box.',
    project: SITE,
    requires: '[data-testid="session-agent-chat"] .agent-composer__input',
    clipSelector: '[data-testid="session-agent-chat"]',
    steps: [
      { click: '.sidebar-row--agent .sidebar-row-hit[aria-label="Acme Site"]' },
      ...(text ? [{ fill: '.agent-composer__input', value: text }] : []),
    ],
    commands: chatCommands,
  })),
  {
    id: 'project-agent-chat-back-to-terminal',
    title: 'A project: picking a terminal after an agent’s chat brings the terminals back',
    looksRightWhen:
      'lumen-site’s workspace with the Terminal bar, the terminal and its footer back; Claude Code 1 selected under Terminals, no agent row selected.',
    project: SITE,
    requires: '.terminal-pane-footer',
    steps: [
      { click: '.sidebar-row--agent .sidebar-row-hit[aria-label="Acme Site"]' },
      { click: '.sidebar-row-hit[aria-label="Claude Code 1"]' },
    ],
    commands: chatCommands,
  },
  {
    id: 'project-worktrees-agent-copy',
    title: 'A project with an agent’s copy: the Worktrees list, hovered',
    looksRightWhen:
      'Under lumen-site, Worktrees lists main and the agent’s copy, each on one line: the branch name truncates before its age (“4 minutes ago”), and the hovered row’s × sits at the row’s right end, never under the name.',
    project: SITE,
    requires: '#sidebar-section-worktrees',
    steps: [{ hover: '#sidebar-section-worktrees .sidebar-row:last-child' }],
    clipSelector: '.workspace-sidebar',
    commands: {
      ...chatCommands,
      list_worktrees: [
        {
          path: SITE,
          head: 'a1b2c3d',
          branch: 'main',
          isMain: true,
          isCurrent: true,
          locked: null,
          prunable: null,
          lastCommitDate: now - 2 * 60 * MIN,
        },
        {
          path: `${HARNESS_ROOT}/.worktrees/lumen-site/mogbot-builder-the-pricing-cards-fc23`,
          head: 'e4f5a6b',
          branch: 'mogbot-builder/the-pricing-cards-fc23',
          isMain: false,
          isCurrent: false,
          locked: null,
          prunable: null,
          lastCommitDate: now - 4 * MIN,
        },
      ],
    },
  },
  {
    id: 'projects-agents-collapsed',
    title: 'Projects: three projects, agents working in two, rows collapsed',
    looksRightWhen:
      'Collapsed project rows carry only a small stack of agent avatars (max 3, then +N) and the working indicator; no lines under the rows, nothing overlapping.',
    startOn: 'projects',
    requires: '.sidebar-project',
    clipSelector: '.workspace-sidebar',
    commands: busyCommands,
  },
  {
    id: 'projects-agents-expanded',
    title: 'Projects: a project expanded, agents working in it sit among its sessions',
    looksRightWhen:
      'Under Agents, one row per working agent: avatar, name, then its live step, clipped to one line with an ellipsis. Clicking one opens its chat.',
    startOn: 'projects',
    requires: '.sidebar-project',
    clipSelector: '.workspace-sidebar',
    steps: [{ click: '.sidebar-project-chevron' }],
    commands: busyCommands,
  },
  {
    id: 'projects-agent-at-work',
    title: 'Projects — the project an agent is working in, with what it’s doing',
    looksRightWhen:
      'Projects. The sidebar’s Pinned group starts with lumen-site with one small agent avatar at its right (and no line under the row); acme-marketing (not pinned) appears in the Active group with its own avatar. Expanded, the agents are rows under Agents.',
    startOn: 'projects',
    requires: '.sidebar-project-at-work',
    clipSelector: '.workspace-sidebar',
    commands: {
      get_dashboard_projects: [dashboardProject('lumen-site'), dashboardProject('acme-marketing')],
      list_pinned_projects: [SITE],
      agents_overview: overview(team()),
      agents_with_projects: team(),
    },
  },
];
