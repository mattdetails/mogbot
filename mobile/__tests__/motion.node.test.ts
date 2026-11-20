/**
 * The phone's motion configs come from the shared numbers (docs/MOTION.md),
 * and the phone's older ARRIVE constant agrees with them.
 */
jest.mock('react-native-reanimated', () => ({
  Easing: { bezier: (...c: number[]) => ({ bezier: c }) },
  ReduceMotion: { System: 'system' },
}));

import { MOTION_DURATION, MOTION_EASE, MOTION_SPRING } from '@shipstudio/companion-protocol';
import { motion, spring, staggerDelay } from '../src/lib/motion';
import { ARRIVE } from '../src/lib/theme';

describe('phone motion', () => {
  it('builds every role from the shared numbers, honouring Reduce Motion', () => {
    expect(motion.arrive).toEqual({
      duration: MOTION_DURATION.arrive,
      easing: { bezier: [...MOTION_EASE.arrive] },
      reduceMotion: 'system',
    });
    expect(motion.exit.duration).toBe(MOTION_DURATION.exitQuick);
    expect(motion.exitScreen.duration).toBe(MOTION_DURATION.exitScreen);
    expect(spring.standard).toEqual({ ...MOTION_SPRING.standard, reduceMotion: 'system' });
  });

  it('keeps theme.ts ARRIVE in step with the shared arrive', () => {
    expect(ARRIVE.ms).toBe(MOTION_DURATION.arrive);
    expect([...ARRIVE.curve]).toEqual([...MOTION_EASE.arrive]);
  });

  it('caps the stagger', () => {
    expect([0, 1, 5, 6, 40].map(staggerDelay)).toEqual([0, 30, 150, 150, 150]);
  });
});
