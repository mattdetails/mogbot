/**
 * Catch up on the desk, direction 2 (the queue on the left, the open card on
 * the right): every state in Designer's spec. Fictional. Capture each with
 * `--theme light` and `--theme dark`; measure against the mocks
 * (`designs/catchup-page/mock-desk-*.html`, 1200×700).
 */

import { emit } from '@tauri-apps/api/event';
import type { Scenario } from '../types';
import { AGENTS_TAB, agent, msg, overview } from './agents';

// 1420 = the 220px sidebar + the mocks' 1200px page.
const FRAME = { width: 1420, height: 700 };

type Ask = {
  id: string;
  name: string;
  color: string;
  title: string;
  why: string;
  minutesAgo: number;
  detail?: string;
};

const ASKS: Ask[] = [
  {
    id: 'leadgen',
    name: 'Lead Gen',
    color: 'green',
    title: 'Send 12 intro emails as you',
    why: 'Each one goes to a lead from Native OS. Nothing is sent until you allow it.',
    minutesAgo: 180,
    detail: 'send_email ×12\nfrom: you\nto: leads from Native OS',
  },
  {
    id: 'mail',
    name: 'Mail',
    color: 'orange',
    title: 'Reply to Globex as you',
    why: 'A short yes on the renewal date, from your address.',
    minutesAgo: 62,
  },
  {
    id: 'scout',
    name: 'Scout',
    color: 'blue',
    title: 'Run the tests',
    why: 'pnpm test in the Acme project.',
    minutesAgo: 12,
  },
];

const approval = (a: Ask, over: Record<string, unknown> = {}) =>
  msg('approval', '', a.minutesAgo, {
    agentId: a.id,
    approval: {
      requestId: `r-${a.id}`,
      title: a.title,
      detail: a.detail ?? '',
      summary: a.why,
      status: 'pending',
      ...over,
    },
  });

const asker = (a: Ask) =>
  agent(a.id, a.name, { color: a.color, minutesAgo: a.minutesAgo, pendingApprovals: 1 });

/** Dev Research: its turn didn't finish, so it is a row with Open chat and Later. */
const STUCK = agent('devresearch', 'Dev Research', {
  color: 'red',
  minutesAgo: 20 * 60,
  failure: { kind: 'other' },
  preview: '4 agents already have a copy of mogbot open.',
});
const STUCK_LINES = [
  msg('error', '4 agents already have a copy of mogbot open.', 20 * 60, { agentId: 'devresearch' }),
];

/** Quiet agents with something new: the rows of "While you were away". */
const HAPPENED = [
  ['h-scout', 'Scout', 'blue', 'Found 30 agencies that match. 9 were already in Native OS.', 4],
  ['h-leadgen', 'Lead Gen', 'green', 'Drafted 12 intros and sent them to you for approval.', 5],
  ['h-mail', 'Mail', 'orange', '3 replies in. Booked 2 calls.', 6],
  ['h-design', 'Design', 'red', 'Specs for the sidebar are ready.', 7],
  ['h-scout2', 'Scout', 'blue', 'Daily check ran. Nothing new.', 8],
  ['h-mail3', 'Mail', 'orange', 'Archived 41 promotional emails.', 9],
].map(([id, name, color, preview, h]) =>
  agent(String(id), String(name), {
    color,
    unread: 1,
    preview,
    minutesAgo: Number(h) * 60 - 5,
  })
);

function build(
  agents: ReturnType<typeof agent>[],
  lines: Record<string, ReturnType<typeof msg>[]> = {}
) {
  return {
    agents_overview: overview(agents),
    agents_messages: (args: Record<string, unknown>) => lines[String(args.agentId)] ?? [],
  };
}

/**
 * The asks, answerable: Allow marks the card allowed, drops the agent's
 * pending count and tells the app, as the Mac does, so a row can move to Done.
 */
function withAsks(asks: Ask[], extra: ReturnType<typeof agent>[] = [], autoAnswerMs = 0) {
  const lines: Record<string, ReturnType<typeof msg>[]> = Object.fromEntries(
    asks.map((a) => [a.id, [approval(a)]])
  );
  const answered = new Set<string>();
  const answerOne = (id: string, allow: boolean) => {
    const was = lines[id]?.[0];
    if (!was) return;
    answered.add(id);
    const next = {
      ...was,
      approval: {
        ...((was as { approval?: object }).approval ?? {}),
        status: allow ? 'allowed' : 'denied',
      },
    };
    lines[id] = [next];
    void emit('agents://message', next);
    void emit('agents://registry', {});
  };
  let timer = false;
  const agents = () =>
    [...asks.map(asker), ...extra].map((a) =>
      answered.has(a.id) ? { ...a, pendingApprovals: 0 } : a
    );
  return {
    agents_overview: () => {
      if (autoAnswerMs && !timer) {
        timer = true;
        asks.forEach((a, i) => setTimeout(() => answerOne(a.id, true), autoAnswerMs + i * 300));
      }
      return overview(agents());
    },
    agents_messages: (args: Record<string, unknown>) => lines[String(args.agentId)] ?? [],
    agents_answer_approval: (args: Record<string, unknown>) =>
      answerOne(String(args.agentId), !!args.allow),
  };
}

const scenario = (
  id: string,
  title: string,
  looksRightWhen: string,
  commands: Scenario['commands'],
  more: Partial<Scenario> = {}
): Scenario => ({
  id: `agents-catchup-${id}`,
  title: `Agents — Catch up: ${title}`,
  looksRightWhen,
  requires: '.agents-catchup',
  viewport: FRAME,
  commands,
  openSelector: AGENTS_TAB,
  ...more,
  // Steps run before a palette command, so each one opens Catch up from the sidebar first.
  steps: [{ click: '.agents-catchup-row' }, ...(more.steps ?? [])],
});

const SELECTED_NOTE =
  'The first row of Needs you is selected (control surface, a 1px default border) and its card is open at the right.';

const longAsk: Ask = {
  ...ASKS[0],
  id: 'longone',
  name: 'Quarterly Reports and Investor Relations Assistant',
  title:
    'Send the quarterly investor update, with the attached financial statements and the revised forecast, to all forty-two limited partners as you',
  why: 'Each partner gets the same letter and the same attachments from your address, with their own name at the top. The forecast is the one you changed on Tuesday, and the statements are the unaudited ones the finance team exported this morning. Nothing is sent until you allow it, and every send is recorded in the sent folder so you can find it afterwards. If any address bounces it is listed here and the rest still go out, so a typo in one never holds up the other forty-one. It is the longest request in the queue.',
  minutesAgo: 95,
  detail: 'send_email ×42',
};

export const agentsCatchUpScenarios: Scenario[] = [
  scenario(
    'one',
    'one decision left (a turn that didn’t finish)',
    `Header “Catch up” then “1 left”; the queue has “NEEDS YOU · 1” with one 52px row (Dev Research’s key, the ask (“4 agents already have a copy of mogbot open.”) as its title, “Dev Research · Didn’t finish” under it, 20h at the right) selected, then “THEN” and a clock-tile row “While you were away / 6 things, no decisions”. The card is centred: key, name and “20h ago”; an amber dot with “DIDN’T FINISH”; the ask at 22px; a strong Open chat (O) filling the row and a ghost Later (L). No progress bar.`,
    build([STUCK, ...HAPPENED], { devresearch: STUCK_LINES })
  ),
  scenario(
    'several',
    'several left, the first open',
    `${SELECTED_NOTE} Three rows, longest waiting first (3h, 1h, 12m), “Then” with the summary row. The card: Lead Gen, “NEEDS YOUR OK”, “Send 12 intro emails as you”, the line under it, a strong Allow (A) filling the row, an outline Deny (D), a ghost Details; Open chat and Later quiet beneath. Allow is the inverse surface, never an accent.`,
    withAsks(ASKS, HAPPENED)
  ),
  scenario(
    'hover',
    'a queue row hovered',
    'The second row shows the hover surface (a step lighter than selected, no border); the selected row keeps its own surface and border.',
    withAsks(ASKS, HAPPENED),
    {
      steps: [
        { wait: 600 },
        { hover: '.agents-catchup__queue .agents-catchup__row:nth-of-type(2)' },
        { wait: 400 },
      ],
    }
  ),
  scenario(
    'focus',
    'a queue row focused with the keyboard',
    'The focused row has a 2px neutral ring (text-secondary) offset by 1px; never the accent colour.',
    withAsks(ASKS, HAPPENED),
    {
      steps: [
        // The card takes focus as it opens; wait that out, then walk to row 2 by keyboard.
        { wait: 600 },
        { focus: '.agents-catchup__queue .agents-catchup__row:nth-of-type(1)' },
        { key: 'Tab' },
      ],
    }
  ),
  scenario(
    'selected-second',
    'the second row selected',
    'Clicking the second row opens Mail’s card (“Reply to Globex as you”) and the row takes the selected surface; the first goes back to plain.',
    withAsks(ASKS, HAPPENED),
    { steps: [{ click: '.agents-catchup__queue .agents-catchup__row:nth-of-type(2)' }] }
  ),
  scenario(
    'later',
    'the first put off with Later',
    'Lead Gen’s row sits last in Needs you with a muted “Later” in place of its age; Mail’s card is open and the header says “2 left”.',
    withAsks(ASKS, HAPPENED),
    { steps: [{ click: '.agents-catchup__quiet button:last-child' }] }
  ),
  scenario(
    'summary',
    'the summary open (while you were away)',
    'The summary row is selected and the header says “Summary”. The card: a clock tile, “While you were away” and “6 things · no decisions”; six 52px rows with a key, one sentence and its time at the right, hairlines between; one strong Got it.',
    build(HAPPENED),
    {}
  ),
  scenario(
    'done',
    'answered rows in Done, the summary open',
    'The fixture answers all three by itself (as the Mac would on Allow): the queue starts with a muted “DONE · 3” (each row ends in a check), “THEN” has the summary row, the pane shows the summary and the header says “Summary”.',
    withAsks(ASKS, HAPPENED, 1500),
    { mockEvents: true, steps: [{ wait: 3500 }] }
  ),
  scenario(
    'all-clear',
    'all clear',
    'Header “All clear”; the queue is “NEEDS YOU · 0” with one muted row “Nothing waiting”; the pane is a centred 48px ring with a check, “All clear”, “Nothing needs you.” (no time: nothing was answered here) and one outline “What’s in flight”.',
    build([])
  ),
  scenario(
    'narrow',
    'a window narrower than 880px',
    'In an 800px window the queue column is gone; the header count is a button (“3 left” with a chevron) and the card fills the pane at 100% − 32px.',
    withAsks(ASKS, HAPPENED),
    { viewport: { width: 800, height: 700 } }
  ),
  scenario(
    'narrow-queue',
    'narrow, the queue open in a popover',
    'Below the count button the queue opens as a popover (the same rows and groups); picking one closes it.',
    withAsks(ASKS, HAPPENED),
    { viewport: { width: 800, height: 700 }, steps: [{ click: '.agents-catchup__left-button' }] }
  ),
  scenario(
    'many',
    '100 or more waiting',
    'The group label and the header count say “99+” (“NEEDS YOU · 99+”, “99+ left”), not the number.',
    build(
      Array.from({ length: 104 }, (_, i) =>
        agent(`bulk${i}`, `Agent ${i + 1}`, {
          color: ['green', 'orange', 'blue', 'red'][i % 4],
          minutesAgo: 10 + i,
          pendingApprovals: 1,
        })
      ),
      Object.fromEntries(
        Array.from({ length: 104 }, (_, i) => [
          `bulk${i}`,
          [
            approval({
              id: `bulk${i}`,
              name: `Agent ${i + 1}`,
              color: 'green',
              title: `Approve step ${i + 1}`,
              why: 'One of many.',
              minutesAgo: 10 + i,
            }),
          ],
        ])
      )
    )
  ),
  scenario(
    'long',
    'long text',
    'The queue title is one line with an ellipsis; the card title clamps to 3 lines and the body to 6; nothing scrolls sideways and the card stays inside the pane.',
    withAsks([longAsk, ...ASKS.slice(1)], HAPPENED)
  ),
  scenario(
    'details',
    'Details open',
    'Details shows the request’s own words in a quiet panel hung below the card; the card and its actions do not move.',
    withAsks(ASKS, HAPPENED),
    { steps: [{ click: '.agents-catchup__actions [aria-expanded]' }] }
  ),
];
