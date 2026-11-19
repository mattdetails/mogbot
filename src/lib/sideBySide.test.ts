/**
 * Side by side: on/off and the divider's place, kept per window, with the
 * divider never letting either half get too narrow to use.
 */
import { describe, expect, it } from 'vitest';
import {
  clampShare,
  getSideBySide,
  parseSideBySide,
  setSideBySide,
  setSideBySideShare,
  toggleSideBySide,
} from './sideBySide';

describe('sideBySide', () => {
  it('reads nothing stored as off and half and half', () => {
    expect(parseSideBySide(null)).toEqual({ on: false, share: 0.5 });
    expect(parseSideBySide('not json')).toEqual({ on: false, share: 0.5 });
  });

  it('keeps the divider between a quarter and three quarters', () => {
    expect(clampShare(0.1)).toBe(0.25);
    expect(clampShare(0.9)).toBe(0.75);
    expect(clampShare(Number.NaN)).toBe(0.5);
    expect(parseSideBySide('{"on":true,"share":0.6}')).toEqual({ on: true, share: 0.6 });
  });

  it('turns on and off, and remembers both for this window', () => {
    setSideBySide(false);
    toggleSideBySide();
    expect(getSideBySide().on).toBe(true);
    setSideBySideShare(0.4);
    expect(parseSideBySide(localStorage.getItem('shipstudio.sideBySide'))).toEqual({
      on: true,
      share: 0.4,
    });
    toggleSideBySide();
    expect(getSideBySide().on).toBe(false);
  });

  it('a drag moves the divider without saving until let go', () => {
    setSideBySideShare(0.5);
    setSideBySideShare(0.62, false);
    expect(getSideBySide().share).toBe(0.62);
    expect(parseSideBySide(localStorage.getItem('shipstudio.sideBySide')).share).toBe(0.5);
  });
});
