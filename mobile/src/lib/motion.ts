/**
 * The motion system on the phone (docs/MOTION.md): the shared numbers from
 * @shipstudio/companion-protocol as Reanimated configs, named like the desk's
 * `--motion-*` roles. Never write a duration, curve or spring in a screen;
 * take one from here.
 *
 * Every config carries `ReduceMotion.System`. For a decision in JS (whether to
 * run a loop, which stack animation to use) read `useReduceMotion()` from
 * ./moving, which follows the setting live; Reanimated's own hook reads it once.
 */

import {
  MOTION_DISTANCE,
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_SPRING,
  MOTION_STAGGER,
  type MotionSpring,
} from '@shipstudio/companion-protocol';
import { Easing, ReduceMotion } from 'react-native-reanimated';

type Curve = readonly [number, number, number, number];
const bezier = (c: readonly number[]) => Easing.bezier(...(c as unknown as Curve));

const timing = (duration: number, curve: readonly number[]) => ({
  duration,
  easing: bezier(curve),
  reduceMotion: ReduceMotion.System,
});

/** `withTiming(value, motion.arrive)` and friends: one per desk role. */
export const motion = {
  hover: timing(MOTION_DURATION.micro, MOTION_EASE.standard),
  change: timing(MOTION_DURATION.quick, MOTION_EASE.standard),
  press: timing(MOTION_DURATION.press, MOTION_EASE.press),
  arrive: timing(MOTION_DURATION.arrive, MOTION_EASE.arrive),
  screen: timing(MOTION_DURATION.screen, MOTION_EASE.arrive),
  exit: timing(MOTION_DURATION.exitQuick, MOTION_EASE.exit),
  exitScreen: timing(MOTION_DURATION.exitScreen, MOTION_EASE.exit),
} as const;

/** `withSpring(value, spring.standard)`: duration + damping ratio, as the desk's `--spring-*`. */
export function springConfig(name: MotionSpring) {
  const { duration, dampingRatio } = MOTION_SPRING[name];
  return { duration, dampingRatio, reduceMotion: ReduceMotion.System };
}

export const spring = {
  snappy: springConfig('snappy'),
  standard: springConfig('standard'),
  celebrate: springConfig('celebrate'),
} as const;

/** How far things travel (points). */
export const distance = MOTION_DISTANCE;

/** The delay for the `index`th item arriving together (capped, so a long list never waits). */
export function staggerDelay(index: number): number {
  return Math.min(index, MOTION_STAGGER.maxItems - 1) * MOTION_STAGGER.step;
}
