/**
 * Terminal only: a project shows its terminals and nothing else. No preview,
 * no Code or Branches view, no preview tools, no screenshot buttons.
 *
 * It saves memory, not just room. The preview pane is unmounted, not hidden,
 * so its frame (a whole page, with its own web content process), its editor
 * and inspector hooks and its agent-bridge listener all go away. Agents asking
 * for the preview get "preview isn't active" straight away. The dev server is
 * left as Focus mode leaves it: it keeps running unless Settings says to stop
 * servers that aren't on screen.
 *
 * Remembered per project, like the panel layout and the Focus split
 * (lib/workspaceLayoutStore): a backend or an agent-only repo wants it every
 * time, and a site you're designing wants its preview every time. It sits on
 * top of the project's own Focus/Preview state without changing it, so
 * turning it off brings back exactly what was there.
 *
 * @module lib/terminalOnly
 */

import { useSyncExternalStore } from 'react';

export const TERMINAL_ONLY_KEY = 'shipstudio.terminalOnly';

/** The saved list, tolerant of anything a hand edit or an old build left. */
export function parseTerminalOnly(raw: string | null): Set<string> {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
    );
  } catch {
    return new Set();
  }
}

function read(): Set<string> {
  try {
    return parseTerminalOnly(localStorage.getItem(TERMINAL_ONLY_KEY));
  } catch {
    return new Set();
  }
}

let current: Set<string> = read();
const listeners = new Set<() => void>();

function save(next: Set<string>) {
  current = next;
  try {
    localStorage.setItem(TERMINAL_ONLY_KEY, JSON.stringify([...next]));
  } catch {
    /* lasts this session */
  }
  listeners.forEach((l) => l());
}

export function isTerminalOnly(projectPath: string | null | undefined): boolean {
  return !!projectPath && current.has(projectPath);
}

export function setTerminalOnly(projectPath: string, on: boolean) {
  if (on === current.has(projectPath)) return;
  const next = new Set(current);
  if (on) next.add(projectPath);
  else next.delete(projectPath);
  save(next);
}

export function toggleTerminalOnly(projectPath: string) {
  setTerminalOnly(projectPath, !current.has(projectPath));
}

/** Re-read storage (tests, and a harness scenario seeding it before boot). */
export function reloadTerminalOnly() {
  current = read();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTerminalOnly(projectPath: string | null | undefined): boolean {
  return useSyncExternalStore(subscribe, () => isTerminalOnly(projectPath));
}
