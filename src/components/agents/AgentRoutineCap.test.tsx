import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { AgentRoutineCap } from './AgentRoutineCap';
import type { Agent, RoutineCapStatus } from '../../lib/agents';
import {
  ROUTINE_CAP_NOTE,
  liftDayWords,
  routineCapChoices,
  routineCapLine,
} from '../../lib/routineCap';

vi.mock('../../lib/agentsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/agentsStore')>()),
  refreshAgents: () => Promise.resolve(),
}));

afterEach(() => {
  cleanup();
  clearMocks();
});

const agent = { id: 'a1', name: 'Research', engine: 'claude' } as Agent;

describe('routine cap words', () => {
  it('is in tokens, never a percent or a price, and says user messages still run', () => {
    expect(ROUTINE_CAP_NOTE).toMatch(/your own messages/);
    expect(ROUTINE_CAP_NOTE).not.toMatch(/%|\$/);
    const choices = routineCapChoices();
    expect(choices[0]).toEqual({ value: '0', label: 'Off' });
    expect(choices.map((c) => c.label)).toContain('2M tokens');
    // A cap set from chat that isn't a preset is listed, in order.
    const custom = routineCapChoices(3_000_000).map((c) => c.label);
    expect(custom.indexOf('3M tokens')).toBe(custom.indexOf('2M tokens') + 1);
  });

  it('says where it stands, and when a reached cap lifts', () => {
    const now = new Date(2026, 10, 19, 12); // Thu 19 Nov 2026
    expect(routineCapLine({ tokens: 2_000_000, used: 1_200_000, reached: false }, now)).toBe(
      '1.2M of 2M tokens this week'
    );
    const reached: RoutineCapStatus = {
      tokens: 2_000_000,
      used: 2_100_000,
      reached: true,
      liftsOn: '2026-11-24',
    };
    expect(routineCapLine(reached, now)).toBe(
      'Reached: 2.1M of 2M tokens this week. Its routines don’t start. They start again on Tue if nothing more runs.'
    );
    expect(liftDayWords('2026-11-20', now)).toBe('tomorrow');
    expect(liftDayWords('2026-11-26', now)).toBe('on Nov 26');
  });
});

describe('AgentRoutineCap', () => {
  it('is off by default and sets a cap at once', async () => {
    const calls: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === 'agents_update') {
        calls.push(args);
        return { ...agent, routineCap: { tokens: 2_000_000 } };
      }
      if (cmd === 'agents_usage') {
        return {
          week: {},
          allTime: {},
          routineCap: { tokens: 2_000_000, used: 400_000, reached: false },
        };
      }
      return null;
    });
    render(<AgentRoutineCap agent={agent} />);
    const trigger = screen.getByRole('button', { name: /Pause its routines after: Off/ });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText('2M tokens'));
    await waitFor(() =>
      expect(calls).toEqual([
        expect.objectContaining({ agentId: 'a1', input: { routineCap: 2_000_000 } }),
      ])
    );
    expect(await screen.findByText('400k of 2M tokens this week')).toBeInTheDocument();
  });

  it('shows a reached cap and clears it with Off', async () => {
    const calls: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === 'agents_update') calls.push(args);
      if (cmd === 'agents_usage') return { week: {}, allTime: {} };
      return null;
    });
    const capped = { ...agent, routineCap: { tokens: 2_000_000, reachedAt: 1 } } as Agent;
    render(
      <AgentRoutineCap
        agent={capped}
        status={{ tokens: 2_000_000, used: 2_100_000, reached: true }}
      />
    );
    expect(screen.getByText(/^Reached: 2.1M of 2M tokens this week/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pause its routines after: 2M tokens/ }));
    fireEvent.click(await screen.findByText('Off'));
    await waitFor(() =>
      expect(calls).toEqual([expect.objectContaining({ input: { routineCap: 0 } })])
    );
    await waitFor(() => expect(screen.queryByText(/^Reached/)).not.toBeInTheDocument());
  });
});
