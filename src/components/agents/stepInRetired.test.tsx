import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApprovalCard } from './AgentChatItems';
import type { AgentMessage } from '../../lib/agents';

/** Step in is gone with the agents' own browser: an old stored card is one quiet line. */
describe('a retired Step in card', () => {
  const message = (status: 'pending' | 'expired'): AgentMessage => ({
    id: 'm1',
    agentId: 'finance',
    ts: Date.now(),
    kind: 'approval',
    text: '',
    approval: {
      requestId: 'step-1',
      title: 'Finance needs you in its browser: approve the sign-in',
      detail: 'Its tab opens on this Mac.',
      status,
      stepIn: { reason: 'approve the sign-in', site: 'login.example.com', tab: 2 },
    },
  });

  it.each(['expired', 'pending'] as const)('draws one muted line, no buttons (%s)', (status) => {
    const { container } = render(
      <ApprovalCard message={message(status)} agentName="Finance" onAnswer={vi.fn()} />
    );
    expect(screen.getByText('This sign-in used the old browser; ask again')).toBeTruthy();
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelector('.agent-note--expired')).toBeTruthy();
  });
});
