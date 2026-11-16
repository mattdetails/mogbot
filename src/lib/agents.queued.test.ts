import { describe, expect, it } from 'vitest';
import { isHanded, isHeard, isQueued, type AgentMessage, type AgentTurn } from './agents';

const mine = (id: string, ts: number): AgentMessage => ({
  id,
  agentId: 'a',
  ts,
  kind: 'user',
  text: 'also check the docs',
});

describe('your messages while it works', () => {
  const turn: AgentTurn = {
    status: { state: 'working', since: 100 },
    handed: ['m2'],
    heard: ['m3'],
  };

  it('handed to the turn: still queued, but it reads it at its next step', () => {
    expect(isQueued(mine('m2', 200), turn)).toBe(true);
    expect(isHanded(mine('m2', 200), turn)).toBe(true);
  });

  it('read mid-turn: part of this turn, not queued', () => {
    expect(isQueued(mine('m3', 300), turn)).toBe(false);
    expect(isHeard(mine('m3', 300), turn)).toBe(true);
  });

  it('an engine that takes nothing mid-turn: queued as before', () => {
    expect(isQueued(mine('m4', 400), { status: { state: 'working', since: 100 } })).toBe(true);
    expect(isHanded(mine('m4', 400), { status: { state: 'working', since: 100 } })).toBe(false);
  });
});
