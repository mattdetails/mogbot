import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentProjectsProvider, useAgentProjects } from './AgentProject';

vi.mock('../../lib/project', async (orig) => ({
  ...((await orig()) as object),
  listProjects: vi.fn(async () => []),
}));

describe('AgentProjectsProvider', () => {
  it('hands the chats one value however often its parent rebuilds the callback', () => {
    const seen: unknown[] = [];
    function Reader() {
      seen.push(useAgentProjects()?.openProject);
      return null;
    }
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <AgentProjectsProvider onOpenProject={first}>
        <Reader />
      </AgentProjectsProvider>
    );
    rerender(
      <AgentProjectsProvider onOpenProject={second}>
        <Reader />
      </AgentProjectsProvider>
    );
    expect(new Set(seen).size).toBe(1);
    (seen[0] as (p: string) => void)('/p');
    expect(second).toHaveBeenCalledWith('/p');
    expect(first).not.toHaveBeenCalled();
  });
});
