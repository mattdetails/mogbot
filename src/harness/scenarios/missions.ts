/**
 * A mission's page in the eight cases Designer's spec-mission-states names
 * (standard, just started, extreme, non-count, one engine unread, over its
 * share, blocked, done), at a desk column (940) and a phone (390). The data
 * is theirs (`cases.mjs`) shaped as the Mac's record (`agents/missions.rs`),
 * so what is drawn is what the rules in `lib/missions.ts` make of it.
 */

import type { Scenario } from '../types';
import type { Mission, MissionCriterion, MissionShare } from '../../lib/missions';
import { MIN, messagesFor, now, overview, TEAM } from './agents';

const H = 60 * MIN;

const crit = (
  id: string,
  text: string,
  over: Partial<MissionCriterion> = {}
): MissionCriterion => ({
  id,
  text,
  kind: 'check',
  status: 'not_started',
  ...over,
});
const usage = (
  engine: MissionShare['engine'],
  pct: number,
  usedPct: number,
  read = true
): MissionShare => ({
  engine,
  kind: 'usage',
  pct,
  usedPct,
  readAt: read ? now - 20 * MIN : undefined,
  spentMs: 0,
});
const time = (engine: MissionShare['engine'], capMs: number, spentMs: number): MissionShare => ({
  engine,
  kind: 'time',
  pct: 0,
  usedPct: 0,
  capMs,
  spentMs,
});

const GOAL = "Get Native's pipeline to 20 qualified leads this month";
const leads = (value: number, extra: Partial<MissionCriterion> = {}) =>
  crit('c1', '20 leads with a call booked', {
    kind: 'count',
    target: 20,
    value,
    unit: 'leads with a call booked',
    status: 'in_progress',
    source: 'Counted in Native OS · read 11:02 pm',
    ...extra,
  });

const base = (over: Partial<Mission>): Mission => ({
  id: 'm1',
  goal: GOAL,
  criteria: [],
  shares: [usage('claude', 30, 11), usage('codex', 50, 10)],
  state: 'running',
  startedAt: now - 30 * H,
  endAt: now + 10 * 24 * H,
  asksFirst: [],
  updates: { whenBlocked: true, eachMilestone: false, dailyAt: 18 * 60 },
  events: [],
  verdicts: [],
  agents: [
    { name: 'Scout', engine: 'claude', status: 'Working' },
    { name: 'Lead Gen', engine: 'codex', status: 'Waiting on you' },
    { name: 'Mail', engine: 'claude', status: 'Working' },
  ],
  asks: [],
  ...over,
});

export const MISSION_CASES: Record<string, Mission> = {
  standard: base({
    summary: '3 more are in conversation.',
    criteria: [
      leads(11, { note: '10 of them from agencies. 6 so far.' }),
      crit('c2', 'Each has a company and an owner', { status: 'met', value: 11 }),
      crit('c3', 'No lead contacted twice', {
        status: 'holding',
        note: 'Checked against Native OS before every send',
      }),
    ],
    asks: [
      {
        id: 'a1',
        text: 'Your OK on 12 intro emails',
        detail: 'Nothing goes out until you approve the exact words.',
      },
    ],
    events: [
      {
        agent: 'Scout',
        text: 'Found 30 agencies that match. 9 were already in Native OS, so skipped.',
        at: now - 14 * MIN,
      },
      {
        agent: 'Lead Gen',
        text: 'Drafted 12 intros and sent them to you for approval.',
        at: now - 31 * MIN,
      },
      { agent: 'Mail', text: '3 replies in. Booked 2 calls.', at: now - 65 * MIN },
    ],
  }),
  just_started: base({
    state: 'starting',
    startedAt: now - 2 * MIN,
    shares: [usage('claude', 30, 0), usage('codex', 50, 0)],
    summary: 'Splitting the work between three agents. First update in a few minutes.',
    criteria: [leads(0, { status: 'not_started' }), crit('c2', 'Each has a company and an owner')],
    agents: [{ name: 'Chief of Staff', engine: 'claude', status: 'Planning' }],
  }),
  extreme: base({
    state: 'running',
    startedAt: now - 9 * 24 * H,
    goal: 'Migrate every client-facing page, form, redirect, newsletter template and analytics event from the old agency website and the three legacy microsites into the new platform without breaking search rankings, existing customer logins, scheduled emails or any of the integrations we rely on',
    shares: [
      usage('claude', 70, 62),
      usage('codex', 40, 31),
      time('opencode', 7 * 24 * H, 3 * 24 * H),
    ],
    summary: 'Most of the remaining work is the 1,200 legacy blog posts.',
    criteria: [
      crit(
        'c1',
        'All 487 of 1,000 target pages are live on the new platform with identical URLs and no more than 2 redirect hops',
        {
          kind: 'count',
          target: 1000,
          value: 487,
          unit: 'pages live',
          status: 'in_progress',
          source: 'Sitemap · read 11:02 am',
        }
      ),
      crit(
        'c2',
        'Search rankings hold within 5% for the top 200 keywords for 14 days after launch'
      ),
      crit('c3', 'Customer logins keep working', { status: 'holding' }),
      crit('c4', 'Newsletter templates render the same in Gmail, Outlook and Apple Mail', {
        kind: 'count',
        target: 9,
        value: 4,
        status: 'in_progress',
      }),
      crit('c5', 'Analytics events match the old property'),
      crit('c6', 'Forms deliver to the same inboxes', { status: 'holding' }),
    ],
    agents: [
      'Migration Lead for the old marketing website',
      'SEO Auditor',
      'Redirect Mapper',
      'Forms and Integrations',
      'Analytics Parity',
      'Email Templates',
      'Blog Importer',
      'QA Reviewer',
      'Chief of Staff',
    ].map((name, i) => ({
      name,
      engine: (['claude', 'codex', 'opencode'] as const)[i % 3],
      status: ['Working', 'Waiting on you', 'Idle'][i % 3],
    })),
    asks: [
      {
        id: 'a1',
        text: 'Your OK on the redirect map for 312 pages',
        detail: 'Review the first 20, the rest follow the same rule.',
      },
      {
        id: 'a2',
        text: 'Your OK to switch DNS for the first microsite',
        detail: 'This changes what visitors see.',
      },
      { id: 'a3', text: 'Your OK on 3 newsletter sends' },
      { id: 'a4', text: 'Your OK on a form change' },
      { id: 'a5', text: 'Your OK on a new redirect rule' },
    ],
    eventCount: 1284,
    events: [
      'Mapped 312 old URLs to new ones. 14 had no obvious match and are listed for you.',
      'Found 3 pages that redirect through more than 2 hops.',
      'Checked Outlook rendering for 4 templates; 2 differ in spacing.',
      'Matched 41 of 41 form handlers.',
      'Compared analytics events: 6 missing on the new site.',
      'Hidden sixth event',
    ].map((text, i) => ({
      agent: [
        'Redirect Mapper',
        'SEO Auditor',
        'Email Templates',
        'Forms and Integrations',
        'Analytics Parity',
        'QA Reviewer',
      ][i],
      text,
      at: now - (20 + i * 35) * MIN,
    })),
    endAt: now + 3 * 24 * H,
  }),
  non_count: base({
    goal: 'Move the billing page to the new design system',
    shares: [usage('claude', 25, 18)],
    summary: '1 of 4 checks pass. Waiting on the visual comparison.',
    criteria: [
      crit('c1', 'Page matches the design within 2% pixel difference at 3 widths', {
        status: 'in_progress',
      }),
      crit('c2', 'No console errors', { status: 'holding' }),
      crit('c3', 'Keyboard navigation works'),
      crit('c4', 'Lighthouse accessibility 95 or higher'),
    ],
    agents: [{ name: 'Site Builder', engine: 'claude', status: 'Working' }],
    events: [
      {
        agent: 'Site Builder',
        text: 'Rebuilt the billing page. Checking it against the design.',
        at: now - 40 * MIN,
      },
    ],
  }),
  one_engine_unread: base({
    goal: 'Clean up the support inbox and answer the easy ones',
    shares: [usage('codex', 40, 0, false), time('opencode', 24 * H, 5 * H)],
    criteria: [
      crit('c1', 'Inbox under 20 unread', {
        kind: 'reduce',
        start: 220,
        value: 142,
        target: 20,
        unit: 'unread',
        status: 'in_progress',
        source: 'Mail · read 1:02 pm',
      }),
      crit('c2', 'Every reply asks you first', { status: 'holding' }),
    ],
    agents: [{ name: 'Mail', engine: 'codex', status: 'Working' }],
    events: [{ agent: 'Mail', text: 'Sorted 220 emails into 6 groups.', at: now - 50 * MIN }],
  }),
  over_cap: base({
    state: 'paused_cap',
    pausedBy: 'claude',
    shares: [usage('claude', 30, 31), usage('codex', 50, 20)],
    summary: '14 of 20 done. Everything so far is saved.',
    criteria: [leads(14, { source: 'Native OS · read 11:40 pm' })],
    events: [{ agent: 'Mission', text: 'Paused at the share. 6 more needed.', at: now - 8 * MIN }],
  }),
  blocked: base({
    state: 'blocked',
    summary: 'Paused. Nothing is being spent.',
    blocked: {
      what: "Can't read Native OS",
      app: 'Native OS',
      affects:
        "The login expired at 11:02 pm. Scout and Lead Gen can't count leads until it's back.",
    },
    criteria: [leads(11, { note: 'Last read 11:02 pm', source: 'Last read 11:02 pm' })],
    events: [{ agent: 'Scout', text: 'Native OS asked me to sign in again.', at: now - 25 * MIN }],
  }),
  asleep: base({
    // The Mac slept: the record's last beat is old, so it says so, never "Running".
    heartbeatAt: now - 8 * H,
    summary: 'Last looked at 8 hours ago.',
    criteria: [leads(11, { note: '10 of them from agencies. 6 so far.' })],
    events: [
      {
        agent: 'Mission',
        text: 'Your Mac was asleep for 6 hours. Nothing ran and nothing was spent.',
        at: now - 90 * MIN,
      },
    ],
  }),
  done: base({
    state: 'ready',
    startedAt: now - 54 * H,
    finishedAt: now,
    checkedBy: 'codex',
    summary: '2 of 3 met. 1 could not be checked.',
    criteria: [
      leads(20, {
        status: 'met',
        note: 'Native OS shows 20, read 11:58 pm.',
        source: 'Native OS · read 11:58 pm',
      }),
      crit('c2', 'Each has a company and an owner', { status: 'met' }),
      crit('c3', 'No lead contacted twice', {
        status: 'couldnt_check',
        note: "One lead was emailed on 12 Nov, before the mission. The check couldn't see emails sent outside Mail.",
      }),
    ],
    agents: [
      { name: 'Scout', engine: 'claude', status: 'Working' },
      { name: 'Lead Gen', engine: 'claude', status: 'Working' },
    ],
    events: [{ agent: 'Mission', text: 'Mission finished. Review is ready.', at: now - 2 * MIN }],
  }),
};

const WORDS: Record<string, string> = {
  standard:
    'Running, day 2: “11 of 20 leads with a call booked”, one tick per lead (11 lit), source line under it; two share rows with “About 11% of about 30%” and “About 10% of about 50%” and the share marked on each bar; “Waiting on you” with one ask and a Review button; three criteria (11 / 20, Met, Holding); three agents with their engines; three updates; the note “It stops at about 30% of Claude’s week, 50% of Codex’s week, or on …”.',
  just_started:
    'Just now, 0 of 20 with an empty bar; “Not started” words; one agent “Planning”; “Nothing yet. The first update lands when the first step finishes.”; hatched? No: both shares were read, 0% used.',
  extreme:
    'A 190-character goal clamped to three lines with an ellipsis; a 1,000-page target as one continuous bar and a smaller 487; three shares including “Capped by time · 3 days of 7 days”; Waiting on you shows two and “and 3 more” with one “Review all 5”; four criteria then “+ 2 more criteria”; four agents then “+ 5 more agents”; five updates then “Show all 1,284 updates”. No horizontal scroll.',
  non_count:
    'No numbers: the hero reads “1 of 4 criteria met” with four segments, one lit; no source line.',
  one_engine_unread:
    'Codex’s share is hatched: “About 40% share · not read yet”; OpenCode reads “Capped by time · 5 hours of 1 day”; the hero goes DOWN: “142 goal under 20 unread” with the bar showing distance covered.',
  over_cap:
    'Amber banner “Reached about 30% of Claude’s week” with Add 10% of Claude / Finish with Codex only / Stop here; Claude’s row amber “About 31% of about 30% · over”; agents say Paused (Waiting on you survives); no Pause button.',
  asleep:
    'Neutral banner “Paused while your Mac sleeps” (no buttons, no Pause) and the chip says the same; the numbers are the last ones read; the note says what it will stop at.',
  blocked:
    'Red banner “Can’t read Native OS” saying who it affects and that usage isn’t being spent, with Reconnect Native OS and Pause mission; criterion shows its last read; agents say Blocked.',
  done: 'Neutral banner “Your call” with Accept / Keep going with 10% more / See the work; “Took 2 days 6 hours”; “Checked by Codex, which did not do the work”; one criterion “Couldn’t check” in amber with its reason; the note says “It used about … Nothing more is spent.”',
};

function commands(m: Mission) {
  return {
    agents_overview: overview(TEAM),
    agents_messages: messagesFor,
    agents_missions: [m],
  };
}

const sizes = [
  { key: '', label: 'desk column', viewport: { width: 940, height: 1100 } },
  { key: '-phone', label: 'phone width', viewport: { width: 390, height: 1100 } },
];

export const missionScenarios: Scenario[] = Object.entries(MISSION_CASES).flatMap(([name, m]) =>
  sizes.map(
    ({ key, label, viewport }): Scenario => ({
      id: `mission-${name.replace(/_/g, '-')}${key}`,
      title: `Missions — ${name.replace(/_/g, ' ')}, ${label}`,
      looksRightWhen: `${WORDS[name]} Readable in both themes; nothing is colour-only; no text cut off or horizontal scroll at this width.`,
      command: 'agents.team',
      afterCommand: [{ click: 'section[aria-label^="Missions"] .agents-team__row' }],
      requires: '.mission',
      clipSelector: '.mission',
      viewport,
      commands: commands(m),
    })
  )
);
