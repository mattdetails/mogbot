import { describe, expect, it } from 'vitest';
import { elapsedLabel, hearing, hearingLine } from './listening';

const base = { startedAt: 0, lastVoiceAt: null, lastWordsAt: null, wordsExpected: true };

describe('hearing', () => {
  it('says nothing for the first moments', () => {
    expect(hearing({ ...base, now: 7_000 })).toBe('ok');
  });
  it('no voice at all for 8 s: can’t hear you', () => {
    expect(hearing({ ...base, now: 8_000 })).toBe('silent');
  });
  it('a pause after talking is fine until 10 s', () => {
    expect(hearing({ ...base, now: 9_000, lastVoiceAt: 1_000, lastWordsAt: 1_000 })).toBe('ok');
    expect(hearing({ ...base, now: 11_000, lastVoiceAt: 1_000, lastWordsAt: 1_000 })).toBe(
      'silent'
    );
  });
  it('sound but no words for 10 s: says so, only where words are expected', () => {
    const m = { ...base, now: 12_000, lastVoiceAt: 11_500, lastWordsAt: 1_000 };
    expect(hearing(m)).toBe('noWords');
    expect(hearing({ ...m, wordsExpected: false })).toBe('ok');
  });
});

describe('the listening line', () => {
  it('names the mic when it can', () => {
    expect(hearingLine('silent', 'MacBook Pro Microphone')).toBe(
      'Can’t hear you · check the mic (MacBook Pro Microphone)'
    );
    expect(hearingLine('noWords', null)).toBe('Hearing sound, but no words · check the mic');
    expect(hearingLine('ok', 'x')).toBeNull();
  });
  it('counts minutes and seconds', () => {
    expect(elapsedLabel(7_400)).toBe('0:07');
    expect(elapsedLabel(102_000)).toBe('1:42');
    expect(elapsedLabel(-5)).toBe('0:00');
  });
});
