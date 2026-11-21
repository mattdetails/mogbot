/**
 * TerminalFindBar — find in a terminal's scrollback (⌘F, Edit → Find in
 * Terminal…, or ⌘K "Find in terminal"). A small bar at the top right of the
 * terminal: type to find as you go, every match marked and the current one
 * stronger, "3 of 12", Enter / Shift+Enter or the arrows for the next and
 * previous, Esc to close and go back to typing in the terminal.
 *
 * Drives xterm's search addon (`@xterm/addon-search`); the terminal owns the
 * addon and hands it in, so the bar holds only the words being found.
 *
 * @module components/terminal/TerminalFindBar
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ISearchOptions, SearchAddon } from '@xterm/addon-search';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from '@/components/icons';
import { IconButton } from '../primitives/IconButton';
import { SearchField } from '../primitives/SearchField';
import { terminalSearchColors } from './terminalTheme';
import '../../styles/features/terminal-find-bar.css';

/** The part of the addon the bar uses. */
export type TerminalFinder = Pick<
  SearchAddon,
  'findNext' | 'findPrevious' | 'clearDecorations' | 'onDidChangeResults'
>;

interface TerminalFindBarProps {
  finder: TerminalFinder;
  /** Changes on every ⌘F: the field takes the cursor (and its text is selected). */
  focusRequest?: number;
  /** Close the bar and put the cursor back in the terminal. */
  onClose: () => void;
}

/** "3 of 12", "No results", "1,000+ found" (past the addon's highlight limit). */
export function findCountText(index: number, count: number): string {
  if (count === 0) return 'No results';
  if (index < 0) return `${count.toLocaleString()}+ found`;
  return `${index + 1} of ${count.toLocaleString()}`;
}

export function TerminalFindBar({ finder, focusRequest = 0, onClose }: TerminalFindBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ index: number; count: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);

  useEffect(() => {
    const sub = finder.onDidChangeResults((e) =>
      setResults({ index: e.resultIndex, count: e.resultCount })
    );
    return () => {
      sub.dispose();
      finder.clearDecorations();
    };
  }, [finder]);

  const options = (incremental = false): ISearchOptions => ({
    incremental,
    decorations: terminalSearchColors(),
  });

  const change = (next: string) => {
    setQuery(next);
    if (next) finder.findNext(next, options(true));
    else {
      finder.clearDecorations();
      setResults(null);
    }
  };

  const next = () => query && finder.findNext(query, options());
  const previous = () => query && finder.findPrevious(query, options());

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) previous();
      else next();
    }
  };

  const none = !query || results?.count === 0;
  return (
    <div className="terminal-find-bar" role="search" aria-label="Find in terminal">
      <SearchField
        ref={input}
        density="compact"
        className="terminal-find-bar__field"
        value={query}
        onChange={change}
        onKeyDown={onKeyDown}
        aria-label="Find in terminal"
        placeholder="Find"
      />
      {query && results && (
        <span className="terminal-find-bar__count" aria-live="polite">
          {findCountText(results.index, results.count)}
        </span>
      )}
      <IconButton
        variant="ghost"
        size="compact"
        icon={<ArrowUpIcon size={13} />}
        onClick={previous}
        disabled={none}
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
      />
      <IconButton
        variant="ghost"
        size="compact"
        icon={<ArrowDownIcon size={13} />}
        onClick={next}
        disabled={none}
        title="Next match (Enter)"
        aria-label="Next match"
      />
      <IconButton
        variant="ghost"
        size="compact"
        icon={<CloseIcon size={13} />}
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close find"
      />
    </div>
  );
}
