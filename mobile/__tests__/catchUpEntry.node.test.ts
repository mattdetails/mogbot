/**
 * Catch up's entry (spec-catchup-entry, option A): the hero card's words for
 * each state, and never a time estimate.
 */
import { collapseRepeats, heroWords, keysThatFit, staleLine } from '../src/lib/catchUpEntry';

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

describe('keysThatFit', () => {
  it('counts the keys a line holds, at least one', () => {
    // 330 across at 34pt keys with 6pt gaps: 8 fit.
    expect(keysThatFit(330, 34, 6)).toBe(8);
    expect(keysThatFit(0, 34, 6)).toBe(1);
    expect(keysThatFit(20, 34, 6)).toBe(1);
  });
});

describe('collapseRepeats', () => {
  it('turns identical rows into one, with how many there were, order kept', () => {
    const rows = [
      { k: 'a', t: 'Use capture post' },
      { k: 'b', t: 'Edit Hero' },
      { k: 'a', t: 'Use capture post' },
      { k: 'a', t: 'Use capture post' },
    ];
    expect(collapseRepeats(rows, (r) => `${r.k}\n${r.t}`)).toEqual([
      { row: rows[0], count: 3 },
      { row: rows[1], count: 1 },
    ]);
  });
});
