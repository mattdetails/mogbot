import { describe, expect, it } from 'vitest';
import {
  allClearLine,
  countLabel,
  groupLabel,
  headCount,
  moreLine,
  summaryHead,
  summaryLine,
} from './catchUpWords';

describe('Catch up words', () => {
  it('caps a count at 99+', () => {
    expect(countLabel(99)).toBe('99');
    expect(countLabel(100)).toBe('99+');
    expect(groupLabel.needsYou(250)).toBe('Needs you · 99+');
  });
  it('says the header count', () => {
    expect(headCount({ kind: 'left', left: 3 })).toBe('3 left');
    expect(headCount({ kind: 'summary' })).toBe('Summary');
    expect(headCount({ kind: 'clear' })).toBe('All clear');
  });
  it('words the summary and the all-clear line', () => {
    expect(summaryLine(6)).toBe('6 things, no decisions');
    expect(summaryHead(1)).toBe('1 thing · no decisions');
    expect(moreLine(3)).toBe('+ 3 more');
    expect(allClearLine('2:02 pm')).toBe('Nothing needs you. Last decision: 2:02 pm.');
    expect(allClearLine()).toBe('Nothing needs you.');
  });
});
