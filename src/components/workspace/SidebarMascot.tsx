/**
 * The app's mark as a small mascot, in the sidebar's top row where the
 * traffic lights sit. It shows only in full screen, when macOS hides them and
 * their space would otherwise stand empty (a normal window keeps the lights
 * there). Drawn from boxes, not artwork, so it can move: the mark's two slots
 * are its eyes, and its body tilts toward the pointer like a lit keycap.
 *
 * Its mood follows the team: it blinks and glances around while all is
 * quiet, watches side to side while agents work, and looks toward the bell
 * and hops when one needs you. Left alone with nothing going on it falls
 * asleep, and the pointer coming back wakes it.
 *
 * It plays, too: its eyes follow the pointer, it smiles when pointed at,
 * squishes while pressed, jumps and spins when clicked, and gets dizzy if
 * poked again and again. Decorative only: the bell says what waits, so the
 * mascot is hidden from screen readers and takes no focus. Still for reduced
 * motion (it still sleeps and smiles, without moving).
 */

import { useEffect, useRef, useState } from 'react';
import { needsYou, type Agent } from '../../lib/agents';
import { useAgentsSelector } from '../../lib/agentsStore';
import { useWindowFullscreen } from '../../hooks/useWindowFullscreen';

export type MascotMood = 'idle' | 'working' | 'needs-you';

/** What it is doing right now, on top of its mood. */
export type MascotState = 'awake' | 'sleep' | 'waking' | 'happy' | 'held' | 'poked' | 'dizzy';

/** What the team is up to, as the mascot shows it. Hidden agents don't count. */
export function mascotMoodOf(agents: Agent[]): MascotMood {
  const shown = agents.filter((a) => !a.hidden);
  if (shown.some(needsYou)) return 'needs-you';
  if (shown.some((a) => a.status.state === 'working')) return 'working';
  return 'idle';
}

/** Quiet this long, with nothing working or waiting, and it nods off. */
export const MASCOT_SLEEP_AFTER_MS = 90_000;
/** Pokes inside this window that make it dizzy. */
export const MASCOT_DIZZY_POKES = 4;
const POKE_WINDOW_MS = 1_600;
const POKE_MS = 700;
const DIZZY_MS = 2_400;
const WAKING_MS = 700;
/** After the pointer last moved, how long the eyes keep following it. */
const TRACK_MS = 2_500;
/** How far (px) from the mascot the pointer has to be for a full look. */
const LOOK_REACH_X = 160;
const LOOK_REACH_Y = 90;

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

/** Where the eyes point, -1…1 each way, for a pointer at (x, y). */
export function lookToward(
  center: { x: number; y: number },
  pointer: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: clamp((pointer.x - center.x) / LOOK_REACH_X),
    y: clamp((pointer.y - center.y) / LOOK_REACH_Y),
  };
}

/**
 * Whether a poke at `now` makes it dizzy, given the times of the pokes
 * before it; returns the pokes still inside the window, this one included.
 */
export function pokesAfter(previous: number[], now: number): { pokes: number[]; dizzy: boolean } {
  const pokes = [...previous.filter((t) => now - t < POKE_WINDOW_MS), now];
  return { pokes, dizzy: pokes.length >= MASCOT_DIZZY_POKES };
}

const selectMood = (s: { agents: Agent[] }) => mascotMoodOf(s.agents);

export function SidebarMascotFace({
  mood,
  state = 'awake',
  rootRef,
}: {
  mood: MascotMood;
  state?: MascotState;
  rootRef?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <span
      ref={rootRef}
      className="sidebar-mascot"
      data-mood={mood}
      data-state={state}
      aria-hidden="true"
    >
      <span className="sidebar-mascot__shadow" />
      <span className="sidebar-mascot__hop">
        <span className="sidebar-mascot__body">
          <span className="sidebar-mascot__eyes">
            <span className="sidebar-mascot__eye" />
            <span className="sidebar-mascot__eye sidebar-mascot__eye--right" />
          </span>
          <span className="sidebar-mascot__cheek" />
          <span className="sidebar-mascot__cheek sidebar-mascot__cheek--right" />
        </span>
      </span>
      <span className="sidebar-mascot__zzz">
        <span>z</span>
        <span>z</span>
        <span>z</span>
      </span>
    </span>
  );
}

/** The mascot alive: a mood from outside, everything else its own. */
export function PlayfulMascot({ mood }: { mood: MascotMood }) {
  const [state, setState] = useState<MascotState>('awake');
  const root = useRef<HTMLSpanElement>(null);
  const stateRef = useRef(state);
  const moodRef = useRef(mood);
  const hovered = useRef(false);
  useEffect(() => {
    stateRef.current = state;
    moodRef.current = mood;
  }, [state, mood]);

  // A team that needs you or is working wakes it (adjusted during render,
  // when the mood changes, rather than in an effect).
  const [seenMood, setSeenMood] = useState(mood);
  if (mood !== seenMood) {
    setSeenMood(mood);
    if (mood !== 'idle' && state === 'sleep') setState('waking');
  }

  // One timer per passing state (waking, poked, dizzy) back to awake.
  useEffect(() => {
    const ms =
      state === 'waking'
        ? WAKING_MS
        : state === 'poked'
          ? POKE_MS
          : state === 'dizzy'
            ? DIZZY_MS
            : 0;
    if (!ms) return;
    const settle = hovered.current ? 'happy' : 'awake';
    const t = window.setTimeout(() => setState((s) => (s === state ? settle : s)), ms);
    return () => window.clearTimeout(t);
  }, [state]);

  // Eyes on the pointer, the sleep timer, and the pokes. Listeners on the
  // element through the ref: it is decorative, never a control.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    let trackUntil = 0;
    let trackTimer = 0;
    let sleepTimer = 0;
    let pokes: number[] = [];

    const armSleep = () => {
      window.clearTimeout(sleepTimer);
      sleepTimer = window.setTimeout(() => {
        if (moodRef.current === 'idle' && stateRef.current === 'awake') setState('sleep');
      }, MASCOT_SLEEP_AFTER_MS);
    };

    const paint = () => {
      frame = 0;
      if (!pointer) return;
      const box = el.getBoundingClientRect();
      const look = lookToward(
        { x: box.left + box.width / 2, y: box.top + box.height / 2 },
        pointer
      );
      el.style.setProperty('--sidebar-mascot-look-x', look.x.toFixed(3));
      el.style.setProperty('--sidebar-mascot-look-y', look.y.toFixed(3));
    };

    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (!frame) frame = window.requestAnimationFrame(paint);
      const now = Date.now();
      if (now > trackUntil - TRACK_MS + 250) {
        // Re-arm at most a few times a second, not on every move.
        trackUntil = now + TRACK_MS;
        el.dataset.tracking = 'true';
        window.clearTimeout(trackTimer);
        trackTimer = window.setTimeout(() => {
          delete el.dataset.tracking;
          el.style.removeProperty('--sidebar-mascot-look-x');
          el.style.removeProperty('--sidebar-mascot-look-y');
        }, TRACK_MS);
        armSleep();
        if (stateRef.current === 'sleep') setState('waking');
      }
    };

    const onEnter = () => {
      hovered.current = true;
      setState((s) => (s === 'awake' || s === 'sleep' || s === 'waking' ? 'happy' : s));
    };
    const onLeave = () => {
      hovered.current = false;
      setState((s) => (s === 'happy' || s === 'held' ? 'awake' : s));
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault(); // no window drag from the mascot
      setState('held');
    };
    const onUp = () => {
      const { pokes: next, dizzy } = pokesAfter(pokes, Date.now());
      pokes = dizzy ? [] : next;
      setState(dizzy ? 'dizzy' : 'poked');
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    armSleep();
    return () => {
      window.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(trackTimer);
      window.clearTimeout(sleepTimer);
    };
  }, []);

  return <SidebarMascotFace mood={mood} state={state} rootRef={root} />;
}

function LiveMascot() {
  return <PlayfulMascot mood={useAgentsSelector(selectMood)} />;
}

/** Only in full screen; nothing is subscribed, listened to or animated otherwise. */
export function SidebarMascot() {
  return useWindowFullscreen() ? <LiveMascot /> : null;
}
