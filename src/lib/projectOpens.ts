/**
 * What a project opens on: an agent's chat, or a terminal. Opening a project
 * shows the chat of the agent it last opened on, else the first agent working
 * there, else asks who should work on it (`ProjectAgentPicker`), with "Use a
 * terminal" for someone who'd rather type commands. A terminal pick can be
 * kept for next time; the choice lives on this Mac only (per viewer, like a
 * remembered tab), so losing it only means being asked again.
 *
 * @module lib/projectOpens
 */

import type { Agent } from './agents';
import { sameFolder } from '../../packages/companion-protocol/src/work';

export type ProjectOpen = { kind: 'agent'; agentId: string } | { kind: 'terminal'; engine: string };

const KEY = 'mogbot.projectOpens';

function readAll(): Record<string, ProjectOpen> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ProjectOpen>) : {};
  } catch {
    return {};
  }
}

/** What `projectPath` opened on last (an agent) or was told to open on (a terminal). */
export function savedOpen(projectPath: string): ProjectOpen | null {
  const v = readAll()[projectPath];
  if (!v || typeof v !== 'object') return null;
  if (v.kind === 'agent' && typeof v.agentId === 'string') return v;
  if (v.kind === 'terminal' && typeof v.engine === 'string') return v;
  return null;
}

export function saveOpen(projectPath: string, open: ProjectOpen | null) {
  try {
    const all = readAll();
    if (open) all[projectPath] = open;
    else delete all[projectPath];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not kept: it asks again next time.
  }
}

/** Every project the agent works on: its own, then its other conversations'. */
export function agentProjects(agent: Pick<Agent, 'project' | 'conversations'>): string[] {
  const all = agent.project ? [agent.project] : [];
  for (const p of Object.values(agent.conversations?.projects ?? {})) {
    if (!all.some((q) => sameFolder(q, p))) all.push(p);
  }
  return all;
}

/** Whether the agent works on this project (bound, or one of its conversations is there). */
export const worksIn = (agent: Pick<Agent, 'project' | 'conversations'>, projectPath: string) =>
  agentProjects(agent).some((p) => sameFolder(p, projectPath));

/**
 * The agent whose chat a project opens on, `'pick'` to ask who should work
 * on it, or null for its terminals.
 * `agents` are the user's agents (the Chief is never one a project opens on).
 */
export function openingFor(
  projectPath: string,
  agents: Pick<Agent, 'id' | 'hidden' | 'isMain' | 'project' | 'conversations'>[]
): string | null {
  const saved = savedOpen(projectPath);
  if (saved?.kind === 'terminal') return null;
  const usable = agents.filter((a) => !a.isMain && !a.hidden);
  if (saved?.kind === 'agent' && usable.some((a) => a.id === saved.agentId)) return saved.agentId;
  const here = usable.find((a) => worksIn(a, projectPath));
  return here ? here.id : 'pick';
}
