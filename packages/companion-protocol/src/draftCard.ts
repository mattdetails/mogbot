/**
 * A message the agent wants to send as the user, drawn as a draft: who it
 * goes to, the words, and what the user can do with it. Read from what the
 * cards already carry (a Slack reply card, or a plan of one send or post with
 * its exact text), so nothing new crosses from the Mac. An email's subject and
 * CC are the first lines of its text (`Subject: …`, `CC: …`, then a blank
 * line), the one convention the plan card's description asks the agent for.
 *
 * Shared by the desk (`src/lib/draftCard.ts`) and the phone.
 *
 * @module draftCard
 */

import type { Approval } from './model';

export type DraftKind = 'email' | 'slack' | 'post';

export interface Draft {
  kind: DraftKind;
  /** The recipient (email) or the place it goes (a channel, a thread). */
  to: string;
  cc: string;
  subject: string;
  body: string;
  /** Where Send is answered: a Slack reply posts the edit itself; the rest hand it back to the agent. */
  direct: boolean;
}

const HEADER = /^(subject|cc|to)\s*:\s*(.*)$/i;

/** Split `Subject: …` / `CC: …` lines off the front of an email's text. */
export function splitHeaders(text: string): { subject: string; cc: string; body: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let subject = '';
  let cc = '';
  let i = 0;
  for (; i < lines.length; i++) {
    const m = HEADER.exec(lines[i]);
    if (!m) break;
    const key = m[1].toLowerCase();
    if (key === 'subject') subject = m[2].trim();
    else if (key === 'cc') cc = m[2].trim();
  }
  if (i === 0) return { subject: '', cc: '', body: text.trim() };
  return { subject, cc, body: lines.slice(i).join('\n').trim() };
}

/** An email's text as the agent is given it back: headers, a blank line, the body. */
export function joinHeaders(d: Pick<Draft, 'subject' | 'cc' | 'body'>): string {
  const head = [
    d.subject.trim() && `Subject: ${d.subject.trim()}`,
    d.cc.trim() && `CC: ${d.cc.trim()}`,
  ].filter(Boolean);
  return head.length ? `${head.join('\n')}\n\n${d.body.trim()}` : d.body.trim();
}

/** The draft a card holds, or none when it isn't one message with its exact words. */
export function draftOf(approval: Approval | undefined): Draft | null {
  if (!approval) return null;
  if (approval.slackReply) {
    return {
      kind: 'slack',
      to: approval.slackReply.place,
      cc: '',
      subject: '',
      body: approval.slackReply.text,
      direct: true,
    };
  }
  const actions = approval.plan?.actions ?? [];
  const only = actions.length === 1 ? actions[0] : undefined;
  if (!only || (only.kind !== 'send' && only.kind !== 'post') || !only.text?.trim()) return null;
  if (only.target.includes('@')) {
    const { subject, cc, body } = splitHeaders(only.text);
    return { kind: 'email', to: only.target, cc, subject, body, direct: false };
  }
  return {
    kind: only.kind === 'post' ? 'post' : 'slack',
    to: only.target,
    cc: '',
    subject: '',
    body: only.text.trim(),
    direct: false,
  };
}

/** Gmail's compose window with the draft filled in: the user's own Gmail, nothing sent. */
export function gmailUrl(d: Pick<Draft, 'to' | 'cc' | 'subject' | 'body'>): string {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: d.to });
  if (d.cc.trim()) q.set('cc', d.cc.trim());
  if (d.subject.trim()) q.set('su', d.subject.trim());
  q.set('body', d.body);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/**
 * What a Send of an edited plan draft tells the agent: declined as written,
 * with the final words to put on a new card, so the exact text the user
 * approves is always the exact text sent.
 */
export function editedNote(d: Pick<Draft, 'subject' | 'cc' | 'body'>): string {
  return `I edited it. Put exactly this on a new card for my OK, then send it: ${joinHeaders(d)}`;
}
