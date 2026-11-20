import { describe, expect, it } from 'vitest';
import { COLORWAYS } from './agentKeys';
import { bubbleColors, contrastRatio } from './bubbleInk';
import { colorwayOf } from './agentKeys';

describe('bubbleColors', () => {
  it('keeps Graphite a neutral near-black in light and its own face in dark', () => {
    const face = colorwayOf('graphite').face;
    expect(bubbleColors(face).fill).toBe('#2c2c2a');
    expect(bubbleColors(face, { dark: true }).fill.toLowerCase()).toBe(face.toLowerCase());
  });

  it('reads at 4.5:1 on every key colour, with the higher-contrast ink', () => {
    for (const c of COLORWAYS) {
      for (const dark of [false, true]) {
        const b = bubbleColors(c.face, { dark });
        expect(contrastRatio(b.fill, b.ink), c.id).toBeGreaterThanOrEqual(4.5);
        const other = b.ink === '#ffffff' ? '#151413' : '#ffffff';
        expect(contrastRatio(b.fill, b.ink), c.id).toBeGreaterThanOrEqual(
          contrastRatio(b.fill, other)
        );
      }
    }
  });
});
