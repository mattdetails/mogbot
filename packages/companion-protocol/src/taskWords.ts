/**
 * The task list as people read it: the line under an agent's name, the four
 * groups and each row's sub line. The Mac decides every state (`tasks.ts`);
 * this words them, one place for desk and phone.
 */
import type { TaskCounts } from './model';
import type { AgentTask, AgentTasks } from './tasks';

export const TASK_WORDS = {
  title: 'Tasks',
  doing: 'Doing',
  next: 'Next',
  waits: 'Waits on you',
  doneToday: 'Done today',
  empty: 'Nothing on the list. Ask for something and it lands here.',
  nothing: 'Nothing on the list',
  /** "Couldn't reach your Mac. This list is from 20:14." */
  stale: (mac: string, at: string) => `Couldn’t reach ${mac}. This list is from ${at}.`,
} as const;

/** "22:05", the 24-hour clock the lists use. */
export const taskClock = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * The line under the agent's name when it has open work (`Agent.tasks`): what
 * it is doing, then "· 5 to do · 1 waits". Null when the Mac sent nothing:
 * nothing open and not working.
 */
export function taskLine(
  tasks: TaskCounts | null | undefined
): { doing: string | null; counts: string; waits: number } | null {
  if (!tasks) return null;
  const parts = [`${tasks.toDo} to do`];
  if (tasks.waits > 0) parts.push(`${tasks.waits} ${tasks.waits === 1 ? 'waits' : 'wait'}`);
  return { doing: tasks.doing?.trim() || null, counts: parts.join(' · '), waits: tasks.waits };
}

/** The ⋯ menu's Tasks subtitle: "1 waits · 5 to do". */
export function taskMenuLine(tasks: TaskCounts | null | undefined): string {
  if (!tasks) return TASK_WORDS.nothing;
  return tasks.waits > 0
    ? `${tasks.waits} ${tasks.waits === 1 ? 'waits' : 'wait'} · ${tasks.toDo} to do`
    : `${tasks.toDo} to do`;
}

/** A row's sub line: who asked and when, or since when it waits. */
export function taskSubLine(t: AgentTask): string {
  const asked =
    t.source === 'agent' && t.from
      ? `from ${t.from.name} · ${taskClock(t.createdAt)}`
      : t.source === 'own'
        ? `its own step · ${taskClock(t.createdAt)}`
        : `you asked ${taskClock(t.createdAt)}`;
  if (t.state === 'waiting' || t.state === 'stuck') {
    const on = t.waitingOn ? ` · on ${t.waitingOn}` : '';
    return `since ${taskClock(t.updatedAt)}${on}`;
  }
  return asked;
}

export interface TaskGroups {
  doing: AgentTask[];
  next: AgentTask[];
  waits: AgentTask[];
  done: AgentTask[];
}

/** The four groups in their fixed order; "Done today" is what closed since midnight. */
export function taskGroups(tasks: AgentTasks, now: number): TaskGroups {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return {
    doing: tasks.open.filter((t) => t.state === 'doing'),
    next: tasks.open.filter((t) => t.state === 'next'),
    waits: tasks.open.filter((t) => t.state === 'waiting' || t.state === 'stuck'),
    done: tasks.recent.filter((t) => t.state === 'done' && t.updatedAt >= midnight.getTime()),
  };
}
