import { describe, expect, it } from 'vitest';
import {
  EDITING_LINE,
  GO_BACK_LABELS,
  GO_BACK_NOT_UNDONE,
  copyClause,
  foldRewound,
  forkConfirm,
  goBackBlocked,
  goBackQuote,
  rewindConfirm,
  rewoundIds,
  rewoundSummary,
  UNDO_CODE_LABEL,
  undoCodeLine,
} from './rewind';

describe('going back, in the same words on desk and phone', () => {
  it('names the three actions', () => {
    expect(Object.values(GO_BACK_LABELS)).toEqual([
      'Edit and resend',
      'Fork from here',
      'Rewind to here',
    ]);
    expect(EDITING_LINE).toMatch(/^Editing your message/);
  });

  it('quotes a message by its first own line, at most 40 characters', () => {
    expect(goBackQuote('> quoted\n\n  Fix the header  \nthanks')).toBe('Fix the header');
    expect(goBackQuote('Write a very long message that goes on and on past forty')).toBe(
      'Write a very long message that goes on a…'
    );
  });

  it('says what isn’t undone in every confirm, and a copy only when there is one', () => {
    const rewind = rewindConfirm('Finance', 'Sort out the invoices');
    expect(rewind.title).toBe('Rewind to here?');
    expect(rewind.body).toContain('just before “Sort out the invoices”');
    expect(rewind.body).toContain(GO_BACK_NOT_UNDONE);
    expect(rewind.body).not.toContain('copy of');
    const fork = forkConfirm('Site', 'Change the hero', 'acme-site');
    expect(fork.confirm).toBe('Fork');
    expect(fork.body).toContain(copyClause('acme-site'));
    expect(copyClause(null)).toBeNull();
    // A conversation's living page isn't rewound, and the confirm says so.
    expect(rewind.body).not.toContain('page');
    expect(rewindConfirm('Finance', 'Sort it', null, 'Budget').body).toContain(
      "The page “Budget” stays as it is now; it isn't rewound."
    );
  });

  it('says what undoing the code does, and drops the copy clause when it is picked', () => {
    expect(UNDO_CODE_LABEL).toBe('Also undo the code changes since then');
    const offer = { project: 'acme-site', commits: 2, unsaved: true };
    expect(undoCodeLine(offer)).toBe(
      "Its copy of acme-site goes back to how it was before this message (2 saved changes and work not saved yet). What's undone is kept in git, not deleted. Anything it sent isn't undone."
    );
    expect(undoCodeLine({ ...offer, commits: 1, unsaved: false })).toContain('(1 saved change)');
    expect(undoCodeLine({ ...offer, commits: 0 })).toContain('(work not saved yet)');
    // Not picked: the copy keeps its changes, as before.
    const keeps = rewindConfirm('Site', 'Make it blue', 'acme-site');
    expect(keeps.body).toContain(GO_BACK_NOT_UNDONE);
    expect(keeps.body).toContain(copyClause('acme-site'));
    // Picked: the option's own line says it, so the confirm doesn't contradict it.
    const undoes = rewindConfirm('Site', 'Make it blue', 'acme-site', 'Plan', true);
    expect(undoes.body).not.toContain(GO_BACK_NOT_UNDONE);
    expect(undoes.body).not.toContain('keeps its changes');
    expect(undoes.body).toContain('The page “Plan” stays as it is now');
  });

  it('waits for a turn to go back in place, never to fork', () => {
    const working = { working: true, driven: false, agentName: 'Site' };
    expect(goBackBlocked('rewind', working)).toMatch(/^Site is working/);
    expect(goBackBlocked('edit', working)).toMatch(/^Site is working/);
    expect(goBackBlocked('fork', working)).toBeNull();
    expect(goBackBlocked('rewind', { ...working, working: false, driven: true })).toMatch(
      /driving Site’s session/
    );
    expect(goBackBlocked('rewind', { ...working, working: false })).toBeNull();
  });

  it('folds consecutive lines of one rewind, and counts them', () => {
    const rewound = rewoundIds([
      { id: 'r1', at: 'b', ts: 1, ids: ['b', 'c'] },
      { id: 'r2', at: 'e', ts: 2, ids: ['e'] },
    ]);
    const folded = foldRewound(['a', 'b', 'c', 'd', 'e'], rewound, (x) => [x]);
    expect(folded).toEqual([
      { kind: 'item', item: 'a' },
      { kind: 'rewound', rewindId: 'r1', items: ['b', 'c'] },
      { kind: 'item', item: 'd' },
      { kind: 'rewound', rewindId: 'r2', items: ['e'] },
    ]);
    expect(rewoundSummary(1)).toBe('Rewound · 1 message');
    expect(rewoundSummary(4)).toBe('Rewound · 4 messages');
  });
});
