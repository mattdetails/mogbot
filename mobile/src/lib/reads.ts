/**
 * How the phone asks the Mac things, so a busy phone never piles onto it
 * (docs/mobile.md, "Requests the phone makes"). Every request goes through
 * here (`session.call`):
 *
 * - **One of each read at a time.** A read that's already on its way
 *   (`READ_ONLY_METHODS`, same params) answers the second asker too: two
 *   screens, or a tap back and forth, are one request.
 * - **Never a burst.** At most `READ_SLOTS` reads are at the Mac at once;
 *   the rest wait their turn, except a `first` read (the chat on screen), which
 *   goes ahead of the ones waiting. Changes never wait.
 * - **Background last.** A `background` read (a chat read ahead for Catch up
 *   or a row's "Needs your OK") goes only when nothing else waits, at most
 *   `BACKGROUND_SLOTS` at once: over the relay the replies come back one
 *   after another, and ten 40 KB pages asked on reconnecting held what the
 *   screen was waiting for 2.5-4 s behind them (Julian's trail, 21 Nov).
 *   Asked for by a screen meanwhile, it moves up and counts as one.
 * - **Remembered.** The last answer to each read is kept for this Mac:
 *   a screen opening draws it from its first frame (`last`), and one that
 *   wants it no older than a few seconds is answered from it (`fresh`). Any
 *   change (other than where the phone is looking) makes every kept answer
 *   old, so the next fresh read asks again.
 *
 * Pure apart from the clock, so it's tested without a socket.
 */

import { READ_ONLY_METHODS, type MethodName } from '@shipstudio/companion-protocol';

/** At most this many reads at the Mac at once. */
export const READ_SLOTS = 6;
/** Of those, at most this many `background` reads. */
export const BACKGROUND_SLOTS = 2;

/** Changes that move no reading: where the phone is looking, and a dictation written out again. */
const NEUTRAL = new Set<string>(['agents.focus', 'rooms.focus', 'dictation.transcribe']);
const READS = new Set<string>(READ_ONLY_METHODS);

export const isRead = (method: MethodName) => READS.has(method);

export interface CallOptions {
  /** Goes ahead of the reads waiting for a slot (what the user is looking at). */
  first?: boolean;
  /** Read ahead, nobody waiting on it: goes after every other read (`BACKGROUND_SLOTS`). */
  background?: boolean;
}

export interface Reads {
  /** `request` for a change; shared, queued and remembered for a read. */
  call<T>(
    method: MethodName,
    params: unknown,
    request: () => Promise<T>,
    opts?: CallOptions
  ): Promise<T>;
  /** The last answer, when it is under `maxAgeMs` old and nothing changed since; else `call`. */
  fresh<T>(
    method: MethodName,
    params: unknown,
    maxAgeMs: number,
    request: () => Promise<T>
  ): Promise<T>;
  /** The last answer to this read, however old; undefined when it hasn't been read. */
  last<T>(method: MethodName, params: unknown): T | undefined;
  /** Another Mac: nothing read for the last one is kept, nor kept when it lands. */
  forget(): void;
}

export function createReads(now: () => number = Date.now, slots = READ_SLOTS): Reads {
  const inflight = new Map<string, Promise<unknown>>();
  const kept = new Map<string, { at: number; value: unknown }>();
  /** Waiting for a slot: started with whether it still counts as background. */
  type Waiting = { go: (background: boolean) => void; key: string };
  const queue: Waiting[] = [];
  /** Background reads waiting: they go only when `queue` is empty. */
  const later: Waiting[] = [];
  let running = 0;
  let runningLater = 0;
  let epoch = 0;
  const keyOf = (method: MethodName, params: unknown) => `${method} ${JSON.stringify(params)}`;

  /** A slot came free: the next read waiting, else a background one if there's room. */
  function next() {
    if (running >= slots) return;
    const waiting = queue.shift();
    if (waiting) waiting.go(false);
    else if (runningLater < BACKGROUND_SLOTS) later.shift()?.go(true);
  }

  function slot<T>(
    run: () => Promise<T>,
    key: string,
    first: boolean,
    background: boolean
  ): Promise<T> {
    const start = (asBackground: boolean): Promise<T> => {
      running++;
      if (asBackground) runningLater++;
      const done = () => {
        running--;
        if (asBackground) runningLater--;
        next();
      };
      let out: Promise<T>;
      try {
        out = run();
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- passes on whatever the call threw, unchanged
        out = Promise.reject(e);
      }
      return out.finally(done);
    };
    if (background) {
      if (running < slots && !queue.length && runningLater < BACKGROUND_SLOTS) return start(true);
      return new Promise<boolean>((go) => later.push({ go, key })).then(start);
    }
    if (running < slots) return start(false);
    return new Promise<boolean>((go) => {
      if (first) queue.unshift({ go, key });
      else queue.push({ go, key });
    }).then(start);
  }

  /** A background read a screen now wants: out of `later`, into the queue (or started). */
  function promote(key: string, first: boolean) {
    const at = later.findIndex((q) => q.key === key);
    if (at < 0) return;
    const [waiting] = later.splice(at, 1);
    if (running < slots) waiting.go(false);
    else if (first) queue.unshift(waiting);
    else queue.push(waiting);
  }

  function call<T>(
    method: MethodName,
    params: unknown,
    request: () => Promise<T>,
    opts: CallOptions = {}
  ): Promise<T> {
    if (!READS.has(method)) {
      // A change may move any reading: the next fresh read asks again.
      if (!NEUTRAL.has(method)) for (const r of kept.values()) r.at = 0;
      return request();
    }
    const key = keyOf(method, params);
    const already = inflight.get(key);
    if (already) {
      // The same read, still waiting for a slot, is wanted first now.
      const at = opts.first ? queue.findIndex((q) => q.key === key) : -1;
      if (at > 0) queue.unshift(...queue.splice(at, 1));
      // Read ahead in the background, and now a screen is waiting on it.
      if (!opts.background) promote(key, !!opts.first);
      return already as Promise<T>;
    }
    const asked = epoch;
    const run: Promise<T> = slot(request, key, !!opts.first, !!opts.background && !opts.first)
      .then((value) => {
        if (asked === epoch) kept.set(key, { at: now(), value });
        return value;
      })
      .finally(() => {
        if (inflight.get(key) === run) inflight.delete(key);
      });
    inflight.set(key, run);
    return run;
  }

  return {
    call,
    fresh(method, params, maxAgeMs, request) {
      const held = kept.get(keyOf(method, params));
      if (held && held.at > 0 && now() - held.at < maxAgeMs) {
        return Promise.resolve(held.value as never);
      }
      return call(method, params, request);
    },
    last: (method, params) => kept.get(keyOf(method, params))?.value as never,
    forget() {
      epoch++;
      kept.clear();
      inflight.clear();
    },
  };
}
