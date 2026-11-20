import { describe, expect, it } from 'vitest';
import type { AgentTask, AgentTasks } from './tasks';
import { taskGroups, taskLine, taskMenuLine, taskSubLine } from './taskWords';

const at = (h: number, m = 0) => new Date(2026, 10, 19, h, m).getTime();
const t = (over: Partial<AgentTask> = {}): AgentTask => ({
  id: 'x',
  title: 'Do it',
  source: 'user',
  state: 'next',
  createdAt: at(9),
  updatedAt: at(9),
  chased: 0,
  lastChasedAt: 0,
  ...over,
});
const list = (open: AgentTask[], recent: AgentTask[] = [], doing: string | null = null) =>
  ({
    agentId: 'a',
    name: 'A',
    role: '',
    doing,
    open,
    recent,
    overloaded: false,
    stuck: 0,
  }) as AgentTasks;

describe('task words', () => {
  it('says the line under the name from the Mac’s counts, or nothing', () => {
    expect(taskLine(undefined)).toBeNull();
    expect(taskLine({ doing: 'Drafting intros', toDo: 5, waits: 1 })).toEqual({
      doing: 'Drafting intros',
      counts: '5 to do · 1 waits',
      waits: 1,
    });
    expect(taskLine({ toDo: 2, waits: 0 })).toEqual({ doing: null, counts: '2 to do', waits: 0 });
    expect(taskLine({ toDo: 2, waits: 3 })?.counts).toBe('2 to do · 3 wait');
  });

  it('says the menu row', () => {
    expect(taskMenuLine({ toDo: 5, waits: 1 })).toBe('1 waits · 5 to do');
    expect(taskMenuLine({ toDo: 5, waits: 0 })).toBe('5 to do');
    expect(taskMenuLine(undefined)).toBe('Nothing on the list');
  });

  it('words who asked and when', () => {
    expect(taskSubLine(t({ createdAt: at(22, 5) }))).toBe('you asked 22:05');
    expect(
      taskSubLine(t({ source: 'agent', from: { id: 'm', name: 'Mail' }, createdAt: at(9, 10) }))
    ).toBe('from Mail · 09:10');
    expect(taskSubLine(t({ state: 'waiting', waitingOn: 'Dana', updatedAt: at(20, 14) }))).toBe(
      'since 20:14 · on Dana'
    );
  });

  it('groups in a fixed order, Done being today only', () => {
    const now = at(23);
    const g = taskGroups(
      list(
        [t({ state: 'doing' }), t(), t({ state: 'stuck' })],
        [
          t({ state: 'done', updatedAt: at(21) }),
          t({ state: 'done', updatedAt: at(1) - 86_400_000 }),
          t({ state: 'dropped', updatedAt: at(21) }),
        ]
      ),
      now
    );
    expect([g.doing.length, g.next.length, g.waits.length, g.done.length]).toEqual([1, 1, 1, 1]);
  });
});
