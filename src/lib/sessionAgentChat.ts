/**
 * Which agent's conversation the workspace's Session panel shows, per
 * project, in place of a terminal. Clicking an agent in a project's sidebar
 * (one bound to it, or one at work in it) opens its chat right there, so
 * someone who works in a project only through agents never needs a terminal;
 * clicking a session or terminal row goes back to the terminals, which keep
 * running underneath.
 *
 * Opening a project picks one by itself (`lib/projectOpens`, `openingFor`):
 * the agent it opened on last, an agent working there, or [`PICK_AGENT`], the
 * screen asking who should work on it. Once anything was shown for a project
 * this session, that stays until the user changes it.
 *
 * @module lib/sessionAgentChat
 */

import { useSyncExternalStore } from 'react';

/** Instead of an agent's id: ask who should work on the project. */
export const PICK_AGENT = ':pick';

let shown = new Map<string, string>();
/** Projects something was shown for this session (terminals included). */
let decided = new Set<string>();
const listeners = new Set<() => void>();

/** Show `agentId`'s chat in `projectPath`'s Session panel, or the terminals again (null). */
export function showAgentInSession(projectPath: string, agentId: string | null) {
  decided.add(projectPath);
  if ((shown.get(projectPath) ?? null) === agentId) return;
  const next = new Map(shown);
  if (agentId) next.set(projectPath, agentId);
  else next.delete(projectPath);
  shown = next;
  for (const l of listeners) l();
}

/** Whether this project's Session panel was set this session (so opening it again leaves it). */
export const sessionDecided = (projectPath: string) => decided.has(projectPath);

/** The agent whose chat the Session panel shows for this project, if any. */
export function sessionAgentOf(projectPath: string | null | undefined): string | null {
  return projectPath ? (shown.get(projectPath) ?? null) : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSessionAgent(projectPath: string | null | undefined): string | null {
  return useSyncExternalStore(
    subscribe,
    () => sessionAgentOf(projectPath),
    () => sessionAgentOf(projectPath)
  );
}

/** Tests only. */
export function __resetSessionAgents() {
  shown = new Map();
  decided = new Set();
  for (const l of listeners) l();
}
