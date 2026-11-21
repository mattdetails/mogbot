/**
 * The desk's Catch up (`components/agents/AgentsCatchUp.tsx`): what waits on
 * you, one decision at a time, in the order to go through it. Pure so the
 * rules are tested: requests oldest first (the longest anyone has been
 * stuck), then a turn that didn't finish; "Later" sends one to the back and
 * it comes back the next time you catch up (nothing is stored: what waits is
 * read again from the agents). The phone's Catch up is `mobile/src/lib/catchUp.ts`.
 *
 * @module lib/catchUpDesk
 */

import type { Agent, AgentMessage } from './agents';
import {
  CATCH_UP_ENTRY,
  catchUpDoneFrom,
  catchUpFromAgent,
  catchUpFromAgents,
  catchUpLeft,
  catchUpNeedYou,
} from '../../packages/companion-protocol/src/catchUpWords';

export interface CatchItem {
  key: string;
  agent: Agent;
  /** The request's card; absent for a turn that didn't finish. */
  message?: AgentMessage;
  /** For a turn that didn't finish: what it said when it stopped. */
  failure?: AgentMessage;
  ts: number;
}

export interface CatchGroup {
  agent: Agent;
  approvals: AgentMessage[];
  failure: AgentMessage | null;
}

/** A card this desk answers in place with Allow / Deny (the rest opens its chat). */
export function answersHere(m: AgentMessage | undefined): boolean {
  const a = m?.approval;
  if (!a || a.status !== 'pending') return false;
  return !(a.login || a.secret || a.prompt || a.connector || a.stepIn || a.crossover || a.front);
}

/**
 * The cards waiting in rooms (read from each room's thread, by the agent that
 * asked) added to that agent's group, each once, oldest first. A request made
 * in a room isn't in the agent's own chat, so without this the bell said
 * "1 needs you" while Catch up said "Needs you · 0".
 */
export function withRoomCards(
  groups: CatchGroup[],
  roomCards: Map<string, AgentMessage[]>
): CatchGroup[] {
  return groups.map((g) => {
    const cards = roomCards.get(g.agent.id);
    if (!cards?.length) return g;
    const known = new Set(g.approvals.map((m) => m.id));
    const approvals = [...g.approvals, ...cards.filter((m) => !known.has(m.id))].sort(
      (a, b) => a.ts - b.ts
    );
    return { ...g, approvals };
  });
}

/** Every item, oldest request first, then turns that didn't finish. */
export function catchItems(groups: CatchGroup[]): CatchItem[] {
  const asks: CatchItem[] = [];
  const failed: CatchItem[] = [];
  for (const g of groups) {
    for (const m of g.approvals) {
      if (m.approval?.status === 'pending') {
        asks.push({ key: m.id, agent: g.agent, message: m, ts: m.ts });
      }
    }
    if (g.failure && !g.approvals.some((m) => m.approval?.status === 'pending')) {
      failed.push({
        key: `failed:${g.agent.id}`,
        agent: g.agent,
        failure: g.failure,
        ts: g.failure.ts,
      });
    }
  }
  const byAge = (a: CatchItem, b: CatchItem) => a.ts - b.ts;
  return [...asks.sort(byAge), ...failed.sort(byAge)];
}

/** `items` with what was put off at the back, in the order it was put off. */
export function withLater(items: CatchItem[], later: string[]): CatchItem[] {
  const put = new Map(later.map((k, i) => [k, i]));
  const now = items.filter((i) => !put.has(i.key));
  const back = items
    .filter((i) => put.has(i.key))
    .sort((a, b) => put.get(a.key)! - put.get(b.key)!);
  return [...now, ...back];
}

/** What is left to decide this pass: everything not put off. */
export const leftCount = (items: CatchItem[], later: string[]): number =>
  items.filter((i) => !later.includes(i.key)).length;

/** What the entry's hero card says (spec-catchup-entry, option A). */
export interface EntryCard {
  state: 'many' | 'one' | 'midRun';
  /** "7 things need you", "1 thing needs you" or "4 left". */
  title: string;
  /** "From 6 agents", "<Agent>: <what>" or "3 done · from 4 agents". */
  sub: string;
  /** Start catching up, Review it or Continue. */
  action: string;
  /** The waiting agents, each once, in queue order: their keys. */
  agents: Agent[];
  /** Whether "Or pick one" lists the items (always, now; one item is a row too). */
  list: boolean;
  /** Mid-run: how far through, 0–1. */
  progress?: number;
}

/** The hero card for what waits; null when nothing does (the "All caught up" line). */
export function entryCard(items: CatchItem[], doneCount: number): EntryCard | null {
  if (items.length === 0) return null;
  const agents = [...new Map(items.map((i) => [i.agent.id, i.agent])).values()];
  if (doneCount > 0) {
    return {
      state: 'midRun',
      title: catchUpLeft(items.length),
      sub: catchUpDoneFrom(doneCount, agents.length),
      action: CATCH_UP_ENTRY.continue,
      agents,
      list: true,
      progress: doneCount / (doneCount + items.length),
    };
  }
  if (items.length === 1) {
    return {
      state: 'one',
      title: catchUpNeedYou(1),
      sub: catchUpFromAgent(items[0].agent.name),
      action: CATCH_UP_ENTRY.review,
      agents,
      // The one item is under the card too, as it is with more.
      list: true,
    };
  }
  return {
    state: 'many',
    title: catchUpNeedYou(items.length),
    sub: catchUpFromAgents(agents.length),
    action: CATCH_UP_ENTRY.start,
    agents,
    list: true,
  };
}
