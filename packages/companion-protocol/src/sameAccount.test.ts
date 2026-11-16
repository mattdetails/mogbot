import { describe, expect, it } from 'vitest';
import { addedSameAccount, browserWarning, sameAccountLine, weeklySchedule } from './sameAccount';

describe('the same account twice', () => {
  it('is said plainly, by the kind of account people know', () => {
    expect(sameAccountLine('claude', 'Work')).toBe(
      'Same Claude account as Work — adds no extra room'
    );
    expect(sameAccountLine('codex', 'Work')).toBe(
      'Same ChatGPT account as Work — adds no extra room'
    );
  });

  it('warns before the browser signs in as whoever is logged in there', () => {
    // Claude's opens in a new window with no one signed in: nothing to sign out of.
    expect(browserWarning('claude')).toContain('new window where no one is signed in');
    expect(browserWarning('claude')).not.toContain('sign out');
    expect(browserWarning('codex')).toContain('chatgpt.com');
    expect(addedSameAccount('claude', 'This Mac')).toMatch(
      /^That’s the same Claude account as This Mac, so it adds no extra room\./
    );
  });

  it('says a weekly reset as the schedule it is on', () => {
    expect(weeklySchedule(new Date(2026, 10, 2, 16, 0).getTime())).toBe('Mondays 4 PM');
    expect(weeklySchedule(new Date(2026, 10, 7, 10, 30).getTime())).toBe('Saturdays 10:30 AM');
  });
});
