import type { Agent, TeamSetupView } from '@shipstudio/companion-protocol';
import { attentionCounts, nextNeedsYou } from '../src/lib/agents';
import { buildHome, homeSections, quietAgentIds } from '../src/lib/home';
import { feedItems } from '../src/lib/needsYou';
import { agent, msg } from './helpers';

const a = (id: string, over: Partial<Agent> = {}) =>
  agent({ id, name: id, isMain: false, pinned: false, hidden: false, lastActivityAt: 0, ...over });
const waiting = { pendingApprovals: 1 } as const;

/** 16 imported agents waiting on logins, as the owner's phone had: setup open, none greeted. */
function imported(n = 16) {
  const team = Array.from({ length: n }, (_, i) =>
    a(`imp${i}`, { lastActivityAt: 100 + i, ...(i < 5 ? waiting : {}) })
  );
  const setup: TeamSetupView = {
    id: 's',
    source: 'Grok Bot',
    steps: [
      {
        id: 'hello',
        state: 'open',
        agents: team.map((t) => ({
          agentId: t.id,
          agentName: t.name,
          color: 'blue',
          state: 'quiet' as const,
        })),
      },
    ],
    done: 0,
    total: 1,
    complete: false,
    agents: n,
    setAside: 0,
    dismissed: false,
  } as TeamSetupView;
  return { team, setup };
}

describe('Home: the Chief first, then pinned, then the rest', () => {
  const chief = a('chief', { isMain: true, pinned: true, lastActivityAt: 1 });

  it('the Chief is always the first row, even when it is the oldest and others need you', () => {
    const { team, setup } = imported();
    const home = buildHome([...team, chief], setup);
    expect(home.chief?.id).toBe('chief');
    expect([...home.pinned, ...home.rest].some((x) => x.id === 'chief')).toBe(false);
  });

  it('agents being set up are quiet, and leave the counts to the checklist', () => {
    const { team, setup } = imported();
    const home = buildHome([chief, ...team], setup);
    expect(home.quiet.size).toBe(16);
    expect(attentionCounts([chief, ...team], setup).needYou).toBe(0);
    expect(nextNeedsYou([chief, ...team], {}, home.quiet)).toBeNull();
  });

  it('no bar for what waits on you: the Catch up tab says it, once', () => {
    const designer = a('Designer', { lastActivityAt: 50, ...waiting });
    const home = buildHome([chief, designer], null);
    expect(home).not.toHaveProperty('bar');
    // The waiting agent still sorts up, where its row's own label says why.
    expect(home.rest.map((x) => x.id)).toEqual(['Designer']);
  });

  it('pinned next, then the rest: what needs you first, then most recent', () => {
    const pinned = a('Pinned', { pinned: true, lastActivityAt: 5 });
    const old = a('Old', { lastActivityAt: 10 });
    const fresh = a('Fresh', { lastActivityAt: 30 });
    const asking = a('Asking', { lastActivityAt: 20, ...waiting });
    const hidden = a('Hidden', { hidden: true, lastActivityAt: 99 });
    const home = buildHome([old, fresh, asking, pinned, hidden, chief], null);
    expect(home.pinned.map((x) => x.id)).toEqual(['Pinned']);
    expect(home.rest.map((x) => x.id)).toEqual(['Asking', 'Fresh', 'Old']);
    expect(home.hidden.map((x) => x.id)).toEqual(['Hidden']);
  });

  it('a finished or dismissed setup quiets no one', () => {
    const { setup } = imported(3);
    expect(quietAgentIds({ ...setup, complete: true }).size).toBe(0);
    expect(quietAgentIds({ ...setup, dismissed: true }).size).toBe(0);
  });
});

describe('one count: the cards the list shows', () => {
  const card = (id: string, agentId: string, ts: number) =>
    msg(id, ts, {
      agentId,
      kind: 'approval',
      text: '',
      approval: { requestId: id, title: 'Run a command', detail: 'ls', status: 'pending' },
    });

  it('counts cards, not agents: the Chief with three requests is three', () => {
    const chief = a('chief', { isMain: true, pendingApprovals: 3 });
    const team = Array.from({ length: 4 }, (_, i) => a(`t${i}`, { lastActivityAt: i, ...waiting }));
    const chats = {
      chief: { messages: [card('c1', 'chief', 1), card('c2', 'chief', 2), card('c3', 'chief', 3)] },
      ...Object.fromEntries(team.map((t, i) => [t.id, { messages: [card(`m${i}`, t.id, i)] }])),
    };
    // Five agents wait, seven requests: the badge says what the list shows.
    expect(attentionCounts([chief, ...team]).needYou).toBe(5);
    expect(feedItems([chief, ...team], chats, null)).toHaveLength(7);
  });

  it('an agent whose cards this phone hasn’t loaded yet is one row until they are', () => {
    const designer = a('Designer', { pendingApprovals: 2 });
    expect(feedItems([designer], {}, null)).toHaveLength(1);
  });
});

describe('homeSections', () => {
  const team = [
    a('chief', { isMain: true }),
    a('web', { folder: 'f1', lastActivityAt: 3 }),
    a('pin', { folder: 'f1', pinned: true, lastActivityAt: 1 }),
    a('seo', { folder: 'f2', lastActivityAt: 2 }),
    a('loose', { lastActivityAt: 4 }),
    a('gone', { folder: 'deleted', lastActivityAt: 0 }),
  ];
  const home = buildHome(team, null);
  const shape = (v: Parameters<typeof homeSections>[1]) =>
    homeSections(home, v).map((s) => [s.title, s.agents.map((x) => x.id)]);
  const folders = [
    { id: 'f1', name: 'Website' },
    { id: 'f2', name: 'SEO' },
    { id: 'f3', name: 'Empty' },
  ];

  it('with no folders, one untitled run, pinned first, as before', () => {
    expect(shape(undefined)).toEqual([[null, ['pin', 'loose', 'web', 'seo', 'gone']]]);
  });

  it('pinned above the folders, then each folder with agents, then the rest', () => {
    expect(shape({ folders, pinned: 'top' })).toEqual([
      ['Pinned', ['pin']],
      ['Website', ['web']],
      ['SEO', ['seo']],
      ['Not in a folder', ['loose', 'gone']],
    ]);
  });

  it('pinned first in their own folder when the Mac says so', () => {
    expect(shape({ folders, pinned: 'inFolder' })).toEqual([
      ['Website', ['pin', 'web']],
      ['SEO', ['seo']],
      ['Not in a folder', ['loose', 'gone']],
    ]);
  });
});
