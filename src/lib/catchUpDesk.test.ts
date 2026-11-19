import { describe, expect, it } from 'vitest';
import type { Agent, AgentMessage } from './agents';
import { answersHere, catchItems, leftCount, withLater } from './catchUpDesk';

const agent = (id: string) => ({ id, name: id }) as Agent;
const ask = (id: string, ts: number, over = {}) =>
  ({
    id,
    ts,
    kind: 'approval',
    approval: { requestId: id, title: 't', detail: '', status: 'pending', ...over },
  }) as unknown as AgentMessage;

describe('catchItems', () => {
  it('goes oldest request first, then turns that did not finish', () => {
    const items = catchItems([
      { agent: agent('a'), approvals: [ask('m2', 20)], failure: null },
      { agent: agent('b'), approvals: [], failure: { id: 'f', ts: 5 } as AgentMessage },
      { agent: agent('c'), approvals: [ask('m1', 10)], failure: null },
    ]);
    expect(items.map((i) => i.key)).toEqual(['m1', 'm2', 'failed:b']);
  });
  it('lists no answered card', () => {
    const done = ask('m', 1, { status: 'allowed' });
    expect(catchItems([{ agent: agent('a'), approvals: [done], failure: null }])).toEqual([]);
  });
});

describe('Later', () => {
  const items = catchItems([
    { agent: agent('a'), approvals: [ask('1', 1), ask('2', 2), ask('3', 3)], failure: null },
  ]);
  it('moves it to the back, and is not counted as left', () => {
    expect(withLater(items, ['1']).map((i) => i.key)).toEqual(['2', '3', '1']);
    expect(leftCount(items, ['1'])).toBe(2);
    expect(leftCount(items, ['1', '2', '3'])).toBe(0);
  });
});

describe('answersHere', () => {
  it('answers a plain request, and sends a sign-in or a key to its chat', () => {
    expect(answersHere(ask('x', 1))).toBe(true);
    expect(answersHere(ask('x', 1, { secret: {} }))).toBe(false);
    expect(answersHere(ask('x', 1, { login: {} }))).toBe(false);
    expect(answersHere(undefined)).toBe(false);
  });
});
