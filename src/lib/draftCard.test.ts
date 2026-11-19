import { describe, expect, it } from 'vitest';
import type { Approval } from './agents';
import {
  DRAFT_NOTE,
  draftFrom,
  draftOf,
  draftTitle,
  editedNote,
  gmailUrl,
  joinHeaders,
  splitHeaders,
  splitRecipient,
} from './draftCard';

const card = (over: Partial<Approval>): Approval =>
  ({ requestId: 'r', title: 't', detail: '', status: 'pending', ...over }) as Approval;

describe('draftOf', () => {
  it('reads a Slack reply card as a direct draft', () => {
    const d = draftOf(
      card({ slackReply: { channel: 'C', threadTs: '1', place: '#beta', text: 'Hi all' } })
    );
    expect(d).toMatchObject({ kind: 'slack', to: '#beta', body: 'Hi all', direct: true });
  });
  it('reads one emailed send, with its headers, as an email', () => {
    const d = draftOf(
      card({
        plan: {
          actions: [
            {
              kind: 'send',
              target: 'a@b.co',
              summary: 'Email Aurelie',
              text: 'Subject: Hello\nCC: c@d.co\n\nThanks for the call.',
            },
          ],
        },
      })
    );
    expect(d).toMatchObject({
      kind: 'email',
      to: 'a@b.co',
      cc: 'c@d.co',
      subject: 'Hello',
      body: 'Thanks for the call.',
      direct: false,
    });
  });
  it('is not a draft for a plan of several things, or a push', () => {
    const one = { kind: 'push' as const, target: 'o/r', summary: 's' };
    expect(draftOf(card({ plan: { actions: [one] } }))).toBeNull();
    expect(draftOf(card({ plan: { actions: [one, one] } }))).toBeNull();
    expect(draftOf(card({}))).toBeNull();
  });
});

describe('headers', () => {
  it('splits and joins', () => {
    const s = splitHeaders('Subject: Hi\n\nBody');
    expect(s).toEqual({ subject: 'Hi', cc: '', body: 'Body' });
    expect(joinHeaders({ ...s, cc: 'x@y.z' })).toBe('Subject: Hi\nCC: x@y.z\n\nBody');
    expect(splitHeaders('No headers here').body).toBe('No headers here');
  });
  it('tells the agent the edit and where to put it', () => {
    expect(editedNote({ subject: '', cc: '', body: 'New words' })).toContain('New words');
  });
});

describe('gmailUrl', () => {
  it('fills Gmail’s compose window and sends nothing', () => {
    const u = new URL(gmailUrl({ to: 'a@b.co', cc: '', subject: 'Hi there', body: 'Line\nTwo' }));
    expect(u.hostname).toBe('mail.google.com');
    expect(u.searchParams.get('to')).toBe('a@b.co');
    expect(u.searchParams.get('su')).toBe('Hi there');
    expect(u.searchParams.get('body')).toBe('Line\nTwo');
    expect(u.searchParams.has('cc')).toBe(false);
  });
});

describe('title and account', () => {
  const email = (target: string, text: string, over: Partial<Approval> = {}): Approval =>
    card({ plan: { actions: [{ kind: 'send', target, summary: 's', text }] }, ...over });
  it('names who and where, and Gmail only when the app knows the account', () => {
    const known = email('Aurelie Martin <a@b.co>', 'Subject: Hi\n\nWords', { sendFrom: 'me@x.co' });
    const d = draftOf(known)!;
    expect(d).toMatchObject({ name: 'Aurelie Martin', to: 'a@b.co' });
    expect(draftTitle(d, known)).toBe('Email to Aurelie Martin · Gmail');
    expect(draftFrom(d, known)).toBe('From me@x.co · goes out as you');
    const unknown = email('a@b.co', 'Subject: Hi\n\nWords');
    const u = draftOf(unknown)!;
    expect(draftTitle(u, unknown)).toBe('Email to a@b.co');
    expect(draftFrom(u, unknown)).toBe('goes out as you');
  });
  it('a subject starting Re: is a reply', () => {
    const a = email('Aurelie <a@b.co>', 'Subject: Re: Beta\n\nWords');
    expect(draftTitle(draftOf(a)!, a)).toBe('Reply to Aurelie');
  });
  it('a Slack reply names its place and the connected account', () => {
    const a = card({
      slackReply: {
        channel: 'C',
        threadTs: '1',
        place: '#beta',
        text: 'Hi',
        accountName: 'robin · Acme',
      },
    });
    expect(draftTitle(draftOf(a)!, a)).toBe('Reply in #beta · Slack');
    expect(draftFrom(draftOf(a)!, a)).toBe('From robin · Acme · goes out as you');
  });
  it('splits Name <address> and keeps the one footer note', () => {
    expect(splitRecipient('"Aurelie M" <a@b.co>')).toEqual({
      name: 'Aurelie M',
      address: 'a@b.co',
    });
    expect(splitRecipient('a@b.co')).toEqual({ name: '', address: 'a@b.co' });
    expect(DRAFT_NOTE).toBe('These exact words go out under your name.');
  });
});
