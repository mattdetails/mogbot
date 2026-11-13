/**
 * Home's order, calm: the Chief of Staff first, always; then pinned agents;
 * then the rest, what needs you before what doesn't, most recent first.
 * Agents still being set up after an import are quiet: their logins and
 * hellos are the setup checklist's, in the Chief's chat, as on the desk.
 *
 * No bar for what waits on you: that is said once, by the Catch up tab's
 * count, and acted on there (docs/agents.md, "Needs you: one place per
 * surface"). A waiting agent's row keeps its own label (its pill), as the
 * desk sidebar's does.
 */

import { agentNeedsYou, setupHold } from '@shipstudio/companion-protocol';
import type { Agent, AgentFolders, TeamSetupView } from '@shipstudio/companion-protocol';
import { shows } from './teamSetup';

export interface Home {
  chief: Agent | null;
  pinned: Agent[];
  rest: Agent[];
  hidden: Agent[];
  /** Agents being set up: their rows say so quietly. */
  quiet: Set<string>;
}

/**
 * Agents the checklist covers that haven't been met yet (the desk's
 * `quietAgentIds`): their requests and failures are the checklist's.
 */
export function quietAgentIds(v: TeamSetupView | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!shows(v) || v.complete) return ids;
  for (const a of v.steps.find((s) => s.id === 'hello')?.agents ?? []) {
    if (a.state === 'quiet') ids.add(a.agentId);
  }
  return ids;
}

const recent = (a: Agent, b: Agent) => b.lastActivityAt - a.lastActivityAt;

export function buildHome(agents: Agent[], setup: TeamSetupView | null | undefined): Home {
  const quiet = quietAgentIds(setup);
  const visible = agents.filter((a) => !a.hidden);
  const hidden = agents.filter((a) => a.hidden).sort(recent);
  const chief = visible.find((a) => a.isMain) ?? null;
  const others = visible.filter((a) => a !== chief);
  // The one rule every "needs you" uses (desk sidebar, review bar, Dock).
  const hold = setupHold(setup);
  const loud = (a: Agent) => agentNeedsYou(a, hold);
  const pinned = others.filter((a) => a.pinned).sort(recent);
  const rest = others
    .filter((a) => !a.pinned)
    .sort((a, b) => Number(loud(b)) - Number(loud(a)) || recent(a, b));
  return { chief, pinned, rest, hidden, quiet };
}

/** A run of rows under one label (none: straight under the Chief). */
export interface HomeSection {
  key: string;
  title: string | null;
  agents: Agent[];
}

/**
 * Home's agents after the Chief, in the folders made on the Mac (the desk
 * sidebar's): pinned ones above the folders, or first in their own, as the
 * Mac says; each folder in its order, empty ones left out (there's nothing to
 * drop into here); then "Not in a folder". With no folders, one untitled run,
 * pinned first, exactly as before folders.
 */
export function homeSections(home: Home, view: AgentFolders | null | undefined): HomeSection[] {
  const folders = view?.folders ?? [];
  if (folders.length === 0) {
    return [{ key: 'agents', title: null, agents: [...home.pinned, ...home.rest] }];
  }
  const atTop = (view?.pinned ?? 'top') === 'top';
  const known = new Set(folders.map((f) => f.id));
  const filed = atTop ? home.rest : [...home.pinned, ...home.rest];
  const out: HomeSection[] = [];
  if (atTop && home.pinned.length > 0) {
    out.push({ key: 'pinned', title: 'Pinned', agents: home.pinned });
  }
  for (const folder of folders) {
    const agents = filed.filter((a) => a.folder === folder.id);
    if (agents.length > 0) out.push({ key: `folder:${folder.id}`, title: folder.name, agents });
  }
  const loose = filed.filter((a) => !a.folder || !known.has(a.folder));
  if (loose.length > 0) out.push({ key: 'loose', title: 'Not in a folder', agents: loose });
  return out;
}

/** "Setting up your team", as Catch up and One at a time both say it. */
export const SETUP_TITLE = 'Finish setting up your team';
