import { render } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useNextLine } from './useNextLine';

function List({ rows }: { rows: string[] }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  useNextLine(ref);
  return (
    <div ref={ref}>
      {rows.map((c, i) => (
        <div key={`${i}-${c}`} className={c} data-testid={`r${i}`} />
      ))}
    </div>
  );
}

describe('useNextLine', () => {
  it('says what follows each line, and only what a margin depends on', () => {
    const { getByTestId, rerender } = render(
      <List rows={['agent-chat__row', 'agent-chat__row', 'agent-chat__row--card']} />
    );
    expect(getByTestId('r0').getAttribute('data-next')).toBeNull();
    expect(getByTestId('r1').getAttribute('data-next')).toBe('card');
    expect(getByTestId('r2').getAttribute('data-next')).toBeNull();

    // A working line arrives after the card, and older lines page in above.
    rerender(
      <List
        rows={[
          'agent-chat__row',
          'agent-chat__row',
          'agent-chat__row',
          'agent-chat__row--card',
          'agent-chat__row--working',
        ]}
      />
    );
    expect(getByTestId('r2').getAttribute('data-next')).toBe('card');
    expect(getByTestId('r3').getAttribute('data-next')).toBe('working');
    expect(getByTestId('r4').getAttribute('data-next')).toBeNull();

    // It goes again: the attribute is taken off.
    rerender(
      <List
        rows={['agent-chat__row', 'agent-chat__row', 'agent-chat__row', 'agent-chat__row--card']}
      />
    );
    expect(getByTestId('r3').getAttribute('data-next')).toBeNull();
  });
});
