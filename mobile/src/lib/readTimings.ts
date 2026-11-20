/**
 * What the link's trail says about the first moments after a welcome: when the
 * snapshot and "caught up" came, how long the first reads took, and any read
 * that took over a second. The trail goes to the Mac with the next hello
 * (`transport.recentTrail`), so a "stuck" moment on the phone carries its own
 * numbers. Pure apart from the clock, so it's tested without a socket.
 */

/** Reads timed after each welcome, however fast. */
export const TIMED_FIRST = 10;
/** A read slower than this is always noted. */
export const SLOW_READ_MS = 1000;

export interface ReadTimings {
  /** A new welcome: the clock and the first-reads count start over. */
  welcomed(): void;
  /** A frame the Mac sent unasked (`snapshot`, `caught up`), timed from the welcome. */
  frame(what: string): void;
  /** Runs a read, noting how long it took (and how long after the welcome it was asked). */
  read<T>(method: string, run: () => Promise<T>): Promise<T>;
}

export function createReadTimings(
  note: (what: string) => void,
  now: () => number = Date.now
): ReadTimings {
  let welcomedAt = 0;
  let timed = 0;
  return {
    welcomed() {
      welcomedAt = now();
      timed = 0;
    },
    frame(what) {
      if (welcomedAt) note(`${what} +${now() - welcomedAt}ms after welcome`);
    },
    read(method, run) {
      const asked = now();
      const first = welcomedAt > 0 && timed < TIMED_FIRST;
      if (first) timed++;
      const done = (outcome: string) => {
        const took = now() - asked;
        if (first || took >= SLOW_READ_MS) {
          const since = welcomedAt ? `, ${asked - welcomedAt}ms after welcome` : '';
          note(`read ${method} ${outcome} in ${took}ms${since}`);
        }
      };
      return run().then(
        (v) => {
          done('answered');
          return v;
        },
        (e: unknown) => {
          done('failed');
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- passes on whatever the read threw, unchanged
          throw e;
        }
      );
    },
  };
}
