/**
 * How long the window takes to come back once it is shown again, in the
 * log (`[Timing] window shown`): how long it was away, how long until its
 * first frame, how many of the Mac's events it took in the first second,
 * and the overview reads that landed meanwhile, as the window waited for
 * them (the Mac's half is `src-tauri/src/timing.rs`). An overview read the
 * window waited on for longer than {@link SLOW_OVERVIEW_MS} is logged too.
 */
import { logger } from './logger';

export const SLOW_OVERVIEW_MS = 250;

let events = 0;
let overviews: number[] = [];
let hiddenAt: number | null = null;
let watching = false;

/** One of the Mac's agent events arrived. */
export function countEvent() {
  events += 1;
}

/** An overview read took `ms`, from asking to its answer in the window. */
export function noteOverview(ms: number) {
  overviews.push(Math.round(ms));
  if (overviews.length > 20) overviews = overviews.slice(-20);
  if (ms >= SLOW_OVERVIEW_MS) logger.info('[Timing] slow overview in the window', { ms: Math.round(ms) });
}

/** Start watching the window being hidden and shown (once). */
export function watchShown(doc: Document = document) {
  if (watching) return;
  watching = true;
  doc.addEventListener('visibilitychange', () => {
    const now = performance.now();
    if (doc.hidden) {
      hiddenAt = now;
      return;
    }
    const awayMs = hiddenAt === null ? null : now - hiddenAt;
    hiddenAt = null;
    const eventsBefore = events;
    overviews = [];
    requestAnimationFrame(() => {
      const firstFrameMs = performance.now() - now;
      setTimeout(() => {
        logger.info('[Timing] window shown', {
          awayS: awayMs === null ? null : Math.round(awayMs / 1000),
          firstFrameMs: Math.round(firstFrameMs),
          eventsFirstSecond: events - eventsBefore,
          overviewMs: overviews,
        });
      }, 1000);
    });
  });
}
