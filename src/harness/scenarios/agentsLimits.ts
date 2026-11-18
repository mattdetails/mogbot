/**
 * Accounts stacking: one agent runs out of usage, more accounts are added,
 * and the same chat carries on, first on the next Claude Code account, then
 * on Codex. The words are the app's own: the usage-limit line
 * (`agents::failure`), "Switched to …" (`wallet::switch_line`) and
 * "Carried on with Codex (…)" (`crossover::carried_line`, for an agent with
 * no connectors, which adds nothing after it). Every name is fictional.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, MIN, TEAM, agent, messagesFor, msg, now, overview } from './agents';
import { FULL_INVENTORY, usageCommands } from './agentsUsage';

const H = 3_600_000;
const clock = (t: number) =>
  new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const PERSONAL_BACK = now + 2 * H + 13 * MIN;
const CLAUDE_BACK = now + 3 * H + 6 * MIN;

const SITE = agent('site', 'Website', {
  shape: 1,
  color: 'blue',
  colorway: 'ocean',
  icon: 'face-03',
  minutesAgo: 1,
  role: 'Builds and looks after the company site.',
  preview: 'The FAQ is in: six questions, and it holds on mobile.',
});

const ASKED = [
  msg('user', 'Build the new pricing page and check it on mobile.', 9, { agentId: 'site' }),
  msg('agent', 'On it: three tiers, monthly and yearly, with the FAQ under them.', 9, {
    agentId: 'site',
  }),
];

const OUT_CHAT = [
  ...ASKED,
  msg('error', `Claude Code is out of usage until ${clock(PERSONAL_BACK)}.`, 8, {
    agentId: 'site',
    failure: { kind: 'usage_limit', resetsAt: PERSONAL_BACK },
  }),
];

const CARRIED_CHAT = [
  ...ASKED,
  msg('note', `Switched to Work: Personal is out of usage until ${clock(PERSONAL_BACK)}.`, 8, {
    agentId: 'site',
  }),
  msg('agent', 'The pricing page is up: three tiers, and it holds on mobile.', 6, {
    agentId: 'site',
  }),
  msg('user', 'Nice. Now add the FAQ.', 4, { agentId: 'site' }),
  msg('note', `Carried on with Codex (Claude Code is out until ${clock(CLAUDE_BACK)}).`, 4, {
    agentId: 'site',
  }),
  msg('agent', 'The FAQ is in: six questions, and it holds on mobile.', 1, { agentId: 'site' }),
];

/** Personal out, Work starting new work, Codex next, local models beside. */
const [, , , CODEX] = FULL_INVENTORY.accounts as Record<string, unknown>[];
const win = (kind: string, usedPercent: number, resetsIn: number) => ({
  kind,
  usedPercent,
  resetsAt: now + resetsIn,
  windowMinutes: kind === 'primary' || kind === 'five_hour' ? 300 : 10_080,
  limited: usedPercent >= 100,
  observedAt: now - 2 * MIN,
});
const STACKED_INVENTORY = {
  ...FULL_INVENTORY,
  mode: 'normal',
  spare: [],
  accounts: [
    {
      engine: 'claude',
      id: 'p1',
      name: 'Personal',
      thisMac: false,
      signedIn: true,
      out: true,
      outUntil: PERSONAL_BACK,
      next: false,
      windows: [win('five_hour', 100, PERSONAL_BACK - now)],
      learned: [],
      check: { at: now - 2 * MIN, outcome: 'read', via: 'headers' },
    },
    {
      engine: 'claude',
      id: 'w1',
      name: 'Work',
      thisMac: false,
      signedIn: true,
      out: false,
      next: true,
      windows: [win('five_hour', 34, 4 * H), win('seven_day', 41, 3 * 24 * H)],
      learned: [],
      check: { at: now - 2 * MIN, outcome: 'read', via: 'headers' },
    },
    {
      ...CODEX,
      name: 'ChatGPT Plus',
      out: false,
      next: false,
      windows: [win('primary', 12, 5 * H), win('secondary', 20, 4 * 24 * H)],
    },
  ],
};

const OUT_TEAM = overview([
  {
    ...SITE,
    preview: `Claude Code is out of usage until ${clock(PERSONAL_BACK)}.`,
    failure: { kind: 'usage_limit', resetsAt: PERSONAL_BACK },
  },
  ...TEAM.filter((a) => a.id !== 'acme'),
] as unknown as typeof TEAM);
const SITE_TEAM = overview([
  SITE,
  ...TEAM.filter((a) => a.id !== 'acme'),
] as unknown as typeof TEAM);

/** Hiring runs on Codex, so Codex's accounts are part of the list. */
const CODEX_TEAM = overview(
  [SITE, ...TEAM.filter((a) => a.id !== 'acme')].map((a) =>
    a.id === 'hiring' ? { ...a, engine: 'codex' as const } : a
  ) as unknown as typeof TEAM
);

const chat = (lines: unknown[]) => (args: Record<string, unknown>) =>
  args.agentId === 'site' ? lines : messagesFor(args);

export const agentsLimitsScenarios: Scenario[] = [
  {
    id: 'agents-limits-out',
    title: 'Agents — Website runs out of usage mid-task',
    looksRightWhen:
      'Website’s chat: the pricing-page ask, “On it…”, then the quiet usage-limit line “Claude Code is out of usage until <time>.” with Retry at <time>, Try now and Add another account.',
    requires: '.agent-bubble--error[data-failure="usage_limit"]',
    openSelector: AGENTS_TAB,
    steps: [{ click: '[data-agent-id="site"]' }],
    commands: { agents_overview: OUT_TEAM, agents_messages: chat(OUT_CHAT) },
  },
  {
    id: 'settings-limits-stacked',
    title: 'Settings — Accounts & usage: Personal out, Work next, Codex after',
    looksRightWhen:
      'Accounts in order: 1 Personal, Out of usage; 2 Work, Starts new work; 3 ChatGPT Plus (Codex). Every name readable, none squeezed to a letter.',
    command: 'settings.page.accounts',
    requires: '.usage-panel .usage-row',
    afterCommand: [{ scroll: '.usage-rows__list' }],
    commands: {
      agents_overview: CODEX_TEAM,
      ...usageCommands(STACKED_INVENTORY),
      agents_crossover: { claude: 'carry', codex: 'ask', away: [] },
    },
  },
  {
    id: 'agents-limits-carried',
    title: 'Agents — Website carries on: Work, then Codex, same chat',
    looksRightWhen:
      'Website’s chat: “Switched to Work: Personal is out of usage until <time>.”, the pricing page done, the FAQ ask, “Carried on with Codex (Claude Code is out until <time>).” and the FAQ done.',
    requires: '.agent-bubble',
    openSelector: AGENTS_TAB,
    steps: [{ click: '[data-agent-id="site"]' }],
    commands: { agents_overview: SITE_TEAM, agents_messages: chat(CARRIED_CHAT) },
  },
];
