/**
 * The agent menu (Designer's G-7): one plain ⋯ at the header's right edge that
 * holds what the header's Usage, Routines and Model buttons used to be, with
 * Tasks first, then the agent's own actions. Rows open the existing popovers
 * and pages; the menu adds only Tasks.
 *
 * @module components/agents/AgentMenu
 */

import type { ReactNode } from 'react';
import {
  ActivityIcon,
  CheckIcon,
  MoreHorizontalIcon,
  RoutineIcon,
  SettingsSlidersIcon,
} from '@/components/icons';
import { Dropdown, DropdownItem } from '../primitives/Dropdown';
import { IconButton } from '../primitives/IconButton';
import type { Agent, TaskCounts } from '../../lib/agents';
import { ENGINE_LABEL } from '../../lib/agents';
import { toDoLine } from './AgentTasksPanel';

export const MENU_COPY = {
  tasks: 'Tasks',
  usage: 'Usage',
  routines: 'Routines',
  model: 'Model',
} as const;

/** "1 waits · 5 to do" for the Tasks row. */
export function tasksValue(tasks: TaskCounts | undefined): string | undefined {
  if (!tasks) return undefined;
  return tasks.waits > 0 ? `${tasks.waits} waits · ${toDoLine(tasks.toDo)}` : toDoLine(tasks.toDo);
}

export function AgentMenu({
  agent,
  engineReady,
  onTasks,
  onUsage,
  onRoutines,
  onModel,
  children,
}: {
  agent: Agent;
  engineReady: boolean;
  onTasks: () => void;
  onUsage: () => void;
  onRoutines: () => void;
  /** Model and effort live in the full editor. */
  onModel: () => void;
  /** The agent's own actions (Edit, Pin, Mute, Files, Delete…), after the top rows. */
  children: ReactNode;
}) {
  const value = tasksValue(agent.tasks);
  return (
    <Dropdown
      align="right"
      portal
      menuClassName="agent-menu"
      className="agent-chat__menu"
      trigger={(p) => (
        <IconButton
          {...p}
          tabIndex={0}
          variant="ghost"
          className="agent-chat__more"
          icon={<MoreHorizontalIcon size={16} />}
          title="Agent menu"
          aria-label={`Menu for ${agent.name}`}
        />
      )}
    >
      <DropdownItem icon={<CheckIcon size={12} />} onSelect={onTasks}>
        <span className="agent-menu__label">{MENU_COPY.tasks}</span>
        {value && <span className="agent-menu__value">{value}</span>}
      </DropdownItem>
      {engineReady && (
        <>
          <DropdownItem icon={<ActivityIcon size={12} />} onSelect={onUsage}>
            <span className="agent-menu__label">{MENU_COPY.usage}</span>
          </DropdownItem>
          <DropdownItem icon={<RoutineIcon size={12} />} onSelect={onRoutines}>
            <span className="agent-menu__label">{MENU_COPY.routines}</span>
          </DropdownItem>
          <DropdownItem icon={<SettingsSlidersIcon size={12} />} onSelect={onModel}>
            <span className="agent-menu__label">{MENU_COPY.model}</span>
            <span className="agent-menu__value">{ENGINE_LABEL[agent.engine]}</span>
          </DropdownItem>
        </>
      )}
      {children}
    </Dropdown>
  );
}
