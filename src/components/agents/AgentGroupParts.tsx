/**
 * The agent list's sections (`lib/agentGroups.ts`): a folding header per
 * section, dropping a dragged agent into a folder, the one-line field that
 * names a new folder or renames one, and the row and header menu items.
 * Folders live on the Mac; a change that fails there says so in a toast.
 *
 * @module components/agents/AgentGroupParts
 */

import { useState, type DragEvent, type ReactNode } from 'react';
import { ChevronRightIcon, FolderPlusIcon, PencilIcon, TrashIcon } from '@/components/icons';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../primitives/ContextMenu';
import { TextField } from '../primitives/TextField';
import { useOptionalToast } from '../../contexts/ToastContext';
import { asCommandError, formatCommandError } from '../../lib/errors';
import {
  addGroup,
  moveToGroup,
  removeGroup,
  renameGroup,
  setPinnedPlacement,
  startNamingGroup,
  stopNamingGroup,
  toggleCollapsed,
  type AgentSection,
} from '../../lib/agentGroups';
import type { PinnedPlacement } from '../../lib/agents';

/** The drag's payload type: an agent's id, from its sidebar row. */
export const AGENT_DRAG_TYPE = 'application/x-agent-id';

/** Start dragging a row (into a folder). */
export function startAgentDrag(event: DragEvent<HTMLElement>, agentId: string) {
  event.dataTransfer.setData(AGENT_DRAG_TYPE, agentId);
  event.dataTransfer.effectAllowed = 'move';
}

/** A change sent to the Mac, its failure said in a toast. */
function useMacChange() {
  const { showToast } = useOptionalToast();
  return (change: Promise<unknown>) => {
    change.catch((error) => showToast(formatCommandError(asCommandError(error)), 'error'));
  };
}

/** One section of the list: its header, then its rows unless folded. */
export function AgentGroupSection({
  section,
  collapsed,
  droppable,
  pinned,
  children,
}: {
  section: AgentSection;
  collapsed: boolean;
  /** Folders: an agent dragged here joins it ("Not in a folder": leaves its folder). */
  droppable: boolean;
  /** Where pinned agents sit, for the folder menu's choice. */
  pinned?: PinnedPlacement;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const change = useMacChange();
  const accepts = (e: DragEvent) => droppable && e.dataTransfer.types.includes(AGENT_DRAG_TYPE);
  const header = renaming ? (
    <FolderNameField
      initial={section.title}
      label={`Rename ${section.title}`}
      onDone={(name) => {
        setRenaming(false);
        if (name && name !== section.title) change(renameGroup(section.groupId!, name));
      }}
    />
  ) : (
    <button
      type="button"
      tabIndex={0}
      className="agents-list__group-toggle"
      aria-expanded={!collapsed}
      onClick={() => toggleCollapsed(section.key)}
    >
      <ChevronRightIcon size={10} className="agents-list__hidden-chevron" />
      <span className="agents-list__group-title">{section.title}</span>
      <span className="agents-list__group-count">{section.agents.length}</span>
    </button>
  );
  return (
    <div
      className="agents-list__group"
      role="group"
      aria-label={section.title}
      data-drop-over={over || undefined}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        const agentId = e.dataTransfer.getData(AGENT_DRAG_TYPE);
        if (agentId) change(moveToGroup(agentId, section.groupId ?? null));
      }}
    >
      {section.groupId && !renaming ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
          <ContextMenuContent aria-label={`Actions for ${section.title}`}>
            <ContextMenuItem onSelect={() => setRenaming(true)}>
              <PencilIcon size={12} /> Rename…
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => startNamingGroup()}>
              <FolderPlusIcon size={12} /> New folder…
            </ContextMenuItem>
            <PinnedPlacementItem pinned={pinned} />
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => change(removeGroup(section.groupId!))}
            >
              <TrashIcon size={12} /> Remove folder
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        header
      )}
      {!collapsed && children}
      {!collapsed && section.agents.length === 0 && droppable && (
        <p className="agents-list__group-empty">Drag agents here</p>
      )}
    </div>
  );
}

/** The other place for pinned agents, as one menu item. */
export function PinnedPlacementItem({ pinned }: { pinned: PinnedPlacement | undefined }) {
  const change = useMacChange();
  const inFolder = pinned === 'inFolder';
  return (
    <ContextMenuItem onSelect={() => change(setPinnedPlacement(inFolder ? 'top' : 'inFolder'))}>
      {inFolder ? 'Show pinned agents at the top' : 'Show pinned agents in their folder'}
    </ContextMenuItem>
  );
}

/** One line for a folder's name: Enter keeps it, Escape or leaving it empty puts it away. */
function FolderNameField({
  initial = '',
  label,
  placeholder,
  onDone,
}: {
  initial?: string;
  label: string;
  placeholder?: string;
  /** The trimmed name, or null when put away. */
  onDone: (name: string | null) => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="agents-list__group-new"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(name.trim() || null);
      }}
    >
      <TextField
        autoFocus
        value={name}
        placeholder={placeholder}
        aria-label={label}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone(null);
        }}
        onBlur={() => {
          if (!name.trim() || name.trim() === initial) onDone(null);
        }}
      />
    </form>
  );
}

/** "New folder": one line, Enter makes it (filing the agent it was opened for). */
export function NewGroupField() {
  const change = useMacChange();
  return (
    <FolderNameField
      label="New folder name"
      placeholder="Folder name, e.g. SEO"
      onDone={(name) => {
        if (name) change(addGroup(name));
        else stopNamingGroup();
      }}
    />
  );
}

/** A row's folder items (the right-click menu): move, take out, or a new folder for it. */
export function MoveToGroupItems({
  agentId,
  groups,
  current,
}: {
  agentId: string;
  groups: { id: string; name: string }[];
  current: string | undefined;
}) {
  const change = useMacChange();
  return (
    <>
      {groups
        .filter((g) => g.id !== current)
        .map((g) => (
          <ContextMenuItem key={g.id} onSelect={() => change(moveToGroup(agentId, g.id))}>
            Move to {g.name}
          </ContextMenuItem>
        ))}
      {current && (
        <ContextMenuItem onSelect={() => change(moveToGroup(agentId, null))}>
          Remove from folder
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => startNamingGroup(agentId)}>
        <FolderPlusIcon size={12} /> New folder…
      </ContextMenuItem>
    </>
  );
}
