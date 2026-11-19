import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TerminalOnlyToggle } from './TerminalOnlyToggle';
import {
  TERMINAL_ONLY_KEY,
  isTerminalOnly,
  reloadTerminalOnly,
  setTerminalOnly,
} from '../../lib/terminalOnly';

describe('TerminalOnlyToggle', () => {
  beforeEach(() => {
    localStorage.removeItem(TERMINAL_ONLY_KEY);
    reloadTerminalOnly();
  });

  it('turns this project, and only this one, to terminal only', () => {
    render(<TerminalOnlyToggle projectPath="/projects/api" />);
    const toggle = screen.getByRole('button', { name: 'Terminal only' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(isTerminalOnly('/projects/api')).toBe(true);
    expect(isTerminalOnly('/projects/site')).toBe(false);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);
    expect(isTerminalOnly('/projects/api')).toBe(false);
  });

  it('shows the saved state when it mounts', () => {
    act(() => setTerminalOnly('/projects/api', true));
    render(<TerminalOnlyToggle projectPath="/projects/api" />);
    expect(screen.getByRole('button', { name: 'Terminal only' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
