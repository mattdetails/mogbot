import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentDraftCard } from './AgentDraftCard';
import type { AgentMessage } from '../../lib/agents';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
const mockAnswer = vi.fn();
vi.mock('../../lib/agents', async (orig) => ({
  ...(await orig<typeof import('../../lib/agents')>()),
  answerApproval: (...a: unknown[]) => mockAnswer(...a) as Promise<void>,
}));

const message = {
  id: 'm',
  agentId: 'a',
  ts: 1,
  kind: 'approval',
  text: '',
  approval: {
    requestId: 'r',
    title: 't',
    detail: '',
    status: 'pending',
    sendFrom: 'me@x.co',
    plan: {
      actions: [
        {
          kind: 'send',
          target: 'Aurelie Martin <a@b.co>',
          summary: 's',
          text: 'Subject: Hi\n\nThe words.',
        },
      ],
    },
  },
} as unknown as AgentMessage;

describe('AgentDraftCard', () => {
  it('names who and where, shows the account and the one note', () => {
    render(
      <AgentDraftCard message={message} agentName="Chief" onAnswer={() => Promise.resolve(true)} />
    );
    expect(screen.getByText('Email to Aurelie Martin · Gmail')).toBeTruthy();
    expect(screen.getByText('From me@x.co · goes out as you')).toBeTruthy();
    expect(screen.getByText('These exact words go out under your name.')).toBeTruthy();
    expect(screen.getByText('The words.')).toBeTruthy();
  });
  it('keeps the words and says so when the Mac refuses the send', async () => {
    mockAnswer.mockRejectedValueOnce(new Error('Your Mac didn’t answer.'));
    render(
      <AgentDraftCard message={message} agentName="Chief" onAnswer={() => Promise.resolve(false)} />
    );
    fireEvent.click(screen.getByText('Send'));
    expect(await screen.findByText(/Couldn’t send\. Your words are kept\./)).toBeTruthy();
    expect(screen.getByText('The words.')).toBeTruthy();
  });
});
