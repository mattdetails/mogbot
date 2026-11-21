import { describe, expect, it } from 'vitest';
import type { Agent, AgentMessage } from './agents';
import {
  answersHere,
  catchItems,
  entryCard,
  leftCount,
  withLater,
  withRoomCards,
  type CatchItem,
} from './catchUpDesk';

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

describe('withRoomCards', () => {
  it('counts a card asked for in a room, which the agent’s own chat doesn’t hold', () => {
    const acme = agent('acme');
    const roomCard = { ...ask('r1', 5), room: 'pricing' } as AgentMessage;
    const groups = withRoomCards(
      [{ agent: acme, approvals: [], failure: null }],
      new Map([['acme', [roomCard]]])
    );
    expect(catchItems(groups).map((i) => i.key)).toEqual(['r1']);
  });

  it('adds each card once, oldest first, and leaves other agents alone', () => {
    const acme = agent('acme');
    const own = ask('a1', 3);
    const groups = withRoomCards(
      [
        { agent: acme, approvals: [own], failure: null },
        { agent: agent('mail'), approvals: [ask('m1', 1)], failure: null },
      ],
      new Map([['acme', [ask('r1', 2), own]]])
    );
    expect(groups[0].approvals.map((m) => m.id)).toEqual(['r1', 'a1']);
    expect(groups[1].approvals.map((m) => m.id)).toEqual(['m1']);
  });
});

describe('entryCard (the entry’s hero, option A)', () => {
  const item = (id: string, agentId: string, ts: number) =>
    ({ key: id, agent: agent(agentId), message: ask(id, ts), ts }) as CatchItem;
  const headline = (i: CatchItem) => `ask ${i.key}`;

  it('is nothing when nothing waits (the All caught up line instead)', () => {
    expect(entryCard([], 0, headline)).toBeNull();
  });

  it('with several: the count, from how many agents (no time estimate), Start, and the list', () => {
    const card = entryCard(
      [item('a', 'lead', 1), item('b', 'mail', 2), item('c', 'lead', 3)],
      0,
      headline
    )!;
    expect(card).toMatchObject({
      state: 'many',
      title: '3 things need you',
      sub: 'From 2 agents',
      action: 'Start catching up',
      list: true,
    });
    expect(card.agents.map((a) => a.id)).toEqual(['lead', 'mail']);
  });

  it('with one: who and what, Review it, and no list', () => {
    expect(entryCard([item('a', 'lead', 1)], 0, headline)).toMatchObject({
      state: 'one',
      title: '1 thing needs you',
      sub: 'lead: ask a',
      action: 'Review it',
      list: false,
    });
  });

  it('mid-run: what is left, how many done, Continue, and how far through', () => {
    expect(entryCard([item('b', 'mail', 2), item('c', 'scout', 3)], 1, headline)).toMatchObject({
      state: 'midRun',
      title: '2 left',
      sub: '1 done · from 2 agents',
      action: 'Continue',
      list: true,
      progress: 1 / 3,
    });
  });
});
