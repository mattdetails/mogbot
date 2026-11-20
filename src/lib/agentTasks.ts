/**
 * Each agent's own task list (`agents/tasks.rs`): the asks the app is keeping
 * so none drops, who is overloaded and what is stuck. Read-only on the desk;
 * agents change their lists themselves with the `tasks` tool.
 *
 * @module lib/agentTasks
 */

import { invoke } from '@tauri-apps/api/core';

export type TaskState = 'doing' | 'next' | 'waiting' | 'stuck' | 'done' | 'dropped';

export interface AgentTask {
  id: string;
  title: string;
  source: 'user' | 'agent' | 'own' | 'assigned';
  from?: { id: string; name: string };
  state: TaskState;
  createdAt: number;
  updatedAt: number;
  waitingOn?: string;
  note?: string;
  chased: number;
}

export interface AgentLoad {
  agentId: string;
  name: string;
  role: string;
  /** What it is doing this moment, or null. */
  doing: string | null;
  open: AgentTask[];
  recent: AgentTask[];
  overloaded: boolean;
  overloadedWhy: string | null;
  stuck: number;
}

export const getTaskBoard = () => invoke<AgentLoad[]>('agents_task_board');

/** "5m", "3h", "2d": how long an ask has been open. */
export function taskAge(createdAt: number, now: number = Date.now()): string {
  const m = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/** Agents with something open, overloaded and stuck first. */
export function withOpenAsks(loads: AgentLoad[]): AgentLoad[] {
  return loads
    .filter((l) => l.open.length > 0)
    .sort(
      (a, b) =>
        Number(b.overloaded) - Number(a.overloaded) ||
        b.stuck - a.stuck ||
        b.open.length - a.open.length
    );
}

/** The row's line: the first ask, then how many more. */
export function asksLine(load: AgentLoad): string {
  const first = load.open[0]?.title ?? '';
  const more = load.open.length - 1;
  return more > 0 ? `${first} · +${more} more` : first;
}
