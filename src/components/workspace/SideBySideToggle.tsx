/**
 * The side-by-side switch beside Agents | Projects: pressed while Agents and
 * the project side share the window (lib/sideBySide). Also ⌘K, "Show Agents
 * and Projects side by side".
 *
 * @module components/workspace/SideBySideToggle
 */

import { SplitViewIcon } from '@/components/icons';
import { ToggleButton } from '../primitives/ToggleButton';
import { Tooltip } from '../primitives/Tooltip';
import { toggleSideBySide, useSideBySide } from '../../lib/sideBySide';

export function SideBySideToggle() {
  const { on } = useSideBySide();
  const words = on ? 'Show one side at a time' : 'Agents and Projects side by side';
  return (
    <Tooltip content={words}>
      <ToggleButton
        pressed={on}
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
