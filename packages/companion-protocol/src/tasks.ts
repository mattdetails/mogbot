/**
 * An agent's own task list (`agents::tasks` on the Mac) and the end-of-day
 * check-in (`agents::eod`). Read with `agents.tasks` and `agents.endOfDay`,
 * the check-in set with `agents.setEndOfDay`. The Mac decides every state;
 * a client only shows them, in the words below.
 */

/** Doing now, next in line, blocked on someone, nudged twice and still open, or closed. */
export type TaskState = 'doing' | 'next' | 'waiting' | 'stuck' | 'done' | 'dropped';

/** The user said it, another agent asked (`message_agent`) or assigned it (`task_assign`), or the agent's own step. */
export type TaskSource = 'user' | 'agent' | 'assigned' | 'own';

export interface AgentTask {
  id: string;
  title: string;
  source: TaskSource;
  /** Who asked, when another agent did. */
  from?: { id: string; name: string };
  state: TaskState;
  createdAt: number;
  updatedAt: number;
  /** On whom or what it waits, when `waiting`. */
  waitingOn?: string;
  note?: string;
  chased: number;
  lastChasedAt: number;
  /** Counts up with every change; an update naming an older one is refused. */
  version?: number;
  /** The message that asked, and the agent's that delivered it (when done). */
  askedMsg?: string;
  deliveredMsg?: string;
  /** The user has looked at it since it finished; only the user sets it. */
  seen?: boolean;
  /** Moved out of Done (after 3 days, or by hand); never deleted. */
  archived?: boolean;
}

/** One agent's list: open asks oldest first, the last few closed. */
export interface AgentTasks {
  agentId: string;
  name: string;
  role: string;
  /** What it is doing this moment, when a turn is running. */
  doing?: string | null;
  open: AgentTask[];
  recent: AgentTask[];
  overloaded: boolean;
  overloadedWhy?: string;
  stuck: number;
}

/** The end-of-day check-in: on or off, and its time (minutes after local midnight). */
export interface EndOfDay {
  on: boolean;
  at: number;
}

export const END_OF_DAY_TITLE = 'End-of-day check-in';

/** The row's one line. */
export const END_OF_DAY_DETAIL =
  'Your Chief of Staff asks once a day how the team did, from everyone’s open asks.';

/** The phone's picks. */
export const END_OF_DAY_TIMES: number[] = [
  16 * 60 + 30,
  17 * 60,
  17 * 60 + 30,
  18 * 60,
  18 * 60 + 30,
  19 * 60,
];

/** "6:00 PM", or "Off": the 12-hour clock a phone reads. */
export function endOfDayLabel(e: Pick<EndOfDay, 'on' | 'at'> | null | undefined): string {
  if (!e || !e.on) return 'Off';
  const h = Math.floor(e.at / 60) % 24;
  const m = String(e.at % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The state's word in a list. */
export function taskStateLabel(t: Pick<AgentTask, 'state' | 'waitingOn'>): string {
  switch (t.state) {
    case 'doing':
      return 'Doing';
    case 'next':
      return 'Next';
    case 'waiting':
      return t.waitingOn ? `Waiting on ${t.waitingOn}` : 'Waiting';
    case 'stuck':
      return 'Stuck';
    case 'done':
      return 'Done';
    case 'dropped':
      return 'Dropped';
  }
}
