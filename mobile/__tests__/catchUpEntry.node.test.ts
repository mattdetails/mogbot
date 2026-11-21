/**
 * Catch up's entry (spec-catchup-entry, option A): the hero card's words for
 * each state, and never a time estimate.
 */
import { heroWords, staleLine } from '../src/lib/catchUpEntry';

describe('heroWords', () => {
  it('says nothing when nothing waits: the all-clear line stands in', () => {
    expect(heroWords(0, 0, null, null)).toBeNull();
  });

  it('one thing: what it is, and Review it', () => {
    expect(heroWords(1, 1, 'Lead Gen · Send 12 intro emails as you', null)).toEqual({
      title: '1 thing needs you',
      sub: 'Lead Gen · Send 12 intro emails as you',
      button: 'Review it',
      progress: null,
    });
  });

  it('many: the count, from how many agents, Start catching up; no minutes', () => {
    const w = heroWords(7, 6, null, null)!;
    expect(w).toEqual({
      title: '7 things need you',
      sub: 'From 6 agents',
      button: 'Start catching up',
      progress: null,
    });
    expect(JSON.stringify(w)).not.toMatch(/minute/);
  });

  it('many from one agent says no "From 1 agents"', () => {
    expect(heroWords(3, 1, null, null)!.sub).toBeNull();
  });

  it('mid-run: what is left, what is done, Continue and how far', () => {
    expect(heroWords(4, 4, null, 7)).toEqual({
      title: '4 left',
      sub: '3 done · from 4 agents',
      button: 'Continue',
      progress: 3 / 7,
    });
  });

  it('a run with more waiting than it started with is a fresh start, not "-2 done"', () => {
    expect(heroWords(9, 5, null, 7)!.button).toBe('Start catching up');
  });
});

describe('staleLine', () => {
  const clock = () => '20:14';
  it('says when it last heard, when it knows', () => {
    expect(staleLine(1, 'your Mac', clock)).toBe('From 20:14 · couldn’t reach your Mac');
  });
  it('never invents a time', () => {
    expect(staleLine(0, 'your Mac', clock)).toBe('Couldn’t reach your Mac');
  });
});
