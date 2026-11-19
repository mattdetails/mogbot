import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { Agent } from '../../lib/agents';
import {
  lookToward,
  mascotMoodOf,
  MASCOT_DIZZY_POKES,
  pokesAfter,
  SidebarMascot,
  SidebarMascotFace,
} from './SidebarMascot';

const agent = (over: Partial<Agent>): Agent =>
  ({
    id: 'a',
    name: 'A',
    hidden: false,
    unread: 0,
    pending: 0,
    status: { state: 'idle' },
    ...over,
  }) as unknown as Agent;

describe('mascotMoodOf', () => {
  it('is idle with nothing going on', () => {
    expect(mascotMoodOf([agent({})])).toBe('idle');
  });

  it('watches while an agent works', () => {
    expect(mascotMoodOf([agent({ status: { state: 'working' } as Agent['status'] })])).toBe(
      'working'
    );
  });

  it('looks to the bell when one needs you, before anything else', () => {
    expect(
      mascotMoodOf([
        agent({ status: { state: 'working' } as Agent['status'] }),
        agent({ id: 'b', pendingApprovals: 1 } as Partial<Agent>),
      ])
    ).toBe('needs-you');
  });

  it('ignores hidden agents', () => {
    expect(
      mascotMoodOf([agent({ hidden: true, status: { state: 'working' } as Agent['status'] })])
    ).toBe('idle');
  });
});

describe('SidebarMascot', () => {
  it('draws nothing outside full screen', () => {
    const { container } = render(<SidebarMascot />);
    expect(container.firstChild).toBeNull();
  });

  it('is decorative: hidden from screen readers, mood on the element', () => {
    const { container } = render(<SidebarMascotFace mood="needs-you" />);
    const el = container.querySelector('.sidebar-mascot');
    expect(el?.getAttribute('aria-hidden')).toBe('true');
    expect(el?.getAttribute('data-mood')).toBe('needs-you');
    expect(container.querySelectorAll('.sidebar-mascot__eye')).toHaveLength(2);
  });
});

describe('lookToward', () => {
  it('looks straight ahead with the pointer on it', () => {
    expect(lookToward({ x: 50, y: 20 }, { x: 50, y: 20 })).toEqual({ x: 0, y: 0 });
  });

  it('turns fully toward a far pointer, never past it', () => {
    expect(lookToward({ x: 50, y: 20 }, { x: 2000, y: -900 })).toEqual({ x: 1, y: -1 });
  });
});

describe('pokesAfter', () => {
  it(`gets dizzy on the ${MASCOT_DIZZY_POKES}th quick poke`, () => {
    let pokes: number[] = [];
    const results: boolean[] = [];
    for (let i = 0; i < MASCOT_DIZZY_POKES; i++) {
      const r = pokesAfter(pokes, 1000 + i * 200);
      pokes = r.pokes;
      results.push(r.dizzy);
    }
    expect(results).toEqual([...Array<boolean>(MASCOT_DIZZY_POKES - 1).fill(false), true]);
  });

  it('forgets pokes that are too far apart', () => {
    const r = pokesAfter([0, 100, 200], 10_000);
    expect(r).toEqual({ pokes: [10_000], dizzy: false });
  });
});

describe('SidebarMascotFace states', () => {
  it.each(['sleep', 'happy', 'held', 'poked', 'dizzy'] as const)('shows %s', (state) => {
    const { container } = render(<SidebarMascotFace mood="idle" state={state} />);
    expect(container.querySelector('.sidebar-mascot')?.getAttribute('data-state')).toBe(state);
  });
});
