/**
 * Allow / Deny cards after Designer's audit: a plain title that says what
 * happens (the raw command behind Details), one Allow for a whole plan said
 * as "Allow all 3" with a line for what it covers, the Mac's why-line
 * (`riskNote`), and every finished card folded to one line. Fictional;
 * capture each with `--theme light` too.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, messagesFor, msg, overview } from './agents';

const VIEW = { width: 1280, height: 900 };

type Over = Record<string, unknown>;

const card = (over: Over) =>
  msg('approval', '', 3, {
    approval: { requestId: 'cmd1', title: 'Run a command', detail: '', status: 'pending', ...over },
  });

const scenario = (
  id: string,
  title: string,
  looksRightWhen: string,
  approval: ReturnType<typeof msg>,
  more: Partial<Scenario> = {}
): Scenario => ({
  id,
  title: `Agents — approval card: ${title}`,
  looksRightWhen,
  requires: '.agent-approval',
  openSelector: AGENTS_TAB,
  steps: [{ click: '[data-agent-id="chief"]' }],
  viewport: VIEW,
  commands: {
    agents_overview: overview(),
    agents_messages: (args: Record<string, unknown>) =>
      args.agentId === 'chief'
        ? [msg('user', 'Clean up the old exports and run the tests.', 6), approval]
        : messagesFor(args),
  },
  ...more,
});

const DELETE = card({
  title: 'Run a command',
  tool: 'Bash',
  detail: 'rm -r ~/Exports/2024',
  input: { command: 'rm -r ~/Exports/2024' },
  summary: 'It touches your Exports folder: three folders from last year.',
  risk: 'high',
});

const TESTS = (status: string, over: Over = {}) =>
  card({
    title: 'Run a command',
    tool: 'Bash',
    detail: 'pnpm test',
    input: { command: 'pnpm test' },
    status,
    ...over,
  });

export const agentsApprovalScenarios: Scenario[] = [
  scenario(
    'agents-approval-plain-title',
    'a command named in plain words',
    'The title says what happens (“Delete ~/Exports/2024”), not “Run a command”; the card body is the one-line reason and a quiet “Details”, with no raw command until it is opened. Deny secondary, Allow neutral.',
    DELETE
  ),
  scenario(
    'agents-approval-plain-title-details',
    'the raw command, behind Details',
    'As the plain-title card with Details opened: the raw command `rm -r ~/Exports/2024` in a mono block, the link now says “Hide details”.',
    DELETE,
    { steps: [{ click: '[data-agent-id="chief"]' }, { click: '.agent-approval__show-all' }] }
  ),
  scenario(
    'agents-approval-unnamed-command',
    'a command it can’t name keeps the Mac’s title',
    'Title “Run a command” and the raw command shown, as before: nothing is guessed.',
    card({
      tool: 'Bash',
      detail: './deploy.sh --prod',
      input: { command: './deploy.sh --prod' },
    })
  ),
  scenario(
    'agents-approval-plan-all',
    'one Allow for a whole plan',
    'A “Do these under your name?” card of three sends: the button says “Allow all 3”; under the list one muted line “This one OK covers: send. Each step runs without asking again for an hour.”',
    card({
      requestId: 'plan1',
      title: 'Do these under your name?',
      plan: {
        actions: [
          { kind: 'send', target: 'a@example.com', summary: 'Email Aurelie about the beta' },
          { kind: 'send', target: 'b@example.com', summary: 'Email Sam about the beta' },
          { kind: 'send', target: 'c@example.com', summary: 'Email Priya about the beta' },
        ],
      },
    })
  ),
  scenario(
    'agents-approval-risk-note',
    'the Mac’s why-line',
    'Under the card’s body one muted line saying why this is asked (the payload’s `riskNote`: “Deleting outside the project folders is always asked first.”); absent on cards without one.',
    card({
      tool: 'Bash',
      detail: 'rm -r ~/Exports/2024',
      input: { command: 'rm -r ~/Exports/2024' },
      risk: 'high',
      riskNote: 'Deleting outside the project folders is always asked first.',
    })
  ),
  scenario(
    'agents-approval-allowed',
    'finished: allowed',
    'The answered card is one line: the plain title and “Allowed”, with the request one click away. No buttons.',
    TESTS('allowed')
  ),
  scenario(
    'agents-approval-denied',
    'finished: denied',
    'One line: the plain title and “Denied”.',
    TESTS('denied')
  ),
  scenario(
    'agents-approval-expired',
    'finished: nobody answered',
    'One quiet line saying it wasn’t answered in time; nothing it asked for ran.',
    TESTS('expired', { expiry: 'no_answer' })
  ),
  scenario(
    'agents-approval-set-aside',
    'finished: set aside by the app',
    'One quiet line with the app’s reason (“Closed: the turn moved on”); nothing it asked for ran.',
    TESTS('expired', { setAside: 'The turn moved on without it.' })
  ),
  ...(
    [
      ['desk', 'Allowed', 'nothing extra: the plain “Allowed”'],
      ['phone', 'Allowed on your phone', ''],
      ['phoneLockScreen', 'Allowed from the Lock Screen', ''],
      ['plan', 'Allowed with the plan', ''],
      ['auto', 'Allowed on its own', ''],
      ['admin', 'Allowed by the Chief', ''],
      ['rule', 'Allowed by your rule', ''],
    ] as const
  ).map(([from, words, extra]) =>
    scenario(
      `agents-approval-answered-${from}`,
      `finished: answered from ${from}`,
      `The one-line card says “${words}”${extra ? ` (${extra})` : ''}; no buttons.`,
      TESTS('allowed', { answeredFrom: from })
    )
  ),
  scenario(
    'agents-approval-always-note',
    'Always allow with the Mac’s sentence',
    'Always allow stays beside Allow; under the answers one quiet sentence says what it skips (`alwaysNote`).',
    TESTS('pending', {
      always: { kind: 'command_prefix', value: 'pnpm test', label: 'pnpm test' },
      alwaysNote: 'Always allow skips your Ask first rules for this command.',
    })
  ),
  scenario(
    'agents-approval-always-cant',
    'can’t be always allowed',
    'No Always allow item at all: the Mac’s sentence (“Can’t be always allowed…”) stands where it was; Allow and Deny only.',
    TESTS('pending', {
      always: { kind: 'command_prefix', value: 'git push', label: 'git push origin main' },
      alwaysNote: 'Can’t be always allowed: pushing is asked every time.',
    })
  ),
];
