/**
 * Side by side: Agents on the left, the project side (its terminals, or the
 * project list) on the right, in one window. Per window, kept in this
 * window's storage: whether it is on, and where the divider sits (the
 * agents' share of the width).
 *
 * While it is on, the project side shows terminals only (Focus), never the
 * preview or the code: a chat beside them is the point, and a preview beside
 * a chat is too narrow to use.
 *
 * @module lib/sideBySide
 */

import { useSyncExternalStore } from 'react';

const KEY = 'shipstudio.sideBySide';

/** The agents' share of the width: never so narrow either half can't be used. */
export const MIN_SHARE = 0.25;
export const MAX_SHARE = 0.75;
export const DEFAULT_SHARE = 0.5;

export interface SideBySide {
  on: boolean;
  /** The agents' share of the window's width, 0.25–0.75. */
  share: number;
}

export function clampShare(share: number): number {
  if (!Number.isFinite(share)) return DEFAULT_SHARE;
  return Math.min(MAX_SHARE, Math.max(MIN_SHARE, share));
}

export function parseSideBySide(raw: string | null): SideBySide {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<SideBySide>) : {};
    return {
      on: value.on === true,
      share: clampShare(typeof value.share === 'number' ? value.share : DEFAULT_SHARE),
    };
  } catch {
    return { on: false, share: DEFAULT_SHARE };
  }
}

function read(): SideBySide {
  try {
    return parseSideBySide(localStorage.getItem(KEY));
  } catch {
    return { on: false, share: DEFAULT_SHARE };
  }
}

let current: SideBySide = read();
const listeners = new Set<() => void>();

function save(next: SideBySide) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* a per-window convenience: it lasts this window */
  }
  listeners.forEach((l) => l());
}

export function setSideBySide(on: boolean) {
  if (on !== current.on) save({ ...current, on });
}

export function toggleSideBySide() {
  save({ ...current, on: !current.on });
}

/** Where the divider sits; `persist` false while dragging, true when let go. */
export function setSideBySideShare(share: number, persist = true) {
  const next = { ...current, share: clampShare(share) };
  if (persist) save(next);
  else {
    current = next;
    listeners.forEach((l) => l());
  }
}

export function getSideBySide(): SideBySide {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSideBySide(): SideBySide {
  return useSyncExternalStore(subscribe, () => current);
}
