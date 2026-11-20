/**
 * The motion system, one set of numbers for desk and phone (docs/MOTION.md).
 *
 * The desk mirrors these as CSS custom properties in
 * src/styles/global/tokens-core.css (`--duration-*`, `--ease-*`, `--spring-*`);
 * `src/lib/motionTokens.test.ts` fails if the two drift. The phone reads them
 * from here directly (`mobile/src/lib/motion.ts` turns them into Reanimated
 * configs). Never write a duration, curve or spring anywhere else.
 */

/** Milliseconds. Exits are shorter than entrances: leaving should never hold you up. */
export const MOTION_DURATION = {
  /** A press acknowledged (scale/opacity down). */
  press: 70,
  /** Hover, colour, border, a tooltip leaving. */
  micro: 100,
  /** Small things changing in place: a toggle, a chip, a swap of text. */
  quick: 150,
  /** Something arriving at its place: a message, a card, a menu, a popover, a toast. */
  arrive: 200,
  /** Something larger arriving: a modal, a sheet, a screen, a panel. */
  screen: 300,
  /** Menus, popovers and toasts leaving. */
  exitQuick: 120,
  /** Modals, sheets and screens leaving. */
  exitScreen: 200,
  /** Reduce Motion: long enough that transitionend/animationend still fire. */
  reduced: 0.01,
} as const;

/** cubic-bezier control points. */
export const MOTION_EASE = {
  /** Arriving: fast start, long soft landing. Every entrance. */
  arrive: [0.16, 1, 0.3, 1],
  /** Leaving: picks up speed, gone. Every exit. */
  exit: [0.4, 0, 1, 1],
  /** Moving between two on-screen places: a reorder, a resize, a tab indicator. */
  move: [0.2, 0, 0, 1],
  /** A press going down. */
  press: [0.3, 0.7, 0.4, 1],
  /** Colour and opacity changes with no travel. */
  standard: [0.25, 0.1, 0.25, 1],
} as const;

/**
 * Springs, as perceived duration and damping ratio (Reanimated 4's
 * `withSpring({ duration, dampingRatio })`; the desk renders the same curve
 * with CSS `linear()` easings generated from these, see `springEasing`).
 * 1 = no overshoot. Below 1 only where something is thrown or celebrated.
 */
export const MOTION_SPRING = {
  /** Presses releasing, toggles, chips, the send button. */
  snappy: { duration: 250, dampingRatio: 1 },
  /** Sheets, cards and panels settling, reorders, a swipe returning. */
  standard: { duration: 380, dampingRatio: 0.92 },
  /** Only a moment worth marking: Paired, a first result. */
  celebrate: { duration: 500, dampingRatio: 0.7 },
} as const;

/** How far things travel, in points/px. Small: motion explains, it doesn't perform. */
export const MOTION_DISTANCE = {
  /** A menu or popover from its trigger. */
  popover: 4,
  /** A message, card or toast rising into place. */
  rise: 8,
  /** Starting scale for menus/popovers (never from 0). */
  popoverScale: 0.97,
  /** Starting scale for modals and sheets on desk. */
  modalScale: 0.98,
  /** A pressed control. */
  pressScale: 0.97,
} as const;

/** Lists that arrive together: delay per item, and the cap so a long list never waits. */
export const MOTION_STAGGER = { step: 30, maxItems: 6 } as const;

/**
 * Haptics, phone only (mobile/src/lib/haptics.ts plays them; Settings →
 * Haptics turns them off). Reserved for what the user did or must know;
 * arrivals, scrolling and plain navigation are silent.
 */
export const HAPTICS = {
  send: 'light',
  stop: 'medium',
  swipeThreshold: 'select',
  toggle: 'select',
  longPressMenu: 'medium',
  pullToRefreshTrigger: 'select',
  approvalAllowed: 'success',
  approvalDenied: 'warning',
  copied: 'success',
  paired: 'success',
  failed: 'error',
} as const satisfies Record<string, 'select' | 'light' | 'medium' | 'success' | 'warning' | 'error'>;

export type MotionSpring = keyof typeof MOTION_SPRING;

/**
 * A CSS `linear()` easing approximating a damped spring of this config, so the
 * desk's springs match the phone's. Sampled at `points` steps of the spring's
 * perceived duration (critically damped when dampingRatio >= 1).
 */
export function springEasing(name: MotionSpring, points = 24): string {
  const { duration, dampingRatio: z } = MOTION_SPRING[name];
  // Perceived duration ~ the time to settle within 0.1%: omega such that the
  // envelope e^(-z*omega*t) reaches ~0.001 at t = duration.
  const t1 = duration / 1000;
  const omega = z >= 1 ? 9.2 / t1 : 6.9 / (z * t1);
  const at = (t: number) => {
    if (z >= 1) return 1 - (1 + omega * t) * Math.exp(-omega * t);
    const wd = omega * Math.sqrt(1 - z * z);
    return (
      1 -
      Math.exp(-z * omega * t) * (Math.cos(wd * t) + ((z * omega) / wd) * Math.sin(wd * t))
    );
  };
  const out: string[] = [];
  for (let i = 0; i <= points; i++) {
    const v = i === points ? 1 : at((i / points) * t1);
    out.push(String(Math.round(v * 1000) / 1000));
  }
  return `linear(${out.join(', ')})`;
}

export const cubicBezier = (e: readonly number[]) => `cubic-bezier(${e.join(', ')})`;
