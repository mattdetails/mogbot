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
 * What a sent reply quotes: the original's name and up to two lines of it, one
 * look with a quoted passage (`.agent-bubble__quote`). Tap it to go to the
 * original; when that isn't loaded any more it says so and does nothing.
 */
export function ReplyQuote({ replyTo }: { replyTo: ReplyRef }) {
  const api = useReply();
  const here = api ? api.has(replyTo.id) : false;
  const body = here ? (
    <>
      <span className="agent-reply-quote__name">{replyTo.name}</span>
      <span className="agent-reply-quote__text">{replyTo.excerpt}</span>
    </>
  ) : (
    <span className="agent-reply-quote__text">{REPLY_UNAVAILABLE}</span>
  );
  return here ? (
    <button
      type="button"
      tabIndex={-1}
      className="agent-bubble__quote agent-reply-quote"
      onClick={() => api?.jump(replyTo.id)}
    >
      {body}
    </button>
  ) : (
    <div className="agent-bubble__quote agent-reply-quote" data-gone>
      {body}
    </div>
  );
}
