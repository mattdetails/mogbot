import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MOTION_DISTANCE,
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_SPRING,
  cubicBezier,
  springEasing,
} from '../../packages/companion-protocol/src/motion';

/** Desk and phone share one motion system (docs/MOTION.md): the CSS mirror may not drift. */
const css = readFileSync(path.resolve('src/styles/global/tokens-core.css'), 'utf8');
const token = (name: string) => {
  const all = [...css.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
  expect(all.length, `--${name} is defined`).toBeGreaterThan(0);
  return all;
};

describe('motion tokens', () => {
  it('durations match', () => {
    expect(token('duration-press')).toContain(`${MOTION_DURATION.press}ms`);
    expect(token('duration-micro')).toContain(`${MOTION_DURATION.micro}ms`);
    expect(token('duration-quick')).toContain(`${MOTION_DURATION.quick}ms`);
    expect(token('duration-arrive')).toContain(`${MOTION_DURATION.arrive}ms`);
    expect(token('duration-screen')).toContain(`${MOTION_DURATION.screen}ms`);
    expect(token('duration-exit-quick')).toContain(`${MOTION_DURATION.exitQuick}ms`);
    expect(token('duration-exit-screen')).toContain(`${MOTION_DURATION.exitScreen}ms`);
    expect(token('duration-reduced')).toContain(`${MOTION_DURATION.reduced}ms`);
  });

  it('curves match', () => {
    expect(token('ease-arrive')).toContain(cubicBezier(MOTION_EASE.arrive));
    expect(token('ease-exit')).toContain(cubicBezier(MOTION_EASE.exit));
    expect(token('ease-move')).toContain(cubicBezier(MOTION_EASE.move));
    expect(token('ease-press')).toContain(cubicBezier(MOTION_EASE.press));
  });

  it('springs match, as linear() and as durations', () => {
    for (const name of Object.keys(MOTION_SPRING) as (keyof typeof MOTION_SPRING)[]) {
      expect(token(`spring-${name}`)).toContain(springEasing(name));
      expect(token(`duration-spring-${name}`)).toContain(`${MOTION_SPRING[name].duration}ms`);
    }
  });

  it('distances match', () => {
    expect(token('motion-popover-y')).toContain(`${MOTION_DISTANCE.popover}px`);
    expect(token('motion-rise-y')).toContain(`${MOTION_DISTANCE.rise}px`);
    expect(token('motion-popover-scale')).toContain(String(MOTION_DISTANCE.popoverScale));
    expect(token('motion-modal-scale')).toContain(String(MOTION_DISTANCE.modalScale));
    expect(token('motion-press-scale')).toContain(String(MOTION_DISTANCE.pressScale));
  });

  it('springs settle at 1 and only celebrate overshoots', () => {
    const peak = (n: keyof typeof MOTION_SPRING) =>
      Math.max(...springEasing(n).slice(7, -1).split(', ').map(Number));
    expect(springEasing('snappy').endsWith(', 1)')).toBe(true);
    expect(peak('snappy')).toBeLessThanOrEqual(1);
    expect(peak('standard')).toBeLessThanOrEqual(1.005);
    expect(peak('celebrate')).toBeGreaterThan(1);
  });
});
