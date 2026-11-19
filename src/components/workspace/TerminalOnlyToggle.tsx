/**
 * The Terminal only switch at the right end of the workspace titlebar: pressed
 * while this project shows its terminals and nothing else (lib/terminalOnly).
 * Also ⌘K, "Terminal only".
 *
 * @module components/workspace/TerminalOnlyToggle
 */

import { TerminalIcon } from '@/components/icons';
import { ToggleButton } from '../primitives/ToggleButton';
import { Tooltip } from '../primitives/Tooltip';
import { toggleTerminalOnly, useTerminalOnly } from '../../lib/terminalOnly';

export function TerminalOnlyToggle({ projectPath }: { projectPath: string }) {
  const on = useTerminalOnly(projectPath);
  const words = on
    ? 'Show the preview again'
    : 'Terminal only: close the preview and its tools to save memory';
  return (
    <Tooltip content={words}>
      <ToggleButton
        pressed={on}
        variant="ghost"
        size="compact"
        className="terminal-only-toggle button--icon-only"
        leftIcon={<TerminalIcon size={14} />}
        onClick={() => toggleTerminalOnly(projectPath)}
        aria-label="Terminal only"
      />
    </Tooltip>
  );
}
