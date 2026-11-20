/**
 * The agent menu (spec-agent-menu-and-tasks.md §2): one plain ⋯ at the
 * header's right edge. Three groups in the spec's order — what it has going
 * (Tasks, Usage, Routines, Conversations), what it is (Instructions and
 * memory, Apps and logins, Model, Independence), and taking it over or
 * deleting it — with the agent's other actions (Files, Pin, Mute…) between the
 * second group and the last, so Delete stays last. Rows open the existing
 * popovers and pages; the menu adds only Tasks.
 *
 * Not here yet: "Pause this agent" (there is no per-agent pause on the Mac).
 *
 * @module components/agents/AgentMenu
 */

import type { ReactNode } from 'react';
import {
  ActivityIcon,
  CheckIcon,
  CommentIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PlugIcon,
  RoutineIcon,
  SettingsSlidersIcon,
  ShieldCheckIcon,
  TrashIcon,
} from '@/components/icons';
import { Dropdown, DropdownDivider, DropdownItem } from '../primitives/Dropdown';
import { IconButton } from '../primitives/IconButton';
import type { Agent, AgentIndependence, TaskCounts } from '../../lib/agents';
import { ENGINE_LABEL } from '../../lib/agents';
import { INDEPENDENCE_LABEL } from '../../../packages/companion-protocol/src/independence';
import { toDoLine } from './AgentTasksPanel';
import { takeoverItems, type AgentActions } from './AgentActions';

export const MENU_COPY = {
  tasks: 'Tasks',
  usage: 'Usage',
  routines: 'Routines',
  conversations: 'Conversations',
  instructions: 'Instructions and memory',
  apps: 'Apps and logins',
  model: 'Model',
  independence: 'Independence',
  delete: 'Delete this agent',
} as const;

/** "1 waits · 5 to do" for the Tasks row. */
export function tasksValue(tasks: TaskCounts | undefined): string | undefined {
  if (!tasks) return undefined;
  return tasks.waits > 0 ? `${tasks.waits} waits · ${toDoLine(tasks.toDo)}` : toDoLine(tasks.toDo);
}

function Row({
  icon,
  label,
  value,
  onSelect,
  danger,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownItem icon={icon} onSelect={onSelect} variant={danger ? 'danger' : 'default'}>
      <span className="agent-menu__label">{label}</span>
      {value && <span className="agent-menu__value">{value}</span>}
    </DropdownItem>
  );
}

export function AgentMenu({
  agent,
  engineReady,
  teamIndependence,
  onTasks,
  onUsage,
  onRoutines,
  onConversations,
  onModel,
  onApps,
  actions,
  children,
}: {
  agent: Agent;
  engineReady: boolean;
  /** The team's level, shown when the agent has none of its own. */
  teamIndependence?: AgentIndependence | null;
  onTasks: () => void;
  onUsage: () => void;
  onRoutines: () => void;
  /** Opens the header's conversation list. Absent before its first conversation. */
  onConversations?: () => void;
  /** Model and effort live in the full editor. */
  onModel: () => void;
  /** "What it can reach" in the editor. Absent where there is no editor. */
  onApps?: () => void;
  /** Instructions (Edit), Independence (on its own), Take over, Delete. */
  actions: AgentActions;
  /** The agent's other actions (Files, Pin, Mute…), before Take over and Delete. */
  children: ReactNode;
}) {
  const value = tasksValue(agent.tasks);
  const level = agent.independence ?? teamIndependence ?? undefined;
  const takeover = takeoverItems(agent, actions.onTakeOver, actions.onHandBack);
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
      <Row icon={<CheckIcon size={12} />} label={MENU_COPY.tasks} value={value} onSelect={onTasks} />
      {engineReady && (
        <>
          <Row icon={<ActivityIcon size={12} />} label={MENU_COPY.usage} onSelect={onUsage} />
          <Row icon={<RoutineIcon size={12} />} label={MENU_COPY.routines} onSelect={onRoutines} />
        </>
      )}
      {onConversations && (
        <Row
          icon={<CommentIcon size={12} />}
          label={MENU_COPY.conversations}
          onSelect={onConversations}
        />
      )}
      <DropdownDivider />
      <Row
        icon={<FileTextIcon size={12} />}
        label={MENU_COPY.instructions}
        onSelect={() => actions.onEdit(agent)}
      />
      {onApps && <Row icon={<PlugIcon size={12} />} label={MENU_COPY.apps} onSelect={onApps} />}
      {engineReady && (
        <Row
          icon={<SettingsSlidersIcon size={12} />}
          label={MENU_COPY.model}
          value={ENGINE_LABEL[agent.engine]}
          onSelect={onModel}
        />
      )}
      {actions.onOnItsOwn && (
        <Row
          icon={<ShieldCheckIcon size={12} />}
          label={MENU_COPY.independence}
          value={level ? INDEPENDENCE_LABEL[level] : undefined}
          onSelect={() => actions.onOnItsOwn?.(agent)}
        />
      )}
      <DropdownDivider />
      {children}
      {(takeover.length > 0 || !agent.isMain) && <DropdownDivider />}
      {takeover.map((item) => (
        <Row key={item.label} icon={item.icon} label={item.label} onSelect={item.run} />
      ))}
      {!agent.isMain && (
        <Row
          icon={<TrashIcon size={12} />}
          label={MENU_COPY.delete}
          onSelect={() => actions.onDelete(agent)}
          danger
        />
      )}
    </Dropdown>
  );
}
