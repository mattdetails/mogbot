/**
 * Tests for TerminalFindBar — find in a terminal's scrollback.
 *
 * What matters: typing finds as you go, Enter / Shift+Enter (and the arrows)
 * step through matches, the count reads as the addon reports it, Esc closes,
 * and closing clears the marks.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ISearchResultChangeEvent } from '@xterm/addon-search';
import { TerminalFindBar, findCountText, type TerminalFinder } from './TerminalFindBar';

function fakeFinder() {
  let emit: (e: ISearchResultChangeEvent) => void = () => undefined;
  const finder = {
    findNext: vi.fn(() => true),
    findPrevious: vi.fn(() => true),
    clearDecorations: vi.fn(),
    onDidChangeResults: vi.fn((cb: (e: ISearchResultChangeEvent) => void) => {
      emit = cb;
      return { dispose: vi.fn() };
    }),
  };
  return { finder, emit: (e: ISearchResultChangeEvent) => emit(e) };
}

const field = () => screen.getByRole('searchbox', { name: 'Find in terminal' });

describe('TerminalFindBar', () => {
  it('takes the cursor and finds as you type', () => {
    const { finder } = fakeFinder();
    render(<TerminalFindBar finder={finder as unknown as TerminalFinder} onClose={vi.fn()} />);
    expect(field()).toHaveFocus();
    fireEvent.change(field(), { target: { value: 'error' } });
    expect(finder.findNext).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ incremental: true })
    );
  });

  it('steps with Enter and Shift+Enter, and shows the count', () => {
    const { finder, emit } = fakeFinder();
    render(<TerminalFindBar finder={finder as unknown as TerminalFinder} onClose={vi.fn()} />);
    fireEvent.change(field(), { target: { value: 'error' } });
    act(() => emit({ resultIndex: 2, resultCount: 12 }));
    expect(screen.getByText('3 of 12')).toBeInTheDocument();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(finder.findNext).toHaveBeenLastCalledWith(
      'error',
      expect.objectContaining({ incremental: false })
    );
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(finder.findPrevious).toHaveBeenCalledWith('error', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(finder.findPrevious).toHaveBeenCalledTimes(2);
  });

  it('closes on Esc and clears the marks when it goes', () => {
    const { finder } = fakeFinder();
    const onClose = vi.fn();
    const { unmount } = render(
      <TerminalFindBar finder={finder as unknown as TerminalFinder} onClose={onClose} />
    );
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(finder.clearDecorations).toHaveBeenCalled();
  });

  it('has nothing to step through with no words', () => {
    const { finder } = fakeFinder();
    render(<TerminalFindBar finder={finder as unknown as TerminalFinder} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
  });
});

describe('findCountText', () => {
  it('reads as people say it', () => {
    expect(findCountText(0, 1)).toBe('1 of 1');
    expect(findCountText(-1, 0)).toBe('No results');
    expect(findCountText(-1, 1000)).toBe('1,000+ found');
  });
});
