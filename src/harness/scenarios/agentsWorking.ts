/**
 * The working indicator (`AgentWorkingIndicator`): one row at the end of the
 * chat, the agent's key and one phrase made from the observed step, a timer
 * after 8s, "Still working" when quiet, "Needs your OK on N" with a real
 * Review. Each state at desk width (1440) and at 390px; capture each with
 * `--theme light` too. Times are taken when the page loads, so a capture a few
 * seconds later shows a few seconds more than the title says. Fictional.
 */

import type { Scenario } from '../types';
import { TEAM, messagesFor, msg, overview, status } from './agents';

type Call = Record<string, unknown>;

/** The turn's work as the Mac reports it mid-turn, `ago` ms after it started. */
const work = (opts: {
  startedAgo: number;
  call?: Call;
  steps?: { agoMs: number; kind: string; label: string }[];
  lastSignAgo?: number;
}) => {
  const now = Date.now();
  const steps = (opts.steps ?? []).map((s) => ({
    at: now - s.agoMs,
    kind: s.kind,
    label: s.label,
  }));
  return {
    startedAt: now - opts.startedAgo,
    stepCount: steps.length,
    fileCount: 0,
    steps,
    ...(opts.call
      ? {
          doing: String(opts.call.label),
          current: {
            streams: false,
            canStop: false,
            startedAt: now - (opts.startedAgo > 4000 ? 4000 : opts.startedAgo),
            ...opts.call,
          },
        }
      : {}),
    lastSignAt: now - (opts.lastSignAgo ?? 1500),
  };
};

const CHAT = [
  msg('user', 'Research Northwind Studio and draft the intro emails.', 6),
  msg('agent', 'On it. I’ll start with their site and what they’ve shipped lately.', 5),
];

const SEND_ACTIONS = Array.from({ length: 12 }, (_, i) => ({
  kind: 'send',
  target: `lead${i + 1}@example.com`,
  summary: `Intro email ${i + 1}`,
}));

interface Spec {
  id: string;
  title: string;
  looksRightWhen: string;
  /** The Chief's status while it works. */
  working?: () => Record<string, unknown>;
  messages?: ReturnType<typeof msg>[];
  requires?: string;
  /** Not working (only a card waits). */
  waiting?: boolean;
}

const make = (
  spec: Spec,
  viewport: { width: number; height: number },
  suffix: string
): Scenario => ({
  id: `${spec.id}${suffix}`,
  title: `Agents — working: ${spec.title}${suffix ? ' (390px)' : ''}`,
  looksRightWhen: `${spec.looksRightWhen} One row at the end of the chat: the agent’s key on the bubble’s left edge, 40px tall, 10px under the last bubble or card (never more), the phrase in muted text with its timer at the right edge of the words.`,
  requires: spec.requires ?? '.agent-chat__row--working',
  openSelector: '.mode-toggle [data-tab-value="agents"]',
  steps: viewport.width < 600 ? [] : [{ click: '[data-agent-id="chief"]' }],
  viewport,
  mockEvents: true,
  commands: {
    agents_overview: () =>
      overview(
        TEAM.map((a) =>
          a.id === 'chief'
            ? {
                ...a,
                // Waiting on a card, the turn is still the agent's: the row says so.
                status: spec.waiting
                  ? status('waiting')
                  : { ...status('working', null), ...(spec.working?.() ?? {}) },
                ...(spec.waiting ? { pendingApprovals: 1 } : {}),
                ...(spec.waiting ? { pendingApprovals: 1 } : {}),
              }
            : a
        )
      ),
    agents_messages: (args: Record<string, unknown>) =>
      args.agentId === 'chief' ? (spec.messages ?? CHAT) : messagesFor(args),
  },
});

const SPECS: Spec[] = [
  {
    id: 'agents-working-start',
    title: 'just started, nothing observed yet',
    looksRightWhen: 'Says “Working on it” with no timer: no step has been observed yet.',
    working: () => ({ work: work({ startedAgo: 2000 }) }),
  },
  {
    id: 'agents-working-reading',
    title: 'reading a page',
    looksRightWhen: 'Says “Reading Northwind’s site” and “8s” after it.',
    working: () => ({
      activity: 'Reading Northwind’s site',
      work: work({
        startedAgo: 8000,
        call: { kind: 'web', label: 'Reading Northwind’s site' },
      }),
    }),
  },
  {
    id: 'agents-working-chrome',
    title: 'in Chrome',
    looksRightWhen: 'Says “In Chrome on linkedin.com” and “21s”.',
    working: () => ({
      activity: 'In Chrome on linkedin.com',
      work: work({
        startedAgo: 21000,
        call: { kind: 'tool', label: 'In Chrome on linkedin.com', chrome: true },
        steps: [{ agoMs: 15000, kind: 'web', label: 'Read northwind.example' }],
      }),
    }),
  },
  {
    id: 'agents-working-command',
    title: 'running commands, with progress',
    looksRightWhen: 'Says “Running the tests”, “3 of 8” (the step reports it) and “40s”.',
    working: () => ({
      activity: 'Running the tests',
      work: work({
        startedAgo: 40000,
        call: {
          kind: 'command',
          label: 'Running the tests',
          progress: { done: 3, total: 8 },
          slow: 'tests',
          streams: true,
          canStop: true,
        },
        steps: [{ agoMs: 38000, kind: 'read', label: 'Read the test config' }],
      }),
    }),
  },
  {
    id: 'agents-working-delegate',
    title: 'checking with another agent',
    looksRightWhen: 'Says “Checking with Scout” and “12s”.',
    working: () => ({
      activity: 'Checking with Scout',
      work: work({
        startedAgo: 12000,
        call: { kind: 'delegate', label: 'Checking with Scout' },
      }),
    }),
  },
  {
    id: 'agents-working-quiet',
    title: 'quiet for a while',
    looksRightWhen:
      'Says “Still working” and “1m 40s”, with no shimmer: nothing new for over a minute.',
    working: () => ({
      activity: 'Reading the Apollo invoices',
      work: work({
        startedAgo: 100000,
        lastSignAgo: 100000,
        steps: [{ agoMs: 99000, kind: 'read', label: 'Read the Apollo invoices' }],
      }),
    }),
  },
  {
    id: 'agents-working-needs-ok',
    title: 'needs your OK',
    looksRightWhen:
      'Says “Needs your OK on 12 emails” with a real Review button right of it (no shimmer, no timer); at 390px the button wraps under the text and is not clipped. The plan card above it holds the twelve sends.',
    waiting: true,
    messages: [
      ...CHAT,
      msg('approval', '', 3, {
        approval: {
          requestId: 'ok12',
          title: 'Do these under your name?',
          detail: '',
          status: 'pending',
          plan: { actions: SEND_ACTIONS },
        },
      }),
    ],
    requires: '.agent-working__review',
  },
  {
    id: 'agents-working-long',
    title: 'a 90-character host',
    looksRightWhen:
      'One line with an ellipsis in the phrase and the timer still visible at its right.',
    working: () => ({
      activity:
        'In Chrome on a-very-long-subdomain.of-a-surprisingly-long-company-name.example-hosting.com',
      work: work({
        startedAgo: 33000,
        call: {
          kind: 'tool',
          label:
            'In Chrome on a-very-long-subdomain.of-a-surprisingly-long-company-name.example-hosting.com',
          chrome: true,
        },
      }),
    }),
  },
  {
    id: 'agents-working-after-card',
    title: 'under an approval card',
    looksRightWhen:
      'The row sits 10px under the approval card above it, never 40px or more; the card is a plain request still waiting while the agent works on.',
    working: () => ({
      activity: 'Reading Northwind’s site',
      work: work({ startedAgo: 9000, call: { kind: 'web', label: 'Reading Northwind’s site' } }),
    }),
    messages: [
      ...CHAT,
      msg('approval', '', 2, {
        approval: {
          requestId: 'ok1',
          title: 'Run a command',
          detail: 'npm run build',
          status: 'pending',
          tool: 'Bash',
        },
      }),
    ],
  },
];

export const agentsWorkingScenarios: Scenario[] = SPECS.flatMap((s) => [
  make(s, { width: 1440, height: 900 }, ''),
  make(s, { width: 390, height: 844 }, '-390'),
]);
