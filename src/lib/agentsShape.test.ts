import { describe, expect, it } from 'vitest';
import { sameButProgress } from './agentsStore';
import type { Agent, AgentStatus } from './agents';

const working = (n: number, extra: Partial<AgentStatus> = {}): AgentStatus => ({
  state: 'working',
  activity: `Running step ${n}`,
  since: 1_000 + n,
  work: {
    startedAt: 1_000,
    stepCount: n,
    steps: [],
    project: '/p/acme',
  } as unknown as AgentStatus['work'],
  ...extra,
});
const agent = (status: AgentStatus, extra: Partial<Agent> = {}) =>
  ({
    id: 'a',
    name: 'Ada',
    unread: 0,
    starters: ['x'],
    status,
    ...extra,
  }) as unknown as Agent;

describe('sameButProgress (what the Agents view re-renders for)', () => {
  it('ignores a working agent’s next step: activity, start and timeline', () => {
    expect(sameButProgress(agent(working(1)), agent(working(2)))).toBe(true);
  });

  it('counts a field read afresh from the Mac only when its value changed', () => {
    expect(
      sameButProgress(
        agent(working(1)),
        agent(working(1), { starters: ['x'] } as unknown as Partial<Agent>)
      )
    ).toBe(true);
    expect(
      sameButProgress(
        agent(working(1)),
        agent(working(1), { starters: ['y'] } as unknown as Partial<Agent>)
      )
    ).toBe(false);
  });

  it('counts starting or stopping, the room, the project and having an activity at all', () => {
    const idle: AgentStatus = { state: 'idle', activity: null, since: null };
    expect(sameButProgress(agent(working(1)), agent(idle))).toBe(false);
    expect(sameButProgress(agent(working(1)), agent(working(1, { room: 'r1' })))).toBe(false);
    const elsewhere = working(1);
    elsewhere.work = { ...elsewhere.work!, project: '/p/other' };
    expect(sameButProgress(agent(working(1)), agent(elsewhere))).toBe(false);
    expect(sameButProgress(agent(working(1)), agent(working(1, { activity: null })))).toBe(false);
  });

  it('counts everything else about the agent', () => {
    expect(sameButProgress(agent(working(1)), agent(working(1), { unread: 2 }))).toBe(false);
    expect(sameButProgress(agent(working(1)), agent(working(1), { name: 'Bea' }))).toBe(false);
  });
});
