/**
 * Reply to a message, as the rows see it: one context so a bubble can offer
 * Reply, show the quote of what it answers and jump to it, without the chat's
 * state being drilled through every row (`lib/replyTo.ts` holds the words).
 *
 * @module components/agents/ReplyContext
 */

import { createContext, useContext } from 'react';
import type { AgentMessage } from '../../lib/agents';
import { REPLY_UNAVAILABLE, type ReplyRef } from '../../lib/replyTo';

export interface ReplyApi {
  /** Start a reply to this message (replaces one already set). */
  reply: (message: AgentMessage) => void;
  /** Drop the reply that is set. */
  cancel: () => void;
  /** Scroll to a message and flash it; false when it isn't loaded. */
  jump: (id: string) => boolean;
  /** Whether a message is loaded here (the quote can be followed). */
  has: (id: string) => boolean;
}

export const ReplyContext = createContext<ReplyApi | null>(null);

export const useReply = (): ReplyApi | null => useContext(ReplyContext);

/**
 * What a sent reply answers, Grok's way: a one-line outlined pill directly above
 * the bubble, outside it. In a 1:1 chat it shows the quoted line only; when it
 * quotes someone other than the two of you it starts with the name. Click it to
 * go to the original; when that isn't loaded it says so and does nothing.
 */
export function ReplyPill({ replyTo, otherParty }: { replyTo: ReplyRef; otherParty: string }) {
  const api = useReply();
  const here = api ? api.has(replyTo.id) : false;
  const named = replyTo.name !== 'you' && replyTo.name !== otherParty;
  const text = here
    ? named
      ? `${replyTo.name}: ${replyTo.excerpt}`
      : replyTo.excerpt
    : REPLY_UNAVAILABLE;
  return here ? (
    <button
      type="button"
      tabIndex={-1}
      className="agent-reply-pill"
      onClick={() => api?.jump(replyTo.id)}
    >
      {text}
    </button>
  ) : (
    <div className="agent-reply-pill" data-gone>
      {text}
    </div>
  );
}
