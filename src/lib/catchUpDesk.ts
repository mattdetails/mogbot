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
