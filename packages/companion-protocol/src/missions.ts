/**
 * Missions (`agents/missions.rs`): the record, and the rules that turn it
 * into the page, on the desk and the phone (docs: Designer's spec-mission-states, "build to
 * these rules, not to one sample"). Every function is pure so the rules are
 * tested with the eight cases, not with one sample.
 *
 * Shares are said as "about" everywhere: usage is read every ~10 minutes and
 * a running turn can overshoot, so a cap is soft. Nothing here is guessed: an
 * engine with no reading says "not read yet", never a made-up figure.
 *
 * @module companion-protocol/missions
 */

export type MissionState =
  | 'starting'
  | 'running'
  | 'paused_cap'
  | 'paused'
  | 'blocked'
  | 'ready'
  | 'done'
  | 'stopped';
export type EngineId = 'claude' | 'codex' | 'opencode';
export type CriterionKind = 'count' | 'reduce' | 'check';
export type CriterionStatus =
  | 'not_started'
  | 'in_progress'
  | 'met'
  | 'holding'
  | 'couldnt_check'
  | 'not_met';

export interface MissionCriterion {
  id: string;
  text: string;
  kind: CriterionKind;
  target?: number;
  start?: number;
  value?: number;
  unit?: string;
  status: CriterionStatus;
  source?: string;
  note?: string;
}

export interface MissionShare {
  engine: EngineId;
  accountId?: string;
  kind: 'usage' | 'time';
  pct: number;
  usedPct: number;
  readAt?: number;
  capMs?: number;
  spentMs: number;
}

export interface MissionEvent {
  agent: string;
  text: string;
  at: number;
}
export interface MissionAgent {
  name: string;
  engine: EngineId;
  status: string;
}
export interface MissionAsk {
  id: string;
  text: string;
  detail?: string;
}

export interface Mission {
  id: string;
  goal: string;
  criteria: MissionCriterion[];
  shares: MissionShare[];
  state: MissionState;
  startedAt: number;
  endAt?: number;
  asksFirst: string[];
  updates: { whenBlocked: boolean; eachMilestone: boolean; dailyAt?: number };
  blocked?: { what: string; app?: string; affects?: string };
  events: MissionEvent[];
  checkedBy?: EngineId;
  verdicts: { criterion: string; result: 'met' | 'not_met' | 'couldnt_check'; evidence?: string }[];
  finishedAt?: number;
  pausedBy?: EngineId;
  summary?: string;
  agents: MissionAgent[];
  asks: MissionAsk[];
  /** The last time the Mac looked at it while it ran; an old one means it was asleep. */
  heartbeatAt?: number;
  /** More updates than `events` holds, when a source knows (the harness). */
  eventCount?: number;
}

export const ENGINE_NAME: Record<EngineId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
};
/** The engine as its company says it in a sentence ("Claude's week"). */
const ENGINE_SHORT: Record<EngineId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
};

/* ------------------------------------------------------------- numbers */

/** 1,284. */
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** Four digits or more use the smaller size (rule 2). */
export const isBigNumber = (n: number) => Math.abs(Math.round(n)) >= 1000;

/* ---------------------------------------------------------------- hero */

export type Hero =
  | { kind: 'ticks'; value: number; target: number; unit?: string; source?: string }
  | { kind: 'bar'; value: number; target: number; unit?: string; source?: string }
  | {
      kind: 'reduce';
      value: number;
      target: number;
      /** 0..1 of the distance from where it started. */
      covered: number;
      unit?: string;
      source?: string;
    }
  | { kind: 'criteria'; met: number; total: number };

const isMet = (c: MissionCriterion) =>
  c.status === 'met' ||
  c.status === 'holding' ||
  (c.kind === 'count' && c.value !== undefined && c.target !== undefined && c.value >= c.target) ||
  (c.kind === 'reduce' && c.value !== undefined && c.target !== undefined && c.value <= c.target);

export const metCount = (m: Mission) => m.criteria.filter(isMet).length;

/**
 * Rule 2. The hero is the first criterion with a number: a target of 20 or
 * fewer is one tick per unit, more is one continuous bar; a criterion that
 * goes DOWN shows the current number and "goal under N". With no numeric
 * criterion it is "N of M criteria met", one segment per criterion.
 */
export function hero(m: Mission): Hero {
  const c = m.criteria.find(
    (x) => (x.kind === 'count' || x.kind === 'reduce') && x.target !== undefined
  );
  if (!c || c.target === undefined) {
    return { kind: 'criteria', met: metCount(m), total: m.criteria.length };
  }
  const value = c.value ?? (c.kind === 'reduce' ? (c.start ?? 0) : 0);
  if (c.kind === 'reduce') {
    const start = c.start ?? Math.max(value, c.target);
    const span = Math.max(1, start - c.target);
    return {
      kind: 'reduce',
      value,
      target: c.target,
      covered: Math.min(1, Math.max(0, (start - value) / span)),
      unit: c.unit,
      source: c.source,
    };
  }
  return {
    kind: c.target <= 20 ? 'ticks' : 'bar',
    value,
    target: c.target,
    unit: c.unit,
    source: c.source,
  };
}

/* -------------------------------------------------------------- shares */

export interface ShareRow {
  engine: EngineId;
  name: string;
  /** 0..100 of the bar the share's marker sits at, and how far it is filled. */
  marker: number;
  fill: number;
  over: boolean;
  /** No reading yet: a hatched bar. */
  unread: boolean;
  text: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "5 hours", "1 day", "3 days", "40 minutes". */
export function duration(ms: number): string {
  if (ms >= DAY) {
    const d = Math.round(ms / DAY);
    return `${d} ${d === 1 ? 'day' : 'days'}`;
  }
  if (ms >= HOUR) {
    const h = Math.round(ms / HOUR);
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const m = Math.max(1, Math.round(ms / 60_000));
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Rule 3. One row per engine with a share: the bar with the share marked;
 * over the share, amber beyond the marker and "About 31% of about 30% ·
 * over"; no reading yet, hatched and "About 40% share · not read yet"; an
 * engine with no usage numbers, "Capped by time · 5 hours of 1 day". Always
 * "about", never a made-up reading.
 */
export function shareRow(s: MissionShare): ShareRow {
  const name = ENGINE_NAME[s.engine];
  if (s.kind === 'time') {
    const cap = s.capMs ?? 0;
    return {
      engine: s.engine,
      name,
      marker: 100,
      fill: cap > 0 ? Math.min(100, (s.spentMs / cap) * 100) : 0,
      over: cap > 0 && s.spentMs >= cap,
      unread: false,
      text: `Capped by time · ${duration(s.spentMs)} of ${duration(cap)}`,
    };
  }
  const unread = s.readAt === undefined;
  if (unread) {
    return {
      engine: s.engine,
      name,
      marker: s.pct,
      fill: 0,
      over: false,
      unread: true,
      text: `About ${fmt(s.pct)}% share · not read yet`,
    };
  }
  const over = s.usedPct >= s.pct && s.pct > 0;
  const scale = Math.max(s.pct, s.usedPct, 1);
  return {
    engine: s.engine,
    name,
    marker: (s.pct / scale) * 100,
    fill: (Math.min(s.usedPct, scale) / scale) * 100,
    over,
    unread: false,
    text: `About ${fmt(s.usedPct)}% of about ${fmt(s.pct)}%${over ? ' · over' : ''}`,
  };
}

/* ---------------------------------------------------------------- asks */

/** Rule 4: 0 hidden; 1 = the item; 2+ = the first two, "and N more", one "Review all N". */
export function asksStrip(asks: MissionAsk[]): { shown: MissionAsk[]; more: number; all: number } {
  if (asks.length === 0) return { shown: [], more: 0, all: 0 };
  if (asks.length === 1) return { shown: asks, more: 0, all: 1 };
  return { shown: asks.slice(0, 2), more: asks.length - 2, all: asks.length };
}

/* -------------------------------------------------------------- banner */

export interface Banner {
  tone: 'amber' | 'red' | 'neutral';
  title: string;
  text: string;
  /** What each button does: the app's call, by action id. */
  actions: {
    label: string;
    action:
      | 'add_more'
      | 'finish_with'
      | 'stop'
      | 'pause'
      | 'accept'
      | 'see'
      | 'resume'
      | 'reconnect';
    engine?: EngineId;
  }[];
}

/** A beat older than this on a live mission: the Mac was asleep (or the app closed). */
export const ASLEEP_MS = 5 * 60_000;

/**
 * A live mission the Mac hasn't looked at for a while isn't running, however
 * its record reads: "Paused while your Mac sleeps". On the phone, reading a
 * kept record from a Mac that went to sleep says so rather than looking live.
 */
export function isAsleep(m: Mission, now: number): boolean {
  return (
    (m.state === 'starting' || m.state === 'running') &&
    m.heartbeatAt !== undefined &&
    now - m.heartbeatAt > ASLEEP_MS
  );
}

/** The state's words, with the sleep said. */
export function stateWord(m: Mission, now: number): string {
  return isAsleep(m, now) ? 'Paused while your Mac sleeps' : STATE_WORD[m.state];
}

/**
 * Rule 5. Banners are for state only: amber at a share (Add 10% / Finish
 * with the other engine / Stop here), red when blocked (what broke, who it
 * affects, that usage isn't being spent), neutral when ready for review.
 */
export function banner(m: Mission, now?: number): Banner | null {
  if (m.state === 'paused_cap') {
    const e = m.pausedBy;
    const share = m.shares.find((s) => s.engine === e);
    const other = m.shares.find((s) => s.engine !== e && s.kind === 'usage' && s.usedPct < s.pct);
    const actions: Banner['actions'] = [];
    if (e) {
      actions.push({ label: `Add 10% of ${ENGINE_SHORT[e]}`, action: 'add_more', engine: e });
      if (other) {
        actions.push({
          label: `Finish with ${ENGINE_SHORT[other.engine]} only`,
          action: 'finish_with',
          engine: other.engine,
        });
      }
    } else {
      actions.push({ label: 'Add more time', action: 'add_more' });
    }
    actions.push({ label: 'Stop here', action: 'stop' });
    const title = e
      ? share?.kind === 'time'
        ? `${ENGINE_SHORT[e]} reached its time cap`
        : `Reached about ${fmt(share?.pct ?? 0)}% of ${ENGINE_SHORT[e]}'s week`
      : 'The end date came';
    return {
      tone: 'amber',
      title,
      text: 'The running step finished first, so it may have gone a little over. Everything so far is saved.',
      actions,
    };
  }
  if (m.state === 'blocked') {
    const b = m.blocked;
    return {
      tone: 'red',
      title: b?.what ?? 'Blocked',
      text: `${b?.affects ? `${b.affects} ` : ''}Your usage isn't being spent.`.trim(),
      actions: [
        ...(b?.app ? [{ label: `Reconnect ${b.app}`, action: 'reconnect' as const }] : []),
        { label: 'Pause mission', action: 'pause' as const },
      ],
    };
  }
  if (m.state === 'ready') {
    return {
      tone: 'neutral',
      title: 'Your call',
      text: 'Accepting closes the mission and keeps this page.',
      actions: [
        { label: 'Accept', action: 'accept' },
        {
          label: 'Keep going with 10% more',
          action: 'add_more',
          engine: m.shares.find((s) => s.kind === 'usage')?.engine,
        },
        { label: 'See the work', action: 'see' },
      ],
    };
  }
  if (now !== undefined && isAsleep(m, now)) {
    return {
      tone: 'neutral',
      title: 'Paused while your Mac sleeps',
      text: 'It carries on when your Mac wakes. Nothing runs and nothing is spent until then.',
      actions: [],
    };
  }
  if (m.state === 'paused') {
    return {
      tone: 'neutral',
      title: 'Paused',
      text: 'Nothing is being spent. Resume when you are ready.',
      actions: [
        { label: 'Resume', action: 'resume' },
        { label: 'Stop here', action: 'stop' },
      ],
    };
  }
  return null;
}

/* ------------------------------------------------------------ criteria */

export const CRITERIA_SHOWN = 4;
export const EVENTS_SHOWN = 5;
export const AGENTS_SHOWN = 4;

/** Rule 6: the status word, or the count. */
export function criterionWord(c: MissionCriterion): string {
  switch (c.status) {
    case 'met':
      return 'Met';
    case 'holding':
      return 'Holding';
    case 'couldnt_check':
      return "Couldn't check";
    case 'not_started':
      return 'Not started';
    case 'not_met':
      return 'Not met';
    default:
      break;
  }
  if (c.value !== undefined && c.target !== undefined) {
    return c.kind === 'reduce' ? `${fmt(c.value)} left` : `${fmt(c.value)} / ${fmt(c.target)}`;
  }
  return 'In progress';
}

/* ------------------------------------------------------------- agents */

/**
 * Rule 8. The status shown comes from the mission: paused, blocked, done and
 * stopped override "Working"; only "Waiting on you" survives, and not after done.
 */
export function agentStatus(m: Mission, a: MissionAgent): string {
  if (m.state === 'done') return 'Done';
  if (m.state === 'stopped') return 'Stopped';
  if (a.status === 'Waiting on you') return a.status;
  if (m.state === 'paused_cap' || m.state === 'paused') return 'Paused';
  if (m.state === 'blocked') return 'Blocked';
  if (m.state === 'ready') return 'Done';
  return a.status;
}

/* ----------------------------------------------------------- the page */

export function dayLabel(m: Mission, now: number): string {
  if ((m.state === 'ready' || m.state === 'done' || m.state === 'stopped') && m.finishedAt) {
    const took = m.finishedAt - m.startedAt;
    const d = Math.floor(took / DAY);
    const h = Math.round((took - d * DAY) / HOUR);
    if (d >= 1) {
      return `Took ${d} ${d === 1 ? 'day' : 'days'}${h ? ` ${h} ${h === 1 ? 'hour' : 'hours'}` : ''}`;
    }
    return `Took ${duration(took)}`;
  }
  const since = now - m.startedAt;
  if (since < 10 * 60_000) return 'Just now';
  return `Day ${Math.floor(since / DAY) + 1}`;
}

/** The date as "30 Nov", the same field in the header and the bottom note (rule 9). */
export function endDate(m: Mission): string | null {
  if (m.endAt === undefined) return null;
  return new Date(m.endAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "Claude 30%, Codex 50%" for the note. */
function sharesPhrase(m: Mission, used: boolean): string {
  const parts = m.shares.map((s) =>
    s.kind === 'time'
      ? `${ENGINE_SHORT[s.engine]}'s time cap of ${duration(s.capMs ?? 0)}`
      : `${fmt(used ? s.usedPct : s.pct)}% of ${ENGINE_SHORT[s.engine]}'s week`
  );
  return parts.join(', ');
}

/** Rule 9: the bottom note depends on state. */
export function bottomNote(m: Mission): string {
  const end = endDate(m);
  if (m.state === 'ready' || m.state === 'done' || m.state === 'stopped') {
    return `It used about ${sharesPhrase(m, true)}. Nothing more is spent.`;
  }
  return `It stops at about ${sharesPhrase(m, false)}${end ? `, or on ${end}` : ''}.`;
}

/** What "Reconnect" says to the Chief, which has the login card for that app. */
export function reconnectMessage(m: Mission): string {
  const app = m.blocked?.app ?? 'the app';
  return `Reconnect ${app}: my mission "${m.goal.slice(0, 80)}" is blocked on it.`;
}

/** The heading chip for a state, always words. */
export const STATE_WORD: Record<MissionState, string> = {
  starting: 'Starting',
  running: 'Running',
  paused_cap: 'Paused at its share',
  paused: 'Paused',
  blocked: 'Blocked',
  ready: 'Ready for review',
  done: 'Done',
  stopped: 'Stopped',
};

/** Missions to list: open ones first, newest first. */
export function ordered(all: Mission[]): Mission[] {
  const open = (m: Mission) => (m.state === 'done' || m.state === 'stopped' ? 1 : 0);
  return [...all].sort((a, b) => open(a) - open(b) || b.startedAt - a.startedAt);
}
