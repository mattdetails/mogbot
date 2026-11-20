/**
 * An agent's task list (Designer's G-6): the quiet line under its name and the
 * panel it opens. Four groups in a fixed order (Doing, Next, Waits on you, Done
 * today), the user's own words per row with a small sub line, and amber only on
 * what waits on you. The data is the Mac's task board (`agents_task_board`).
 *
 * @module components/agents/AgentTasksPanel
 */

import { useEffect, useState } from 'react';
import { CheckIcon, ChevronRightIcon, CloseIcon } from '@/components/icons';
import { IconButton } from '../primitives/IconButton';
import { getTaskBoard, type AgentTask } from '../../lib/agentTasks';
import type { TaskCounts } from '../../lib/agents';

export const TASK_COPY = {
  title: 'Tasks',
  doing: 'Doing',
  next: 'Next',
  waits: 'Waits on you',
  done: 'Done today',
  empty: 'Nothing on the list. Ask for something and it lands here.',
  failed: 'Couldn’t reach your Mac. This list is from',
} as const;

/** "5 to do". */
export const toDoLine = (n: number): string => `${n} to do`;

/** The quiet line under the name: a dot, what it is doing, "· 5 to do · 1 waits", a chevron. */
export function TaskLine({ tasks, onOpen }: { tasks: TaskCounts; onOpen: () => void }) {
  const waits = tasks.waits > 0;
  return (
    <button type="button" tabIndex={0} className="agent-task-line" onClick={onOpen}>
      <span className="agent-task-line__dot" data-waits={waits || undefined} aria-hidden="true" />
      {tasks.doing && <span className="agent-task-line__doing">{tasks.doing}</span>}
      <span className="agent-task-line__counts">
        {tasks.doing ? ' · ' : ''}
        {toDoLine(tasks.toDo)}
        {waits && <span className="agent-task-line__waits"> · {tasks.waits} waits</span>}
      </span>
      <ChevronRightIcon size={10} />
    </button>
  );
}

type Group = { key: 'doing' | 'next' | 'waits' | 'done'; label: string; tasks: AgentTask[] };

/** The four groups, in order; "Done today" is what finished in the last day. */
export function groupTasks(open: AgentTask[], recent: AgentTask[], now = Date.now()): Group[] {
  const day = 24 * 60 * 60 * 1000;
  return [
    { key: 'doing', label: TASK_COPY.doing, tasks: open.filter((t) => t.state === 'doing') },
    {
      key: 'next',
      label: TASK_COPY.next,
      tasks: open.filter((t) => t.state === 'next' || t.state === 'stuck'),
    },
    { key: 'waits', label: TASK_COPY.waits, tasks: open.filter((t) => t.state === 'waiting') },
    {
      key: 'done',
      label: TASK_COPY.done,
      tasks: recent.filter((t) => t.state === 'done' && now - t.updatedAt < day),
    },
  ];
}

/** A time of day, 24-hour: "22:05". */
function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** A row's sub line: where it came from and when. */
function sub(task: AgentTask): string {
  const at = clock(task.createdAt);
  if (task.source === 'agent' && task.from) return `from ${task.from.name} · ${at}`;
  if (task.state === 'waiting' && task.waitingOn) return `${task.waitingOn}`;
  return task.source === 'user' ? `you asked ${at}` : at;
}

export function AgentTasksPanel({
  agentId,
  counts,
  onClose,
}: {
  agentId: string;
  counts?: TaskCounts;
  onClose: () => void;
}) {
  const [lists, setLists] = useState<{ open: AgentTask[]; recent: AgentTask[] } | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [asOf, setAsOf] = useState<number>(() => Date.now());
  useEffect(() => {
    let live = true;
    getTaskBoard()
      .then((board) => {
        if (!live) return;
        const mine = board.find((b) => b.agentId === agentId);
        setLists({ open: mine?.open ?? [], recent: mine?.recent ?? [] });
        setAsOf(Date.now());
        setFailedAt(null);
      })
      .catch(() => live && setFailedAt(asOf));
    return () => {
      live = false;
    };
    // The board is read when the panel opens; a registry change re-opens it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, counts?.toDo, counts?.waits, counts?.doing]);

  const groups = lists ? groupTasks(lists.open, lists.recent) : [];
  const openCount = counts?.toDo ?? lists?.open.filter((t) => t.state !== 'doing').length ?? 0;
  const empty = lists !== null && groups.every((g) => g.tasks.length === 0);
  return (
    <aside className="agent-tasks" aria-label={TASK_COPY.title}>
      <header className="agent-tasks__head">
        <h3>{TASK_COPY.title}</h3>
        <span className="agent-tasks__count">{toDoLine(openCount)}</span>
        <IconButton
          tabIndex={0}
          variant="ghost"
          size="compact"
          className="agent-tasks__close"
          icon={<CloseIcon size={12} />}
          onClick={onClose}
          aria-label="Close tasks"
        />
      </header>
      {failedAt !== null && (
        <p className="agent-tasks__failed" role="status">
          {TASK_COPY.failed}{' '}
          {new Date(failedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}
      {empty ? (
        <p className="agent-tasks__empty">{TASK_COPY.empty}</p>
      ) : (
        groups
          .filter((g) => g.tasks.length > 0)
          .map((g) => (
            <section key={g.key} className="agent-tasks__group">
              <h4>{g.label}</h4>
              {g.tasks.map((t) => (
                <div key={t.id} className="agent-tasks__row" data-state={g.key}>
                  <span className="agent-tasks__mark" aria-hidden="true">
                    {g.key === 'done' && <CheckIcon size={10} />}
                  </span>
                  <span className="agent-tasks__text">
                    <span className="agent-tasks__title">{t.title}</span>
                    <span className="agent-tasks__sub">{sub(t)}</span>
                  </span>
                </div>
              ))}
            </section>
          ))
      )}
    </aside>
  );
}
