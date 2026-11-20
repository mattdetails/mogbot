import { describe, expect, it } from 'vitest';
import { gapTokens } from './messageGaps';

const row = (cls: string, attrs: Record<string, string> = {}) => {
  const el = document.createElement('div');
  el.className = cls;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const user = () => row('agent-chat__row agent-chat__row--user');
const agent = (attrs = {}) => row('agent-chat__row agent-chat__row--agent', attrs);
const card = (attrs = {}) =>
  row('agent-chat__row agent-chat__row--agent agent-chat__row--card', attrs);

describe('gapTokens', () => {
  it('gives the first row nothing', () => {
    expect(gapTokens(null, user())).toBe('');
  });
  it('names the situations a row is in', () => {
    expect(gapTokens(user(), user())).toBe('any uu');
    expect(gapTokens(agent(), agent())).toBe('any aa');
    expect(gapTokens(user(), agent())).toBe('any');
    expect(gapTokens(agent(), row('agent-note'))).toContain('quiet');
    expect(gapTokens(row('agent-note'), row('agent-peer'))).toBe('any quiet quiet-run');
  });
  it('reads the previous row’s actions and failure', () => {
    expect(gapTokens(agent({ 'data-actions': '' }), agent())).toContain('after-actions');
    expect(
      gapTokens(
        agent({ 'data-actions': '' }),
        row('agent-chat__row--agent agent-chat__row--working')
      )
    ).not.toContain('after-actions');
    expect(gapTokens(card({ 'data-failed': '', 'data-actions': '' }), agent())).toContain(
      'after-failed'
    );
  });
});
