/**
 * The reply line at the top of the message box (Grok's): one outlined line
 * inside the box with the first line of the original and a ×. No label, no bar,
 * no agent colour. Esc on a focused message also drops it.
 *
 * @module components/agents/ReplyChip
 */

import { CloseIcon } from '@/components/icons';
import { IconButton } from '../primitives/IconButton';
import { replyingTo, type ReplyRef } from '../../lib/replyTo';

export function ReplyLine({
  replying,
  onCancel,
}: {
  replying: ReplyRef | null;
  onCancel: () => void;
}) {
  if (!replying) return null;
  return (
    <div className="agent-reply-line" role="group" aria-label={replyingTo(replying.name)}>
      <span className="agent-reply-line__text">{replying.excerpt}</span>
      <IconButton
        tabIndex={0}
        variant="ghost"
        size="compact"
        className="agent-reply-line__cancel"
        icon={<CloseIcon size={12} />}
        onClick={onCancel}
        aria-label="Cancel reply"
        title="Cancel reply (Esc)"
      />
    </div>
  );
}
