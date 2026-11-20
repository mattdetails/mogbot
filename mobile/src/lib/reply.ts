import type { AgentMessage, ReplyRef } from '@shipstudio/companion-protocol';

/** The Mac cuts the excerpt at 200; the phone's line is cut the same, on a word. */
const EXCERPT_MAX = 200;

const cut = (text: string) => {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= EXCERPT_MAX) return t;
  const at = t.lastIndexOf(' ', EXCERPT_MAX);
  return `${t.slice(0, at > 40 ? at : EXCERPT_MAX)}…`;
};

/**
 * What a reply to this message quotes, as the Mac will store it (`ReplyRef`):
 * a card's title, an attachment's name, else the first words. Null for a
 * message with nothing to quote (a divider, a system line).
 */
export function replyRefFor(
  message: Pick<AgentMessage, 'id' | 'kind' | 'text' | 'approval' | 'result' | 'attachments'>,
  agentName: string
): ReplyRef | null {
  if (message.kind !== 'user' && message.kind !== 'agent' && message.kind !== 'approval') {
    return null;
  }
  const name = message.kind === 'user' ? 'you' : agentName;
  const title = message.approval?.title ?? message.result?.title;
  if (title) return { id: message.id, name, excerpt: cut(title), kind: 'card' };
  if (message.text.trim())
    return { id: message.id, name, excerpt: cut(message.text), kind: 'message' };
  const file = message.attachments?.[0];
  if (file) {
    return {
      id: message.id,
      name,
      excerpt: file.name,
      kind: file.mime.startsWith('image/') ? 'attachment' : 'file',
    };
  }
  return null;
}

/** The pull a swipe makes: a rubber band that never passes `MAX`, the circle filling at `ARM`. */
export const SWIPE_MAX = 72;
export const SWIPE_ARM = 48;
/** A swipe counts only below this angle from the horizontal. */
export const SWIPE_ANGLE_DEG = 25;

/** How far the bubble has moved after the finger moved `dx` (a rubber band, 0 to `SWIPE_MAX`). */
export function swipeOffset(dx: number): number {
  'worklet';
  return dx <= 0 ? 0 : SWIPE_MAX * (1 - Math.exp(-dx / (SWIPE_MAX * 0.85)));
}

/** Whether the pull has reached the point where releasing replies. */
export const swipeArmed = (offset: number) => offset >= SWIPE_ARM;

/** A move counts as a swipe only when it's mostly sideways. */
export const swipeIsHorizontal = (dx: number, dy: number) =>
  Math.abs(dx) > 0 && (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI < SWIPE_ANGLE_DEG;
