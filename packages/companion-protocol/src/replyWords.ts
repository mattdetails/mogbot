/**
 * Reply to a message: the words, one place for desk and phone. The Mac fills
 * `replyTo` (`ReplyRef`) from the stored original; the clients word it.
 */
import type { ReplyKind, ReplyRef } from './model';

export const REPLY = {
  action: 'Reply',
  gone: 'Message not available',
  cancel: 'Cancel reply',
  /** "Replying to Lead Gen" / "Replying to you". */
  replyingTo: (name: string) => `Replying to ${name}`,
} as const;

/** The first line of the original, as the reply line and the pill show it. */
export function replyExcerptLine(kind: ReplyKind, excerpt: string): string {
  const line = excerpt.trim().split('\n')[0] ?? '';
  switch (kind) {
    case 'attachment':
      return `Attachment · ${line}`;
    case 'file':
      return `File · ${line}`;
    case 'link':
      return `Link · ${line}`;
    default:
      return line;
  }
}

/**
 * The pill above a sent reply. A 1:1 chat shows the quoted line only; a room,
 * or a quote of someone other than the two of you, starts with the name
 * ("Mail: Reply to Globex…"). `parties` are the names that need no prefix:
 * "you" and the agent whose chat this is.
 */
export function replyPillText(ref: ReplyRef, opts: { room?: boolean; parties: string[] }): string {
  const line = replyExcerptLine(ref.kind, ref.excerpt);
  const named = opts.room || !opts.parties.includes(ref.name);
  return named ? `${ref.name}: ${line}` : line;
}
