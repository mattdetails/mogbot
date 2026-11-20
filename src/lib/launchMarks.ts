/**
 * Launch markers: three moments of a cold launch, logged once each through
 * the frontend logger (so they land in the app's log beside the backend's
 * own startup lines) and as Performance marks (so a trace shows them).
 *
 *   window-shown  the first frame after React mounted the window
 *   agents-list   the first frame with the agents list drawn with agents in it
 *   first-chat    the first frame with a chat's rows drawn
 *
 * Times are milliseconds since this page began loading (performance.now()),
 * which is after the process started: the backend's own markers cover the
 * part before the webview. Never estimated: a moment that doesn't happen
 * (a project window has no agents list) is simply not logged.
 */
import { logger } from './logger';

export type LaunchMark = 'window-shown' | 'agents-list' | 'first-chat';

const logged = new Set<LaunchMark>();

/** Log `name` now, once per page load. */
export function markLaunch(name: LaunchMark, now: () => number = () => performance.now()): void {
  if (logged.has(name)) return;
  logged.add(name);
  const ms = Math.round(now());
  try {
    performance.mark?.(`launch:${name}`);
  } catch {
    // A browser without User Timing: the log line is the record.
  }
  logger.info(`launch: ${name}`, { ms });
}

/** Log `name` once the frame now being built has been painted. */
export function markLaunchAfterPaint(name: LaunchMark): void {
  if (logged.has(name)) return;
  requestAnimationFrame(() => setTimeout(() => markLaunch(name), 0));
}

/** Tests only. */
export function resetLaunchMarks(): void {
  logged.clear();
}
