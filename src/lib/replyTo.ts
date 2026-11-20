/**
 * Reply to a message (Designer's spec-reply-to-message): the whole-message
 * version of quoting. Pure, so the words are tested. The Mac stores
 * `replyTo: { id, name, excerpt, kind }` on the sent message and takes the
 * original's id on `agents_send`; the app adds "Replying to: <excerpt>" to what
 * the agent is told, never to what the chat shows.
 *
 * @module lib/replyTo
 */

import type { AgentMessage } from './agents';

export type { ReplyKind, ReplyRef } from '../../packages/companion-protocol/src/model';
import type { ReplyKind, ReplyRef } from '../../packages/companion-protocol/src/model';

const IMAGE = /^image\//;

/** One line of a message's words. */
const firstLine = (text: string): string =>
  text.replace(/^>.*$/gm, '').trim().split('\n')[0]?.trim() ?? '';

/** The host of a lone link, or null. */
function linkHost(text: string): string | null {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  try {
    return new URL(t).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** What kind of thing this message is, for the chip and the quote. */
export function replyKindOf(m: AgentMessage): ReplyKind {
  if (m.approval || m.result) return 'card';
  const files = m.attachments ?? [];
  if (files.length > 0 && !m.text.trim()) return IMAGE.test(files[0].mime) ? 'attachment' : 'file';
  if (linkHost(m.text)) return 'link';
  return 'message';
}

/** The reply's target, as the chip and (once the Mac stores it) the quote show it. */
export function replyTargetOf(m: AgentMessage, agentName: string): ReplyRef {
  const kind = replyKindOf(m);
  const files = m.attachments ?? [];
  const excerpt =
    kind === 'card'
      ? (m.approval?.title ?? m.result?.title ?? firstLine(m.text))
      : kind === 'attachment'
        ? `Attachment · ${files[0]?.name ?? ''}`
        : kind === 'file'
          ? `File · ${files[0]?.name ?? ''}`
          : kind === 'link'
            ? `Link · ${linkHost(m.text) ?? ''}`
            : firstLine(m.text);
  return { id: m.id, name: m.kind === 'user' ? 'you' : agentName, excerpt, kind };
}

/** "Replying to Lead Gen" / "Replying to you". */
export const replyingTo = (name: string): string => `Replying to ${name}`;

/** The quote's words when the original isn't loaded any more. */
export const REPLY_UNAVAILABLE = 'Message not available';

/** Whether a message can be replied to: it has something to point at. */
export function canReplyTo(m: AgentMessage): boolean {
  if (m.kind !== 'user' && m.kind !== 'agent') return false;
  return Boolean(m.text.trim() || m.attachments?.length || m.approval || m.result);
}
