/**
 * The way out of side by side, beside Agents | Projects: shown only while
 * Agents and the project side share the window (lib/sideBySide). Turning it
 * on is ⌘K, "Show Agents and Projects side by side": rare enough that a
 * permanent button only cluttered the row (Julian, 19 Nov).
 *
 * @module components/workspace/SideBySideToggle
 */

import { SplitViewIcon } from '@/components/icons';
import { ToggleButton } from '../primitives/ToggleButton';
import { Tooltip } from '../primitives/Tooltip';
import { toggleSideBySide, useSideBySide } from '../../lib/sideBySide';

export function SideBySideToggle() {
  const { on } = useSideBySide();
  if (!on) return null;
  const words = 'Show one side at a time';
  return (
    <Tooltip content={words}>
      <ToggleButton
        pressed
        variant="ghost"
        size="compact"
        className="side-by-side-toggle button--icon-only"
        leftIcon={<SplitViewIcon size={14} />}
        onClick={toggleSideBySide}
        aria-label="Side by side"
      />
    </Tooltip>
  );
}
