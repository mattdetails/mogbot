/**
 * The quiet chat header (spec-header-dropdown): one hint dot by priority, and
 * the sheet's Now row in the spec's words (`lib/headerHint`).
 */
import { headerHint, nowLine, requestsLine, shortSpan, taskSummary } from '../src/lib/headerHint';
import { agent } from './helpers';

const NOW = Date.UTC(2026, 10, 20, 12, 0);
const idle = { state: 'idle' as const, activity: null, since: null };
const working = { state: 'working' as const, activity: 'Drafting intros', since: NOW - 3 * 60_000 };

describe('headerHint', () => {
  it('is none when idle', () => {
    expect(headerHint(agent({ status: idle }))).toBeNull();
  });

  it('is blue while working', () => {
    expect(headerHint(agent({ status: working }))).toBe('working');
  });

  it('is amber when a request or a task waits on you, over working', () => {
    expect(headerHint(agent({ status: working, pendingApprovals: 1 }))).toBe('waits');
    expect(headerHint(agent({ status: working, tasks: { toDo: 3, waits: 1 } }))).toBe('waits');
    expect(headerHint(agent({ status: { ...working, state: 'waiting' } }))).toBe('waits');
  });

  it('is red when the last turn did not finish', () => {
    expect(headerHint(agent({ status: idle, failure: { kind: 'other' } as never }))).toBe('failed');
  });

  it('is none when paused for the refill: a usage limit ends by itself', () => {
    expect(
      headerHint(agent({ status: idle, failure: { kind: 'usage_limit', resetsAt: NOW } as never }))
    ).toBeNull();
  });
});

describe('nowLine', () => {
  it('says what it is doing and for how long', () => {
    expect(nowLine(agent({ status: working }), 'Claude Code', NOW)).toEqual({
      tone: 'working',
      text: 'Drafting intros',
      time: '3m',
    });
  });

  it('says Waiting for your OK when a request waits', () => {
    expect(nowLine(agent({ status: idle, pendingApprovals: 2 }), 'Claude Code', NOW).text).toBe(
      'Waiting for your OK'
    );
  });

  it('says Paused until the refill, with the time left', () => {
    const a = agent({
      status: idle,
      failure: { kind: 'usage_limit', resetsAt: NOW + 34 * 3_600_000 } as never,
    });
    expect(nowLine(a, 'Claude Code', NOW)).toEqual({
      tone: 'idle',
      text: 'Paused until the refill · 1d 10h',
    });
  });

  it('says Didn’t finish with the reason, never twice', () => {
    const line = nowLine(
      agent({ status: idle, failure: { kind: 'signed_out' } as never }),
      'Claude Code',
      NOW
    );
    expect(line.tone).toBe('failed');
    expect(line.text).toBe('Didn’t finish: Claude Code is signed out');
    expect(line.retryable).toBe(false);
  });

  it('is Idle otherwise', () => {
    expect(nowLine(agent({ status: idle }), 'Claude Code', NOW)).toEqual({
      tone: 'idle',
      text: 'Idle',
    });
  });
});

describe('the sheet’s words', () => {
  it('counts tasks as the spec writes them', () => {
    expect(taskSummary(5, 2)).toEqual({ toDo: '5 to do', waits: '2 wait on you' });
    expect(taskSummary(3, 1)).toEqual({ toDo: '3 to do', waits: '1 waits on you' });
    expect(taskSummary(4, 0)).toEqual({ toDo: '4 to do', waits: undefined });
  });

  it('counts requests', () => {
    expect(requestsLine(1)).toBe('1 request needs your OK');
    expect(requestsLine(2)).toBe('2 requests need your OK');
  });

  it('shortens spans', () => {
    expect(shortSpan(20_000)).toBe('now');
    expect(shortSpan(3 * 60_000)).toBe('3m');
    expect(shortSpan(65 * 60_000)).toBe('1h 5m');
    expect(shortSpan(34 * 3_600_000)).toBe('1d 10h');
  });
});
