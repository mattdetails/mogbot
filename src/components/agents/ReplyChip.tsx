/**
 * "Replying to Lead Gen": the chip directly above the message box, the same
 * width, one unit with it. A bar in the agent's colour, who and one line of the
 * original, and a × (Esc on a focused message also drops it).
 *
 * @module components/agents/ReplyChip
 */

import { CloseIcon } from '@/components/icons';
import { IconButton } from '../primitives/IconButton';
import { replyingTo, type ReplyRef } from '../../lib/replyTo';

export function ReplyChip({
  replying,
  onCancel,
}: {
  replying: ReplyRef | null;
  onCancel: () => void;
}) {
  if (!replying) return null;
  return (
    <div className="agent-reply-chip" role="group" aria-label={replyingTo(replying.name)}>
      <span className="agent-reply-chip__bar" aria-hidden="true" />
      <span className="agent-reply-chip__text">
        <span className="agent-reply-chip__name">{replyingTo(replying.name)}</span>
        <span className="agent-reply-chip__excerpt">{replying.excerpt}</span>
      </span>
      <IconButton
        tabIndex={0}
        variant="ghost"
        icon={<CloseIcon size={12} />}
        onClick={onCancel}
        aria-label="Cancel reply"
        title="Cancel reply (Esc)"
      />
    </div>
  );
}
