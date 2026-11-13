/**
 * Tests for TabAccountBar — a terminal tab whose account ran out of usage.
 *
 * What matters: asking says why and offers exactly one move (to the account
 * the Mac named), the answer is neutral (`strong`, never accent), and every
 * account being out offers nothing but Dismiss.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabAccountBar } from './TabAccountBar';
import type { TabAccountNotice } from '../../lib/tabAccounts';

const ask: TabAccountNotice = {
  sessionId: 's1',
  kind: 'switch',
  ask: true,
  line: 'Switched to Work: Personal is out of usage until 10:30 PM.',
  to: 'Work',
  prompt: 'Continue where you left off.',
};

const allOut: TabAccountNotice = {
  sessionId: 's1',
  kind: 'allOut',
  ask: false,
  line: 'Both Claude Code accounts have reached their usage limit. The first is back at 10:30 PM.',
};

describe('TabAccountBar', () => {
  it('asks with the reason and one move to the named account', () => {
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    render(<TabAccountBar notice={ask} onContinue={onContinue} onDismiss={onDismiss} />);
    expect(screen.getByText('Personal is out of usage until 10:30 PM.')).toBeTruthy();
    const move = screen.getByRole('button', { name: 'Continue on Work' });
    expect(move.className).toContain('button--strong');
    expect(move.className).not.toContain('button--primary');
    fireEvent.click(move);
    expect(onContinue).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('says when every account is out and offers only Dismiss', () => {
    render(<TabAccountBar notice={allOut} onContinue={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(allOut.line)).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Dismiss']);
  });
});
