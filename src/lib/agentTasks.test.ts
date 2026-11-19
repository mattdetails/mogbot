import { describe, expect, it } from 'vitest';
import { asksLine, taskAge, withOpenAsks, type AgentLoad, type AgentTask } from './agentTasks';

const task = (title: string, createdAt = 0): AgentTask => ({
  id: title,
  title,
  source: 'agent',
  state: 'open',
  createdAt,
  updatedAt: createdAt,
  chased: 0,
});
const load = (name: string, open: AgentTask[], extra: Partial<AgentLoad> = {}): AgentLoad => ({
  agentId: name,
  name,
  role: '',
  doing: null,
  open,
  recent: [],
  overloaded: false,
  overloadedWhy: null,
  stuck: 0,
  ...extra,
});

describe('agent task board', () => {
  it('reads ages plainly', () => {
    expect(taskAge(0, 10 * 60_000)).toBe('10m');
    expect(taskAge(0, 5 * 3_600_000)).toBe('5h');
    expect(taskAge(0, 3 * 86_400_000)).toBe('3d');
  });
  it('lists overloaded agents first and leaves out empty lists', () => {
    const got = withOpenAsks([
      load('A', [task('a')]),
      load('B', []),
      load('C', [task('c')], { overloaded: true }),
    ]);
    expect(got.map((l) => l.name)).toEqual(['C', 'A']);
  });
  it('shows two asks and counts the rest', () => {
    expect(asksLine(load('A', [task('one'), task('two'), task('three'), task('four')]))).toBe(
      'one · two · 2 more'
    );
    expect(asksLine(load('A', [task('one')]))).toBe('one');
  });
});
