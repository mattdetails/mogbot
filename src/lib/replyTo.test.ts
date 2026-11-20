import { describe, expect, it } from 'vitest';
import type { AgentMessage } from './agents';
import { canReplyTo, replyKindOf, replyTargetOf, replyingTo } from './replyTo';

const m = (over: Partial<AgentMessage>): AgentMessage => ({
  id: 'm1',
  agentId: 'a',
  ts: 1,
  kind: 'agent',
  text: '',
  ...over,
});

describe('reply to a message', () => {
  it('names who and what', () => {
    expect(replyingTo('Lead Gen')).toBe('Replying to Lead Gen');
    expect(replyTargetOf(m({ text: 'Send them at 9 am\nthen stop' }), 'Lead Gen')).toEqual({
      id: 'm1',
      name: 'Lead Gen',
      excerpt: 'Send them at 9 am',
      kind: 'message',
    });
    expect(replyTargetOf(m({ kind: 'user', text: 'Yes' }), 'Lead Gen').name).toBe('you');
  });
  it('words attachments, files, links and cards by kind', () => {
    const file = { name: 'intros.pdf', path: 'p', mime: 'application/pdf', size: 1 };
    expect(replyTargetOf(m({ attachments: [file] }), 'A').excerpt).toBe('File · intros.pdf');
    expect(
      replyTargetOf(m({ attachments: [{ ...file, name: 'a.png', mime: 'image/png' }] }), 'A')
        .excerpt
    ).toBe('Attachment · a.png');
    expect(replyTargetOf(m({ text: 'https://www.example.com/x?y=1' }), 'A')).toMatchObject({
      kind: 'link',
      excerpt: 'Link · example.com',
    });
    expect(
      replyKindOf(
        m({
          approval: {
            requestId: 'r',
            title: 'Send 12 emails',
            detail: '',
            status: 'pending',
          } as never,
        })
      )
    ).toBe('card');
  });
  it('replies only to what has something to point at', () => {
    expect(canReplyTo(m({ text: 'hi' }))).toBe(true);
    expect(canReplyTo(m({ text: '' }))).toBe(false);
    expect(canReplyTo(m({ kind: 'note', text: 'x' }))).toBe(false);
  });
});
