import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AgentWorkingLine, WorkingElapsed } from './AgentWorkingLine';
import { AgentKey } from './AgentKey';
import type { Agent } from '../../lib/agents';

const T0 = 1_762_290_000_000;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const agent = (status: Agent['status']) => ({ id: 'a', name: 'Acme Site', status }) as Agent;

describe('a working agent in a list', () => {
  it('says the step it is on and for how long, not "Working…"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 332_000);
    const { container } = render(
      <AgentWorkingLine
        agent={agent({
          state: 'working',
          activity: 'Running the Cypress tests',
          since: T0 - 60_000,
          work: {
            startedAt: T0 - 60_000,
            stepCount: 3,
            fileCount: 0,
            steps: [],
            current: {
              kind: 'command',
              label: 'Running the Cypress tests',
              startedAt: T0,
              streams: false,
              canStop: true,
            },
          },
        })}
      />
    );
    expect(container.querySelector('.agents-list__working')?.textContent).toBe(
      'Running the Cypress tests · 5m'
    );
  });

  it('between calls says it is thinking, timed from the turn', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 12_000);
    const { container } = render(
      <AgentWorkingLine agent={agent({ state: 'working', activity: null, since: T0 })} />
    );
    expect(container.querySelector('.agents-list__working')?.textContent).toBe('Thinking · 12s');
  });

  it('holds each step a moment, and never flashes a brief Thinking between two', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const working = (activity: string) => agent({ state: 'working', activity, since: T0 - 30_000 });
    const { rerender } = render(<AgentWorkingLine agent={working('Reading a file')} />);
    const step = () => screen.getByText(/./, { selector: '.agents-list__step' }).textContent;
    rerender(<AgentWorkingLine agent={working('Thinking')} />);
    act(() => void vi.advanceTimersByTime(300));
    rerender(<AgentWorkingLine agent={working('Running the tests')} />);
    expect(step()).toBe('Reading a file');
    act(() => void vi.advanceTimersByTime(1_800));
    expect(step()).toBe('Running the tests');
  });

  it('presses a working key (the state is CSS; it never animates)', () => {
    const { container } = render(<AgentKey name="Acme Site" color="green" state="working" />);
    expect(container.querySelector('.agent-key[data-state="working"]')).not.toBeNull();
  });
});

describe('a working row in the sidebar', () => {
  const working = agent({
    state: 'working',
    activity: 'Fixing the pricing table',
    since: T0 - 120_000,
  });

  it('keeps the step in its line with a grey dot, and the clock out of it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const { container } = render(<AgentWorkingLine agent={working} inRow />);
    expect(container.querySelector('.agents-list__working-dot')).not.toBeNull();
    expect(container.querySelector('.agents-list__working')?.textContent).toBe(
      'Fixing the pricing table'
    );
  });

  it('puts the clock in the time column', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const { container } = render(<WorkingElapsed agent={working} />);
    expect(container.querySelector('.agents-list__time')?.textContent).toBe('2m');
  });
});
