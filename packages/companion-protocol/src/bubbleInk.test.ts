import { describe, expect, it } from 'vitest';
import { COLORWAYS } from './agentKeys';
import { bubbleColors, contrastRatio } from './bubbleInk';

describe('bubbleColors', () => {
  it('reads at 4.5:1 on every key colour, with the higher-contrast ink', () => {
    for (const c of COLORWAYS) {
      const b = bubbleColors(c.face);
      expect(contrastRatio(b.fill, b.ink), c.id).toBeGreaterThanOrEqual(4.5);
      const other = b.ink === '#ffffff' ? '#151413' : '#ffffff';
      expect(contrastRatio(b.fill, b.ink), c.id).toBeGreaterThanOrEqual(contrastRatio(b.fill, other));
    }
  });
});
