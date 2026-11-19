import { describe, expect, it } from 'vitest';
import {
  agentStatus,
  asksStrip,
  banner,
  bottomNote,
  criterionWord,
  dayLabel,
  duration,
  fmt,
  hero,
  isAsleep,
  isBigNumber,
  reconnectMessage,
  stateWord,
  shareRow,
  type Mission,
  type MissionCriterion,
  type MissionShare,
} from './missions';

const crit = (over: Partial<MissionCriterion>): MissionCriterion => ({
  id: 'c',
  text: 'x',
  kind: 'check',
  status: 'in_progress',
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
  readAt: read ? 1 : undefined,
  spentMs: 0,
});
const base = (over: Partial<Mission> = {}): Mission => ({
  id: 'm1',
  goal: 'g',
  criteria: [crit({ kind: 'count', target: 20, value: 11 })],
  shares: [usage('claude', 30, 11), usage('codex', 50, 10)],
  state: 'running',
  startedAt: 0,
  asksFirst: [],
  updates: { whenBlocked: true, eachMilestone: false },
  events: [],
  verdicts: [],
  agents: [],
  asks: [],
  ...over,
});

describe('hero (rule 2)', () => {
  it('is one tick per unit up to 20 and one bar beyond', () => {
    expect(hero(base()).kind).toBe('ticks');
    const big = base({ criteria: [crit({ kind: 'count', target: 1000, value: 487 })] });
    expect(hero(big).kind).toBe('bar');
  });
  it('says how far a goal that goes DOWN has come', () => {
    const m = base({ criteria: [crit({ kind: 'reduce', start: 220, value: 142, target: 20 })] });
    const h = hero(m);
    expect(h.kind).toBe('reduce');
    if (h.kind === 'reduce') {
      expect(h.value).toBe(142);
      expect(h.covered).toBeCloseTo(78 / 200);
    }
  });
  it('falls back to N of M criteria when nothing has a number', () => {
    const m = base({
      criteria: [
        crit({ status: 'met' }),
        crit({ status: 'in_progress' }),
        crit({ status: 'holding' }),
        crit({ status: 'not_started' }),
      ],
    });
    expect(hero(m)).toEqual({ kind: 'criteria', met: 2, total: 4 });
  });
  it('formats thousands and marks four-digit numbers', () => {
    expect(fmt(1284)).toBe('1,284');
    expect(isBigNumber(999)).toBe(false);
    expect(isBigNumber(1000)).toBe(true);
  });
});

describe('usage shares (rule 3)', () => {
  it('says about, on every cap', () => {
    expect(shareRow(usage('claude', 30, 11)).text).toBe('About 11% of about 30%');
  });
  it('goes amber and says over when past the share', () => {
    const r = shareRow(usage('claude', 30, 31));
    expect(r.over).toBe(true);
    expect(r.text).toBe('About 31% of about 30% · over');
    expect(r.marker).toBeLessThan(r.fill);
  });
  it('hatches an engine with no reading and never makes one up', () => {
    const r = shareRow(usage('codex', 40, 0, false));
    expect(r.unread).toBe(true);
    expect(r.text).toBe('About 40% share · not read yet');
    expect(r.fill).toBe(0);
  });
  it('caps an engine with no usage numbers by time', () => {
    const r = shareRow({
      engine: 'opencode',
      kind: 'time',
      pct: 0,
      usedPct: 0,
      capMs: 24 * 3_600_000,
      spentMs: 5 * 3_600_000,
    });
    expect(r.text).toBe('Capped by time · 5 hours of 1 day');
    expect(r.unread).toBe(false);
  });
  it('reads durations plainly', () => {
    expect(duration(5 * 3_600_000)).toBe('5 hours');
    expect(duration(3 * 24 * 3_600_000)).toBe('3 days');
  });
});

describe('waiting on you (rule 4)', () => {
  const ask = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, text: `t${i}` }));
  it('hides at 0, shows 1, and caps at two with the rest counted', () => {
    expect(asksStrip(ask(0)).shown).toHaveLength(0);
    expect(asksStrip(ask(1)).shown).toHaveLength(1);
    const five = asksStrip(ask(5));
    expect(five.shown).toHaveLength(2);
    expect(five.more).toBe(3);
    expect(five.all).toBe(5);
  });
});

describe('banners (rule 5)', () => {
  it('is amber at a share with three ways on', () => {
    const m = base({
      state: 'paused_cap',
      pausedBy: 'claude',
      shares: [usage('claude', 30, 31), usage('codex', 50, 20)],
    });
    const b = banner(m)!;
    expect(b.tone).toBe('amber');
    expect(b.title).toBe("Reached about 30% of Claude's week");
    expect(b.actions.map((a) => a.label)).toEqual([
      'Add 10% of Claude',
      'Finish with Codex only',
      'Stop here',
    ]);
  });
  it('offers no other engine when none has room', () => {
    const m = base({
      state: 'paused_cap',
      pausedBy: 'claude',
      shares: [usage('claude', 30, 31)],
    });
    expect(banner(m)!.actions.map((a) => a.action)).toEqual(['add_more', 'stop']);
  });
  it('is red when blocked and says usage is not being spent', () => {
    const m = base({
      state: 'blocked',
      blocked: { what: "Can't read Native OS", affects: "Scout and Lead Gen can't count leads." },
    });
    const b = banner(m)!;
    expect(b.tone).toBe('red');
    expect(b.text).toContain("Your usage isn't being spent");
  });
  it('is neutral when ready, with Accept first', () => {
    const b = banner(base({ state: 'ready' }))!;
    expect(b.tone).toBe('neutral');
    expect(b.actions[0].label).toBe('Accept');
  });
  it('has no banner while running', () => {
    expect(banner(base())).toBeNull();
  });
});

describe('a Mac that slept, and Reconnect', () => {
  const live = base({ heartbeatAt: 0 });
  it('is only asleep when live and the last beat is old', () => {
    expect(isAsleep(live, 4 * 60_000)).toBe(false);
    expect(isAsleep(live, 6 * 60_000)).toBe(true);
    expect(isAsleep({ ...live, state: 'paused_cap' }, 99 * 60_000)).toBe(false);
    expect(isAsleep(base(), 99 * 60_000)).toBe(false);
  });
  it('says it, and offers no button, never looking like it runs', () => {
    expect(stateWord(live, 10 * 60_000)).toBe('Paused while your Mac sleeps');
    const b = banner(live, 10 * 60_000)!;
    expect(b.title).toBe('Paused while your Mac sleeps');
    expect(b.actions).toHaveLength(0);
    expect(banner(live, 60_000)).toBeNull();
  });
  it('offers Reconnect for a blocked mission that names its app', () => {
    const m = base({
      state: 'blocked',
      blocked: { what: "Can't read Native OS", app: 'Native OS' },
    });
    expect(banner(m)!.actions.map((a) => a.label)).toEqual([
      'Reconnect Native OS',
      'Pause mission',
    ]);
    expect(reconnectMessage(m)).toContain('Reconnect Native OS');
    const plain = base({ state: 'blocked', blocked: { what: 'x' } });
    expect(banner(plain)!.actions.map((a) => a.action)).toEqual(['pause']);
  });
});

describe('criteria and agents (rules 6 and 8)', () => {
  it('uses the status word or the count', () => {
    expect(criterionWord(crit({ status: 'met' }))).toBe('Met');
    expect(criterionWord(crit({ status: 'couldnt_check' }))).toBe("Couldn't check");
    expect(criterionWord(crit({ kind: 'count', value: 11, target: 20 }))).toBe('11 / 20');
    expect(criterionWord(crit({ kind: 'reduce', value: 142, target: 20 }))).toBe('142 left');
  });
  it('derives an agent status from the mission', () => {
    const a = { name: 'Scout', engine: 'claude' as const, status: 'Working' };
    const w = { ...a, status: 'Waiting on you' };
    expect(agentStatus(base(), a)).toBe('Working');
    expect(agentStatus(base({ state: 'paused_cap' }), a)).toBe('Paused');
    expect(agentStatus(base({ state: 'blocked' }), a)).toBe('Blocked');
    expect(agentStatus(base({ state: 'paused_cap' }), w)).toBe('Waiting on you');
    expect(agentStatus(base({ state: 'done' }), w)).toBe('Done');
    expect(agentStatus(base({ state: 'stopped' }), a)).toBe('Stopped');
  });
});

describe('the note and the day (rule 9)', () => {
  it('says what stops it while it runs, and what it used after', () => {
    const m = base({ endAt: new Date(2026, 10, 30, 12).getTime() });
    expect(bottomNote(m)).toBe(
      "It stops at about 30% of Claude's week, 50% of Codex's week, or on 30 Nov."
    );
    expect(bottomNote({ ...m, state: 'ready' })).toBe(
      "It used about 11% of Claude's week, 10% of Codex's week. Nothing more is spent."
    );
  });
  it('says "of about M" only when the Mac estimated it, and when it runs past', () => {
    const day = 24 * 3_600_000;
    expect(dayLabel(base({ startedAt: 0 }), day + 1)).toBe('Day 2');
    expect(dayLabel(base({ startedAt: 0, estimatedDays: 3 }), day + 1)).toBe('Day 2 of about 3');
    expect(dayLabel(base({ startedAt: 0, estimatedDays: 3 }), 3 * day + 1)).toBe(
      'Day 4 · running longer than expected'
    );
  });
  it('counts days, says just now, and says how long it took', () => {
    expect(dayLabel(base({ startedAt: 0 }), 5 * 60_000)).toBe('Just now');
    expect(dayLabel(base({ startedAt: 0 }), 26 * 3_600_000)).toBe('Day 2');
    expect(dayLabel(base({ state: 'ready', startedAt: 0, finishedAt: 54 * 3_600_000 }), 0)).toBe(
      'Took 2 days 6 hours'
    );
  });
});
