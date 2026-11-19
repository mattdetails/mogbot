import { describe, expect, it } from 'vitest';
import { plainCommandTitle } from './approvalTitle';
import { shortMiddle, softBreaks, tailSegments } from './softBreaks';

const ZW = '​';

describe('softBreaks', () => {
  it('allows a break after a slash or a dash, never inside a number', () => {
    expect(softBreaks('2026-11/final-export')).toBe(`2026-11/${ZW}final-${ZW}export`);
    // "2026-11" keeps its dash whole: a date never comes apart.
    expect(softBreaks('2026-11-05')).toBe('2026-11-05');
  });
  it('breaks neither at the very end nor between a scheme’s two slashes', () => {
    expect(softBreaks('https://a.co/x/')).toBe(`https://${ZW}a.co/${ZW}x/`);
    expect(softBreaks('a-')).toBe('a-');
  });
  it('leaves text without either alone', () => {
    expect(softBreaks('plain words')).toBe('plain words');
  });
});

describe('shortening a path for a title', () => {
  it('keeps both ends and leaves the middle out', () => {
    expect(shortMiddle('~/ShipStudio/acme-site/src/pages/final-export')).toBe(
      '~/ShipStudio/acme-site/…/final-export'
    );
    expect(shortMiddle('~/Exports/2024')).toBe('~/Exports/2024');
    expect(shortMiddle('/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q')).toBe('/a/b/…/q');
  });
  it('takes the last segments', () => {
    expect(tailSegments('~/ShipStudio/acme/export/icons', 2)).toBe('export/icons');
    expect(tailSegments('~/ShipStudio/acme-site/', 1)).toBe('acme-site');
  });
  it('titles a copy short, with the full destination left to the command block', () => {
    expect(plainCommandTitle('cp -r ~/ShipStudio/acme/export/icons ~/ShipStudio/acme-site')).toBe(
      'Copy export/icons to acme-site'
    );
    expect(plainCommandTitle('rm -r ~/ShipStudio/acme-site/src/pages/final-export')).toBe(
      'Delete ~/ShipStudio/acme-site/…/final-export'
    );
  });
});
