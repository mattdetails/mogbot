/**
 * The foot's create actions: New agent, then New folder always in sight (it
 * opens the folder name field in the list), then New room once there are two
 * agents to talk to.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const groups = vi.hoisted(() => ({ setGroupMode: vi.fn(), startNamingGroup: vi.fn() }));
vi.mock('../../lib/agentGroups', async (orig) => ({
  ...(await orig<typeof import('../../lib/agentGroups')>()),
  ...groups,
}));

import { AgentsSidebarActions } from './AgentsSidebar';

describe('AgentsSidebarActions', () => {
  it('shows New folder even with one agent, and opens the name field', () => {
    render(<AgentsSidebarActions agentCount={1} onNew={vi.fn()} onNewRoom={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'New room' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    expect(groups.setGroupMode).toHaveBeenCalledWith('custom');
    expect(groups.startNamingGroup).toHaveBeenCalledWith();
  });

  it('keeps New room beside it once there are two agents', () => {
    render(<AgentsSidebarActions agentCount={3} onNew={vi.fn()} onNewRoom={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New room' })).toBeInTheDocument();
  });
});
