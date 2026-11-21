/**
 * The Catch up tab, rendered: the headline count, one group per agent, a
 * short low-risk card answered on its row while a risky one only says
 * Review, an answered card leaving, and the all-clear handing you to Agents.
 */

import type { AgentMessage, Approval, WelcomeFrame } from '@shipstudio/companion-protocol';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CatchUp from '../src/app/(tabs)/catch-up/index';
import { setApp } from '../src/lib/store';
import { agent, msg } from './helpers';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockAnswer = jest.fn((..._args: unknown[]) => Promise.resolve());

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: jest.fn() }),
    useFocusEffect: (fn: () => void | (() => void)) => useEffect(fn, [fn]),
    Stack: { Screen: () => null },
  };
});
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const preset: Record<string, unknown> = {};
  for (const k of ['duration', 'delay', 'reduceMotion']) preset[k] = () => preset;
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text },
    FadeIn: preset,
    FadeOut: preset,
    LinearTransition: preset,
    ReduceMotion: { System: 'system' },
    interpolate: () => 1,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: RN.View };
});
jest.mock('../src/lib/session', () => ({
  canCall: () => true,
  describeError: String,
  loadLatest: () => Promise.resolve(),
  answerApproval: (...args: unknown[]) => mockAnswer(...args),
  discardCopy: jest.fn(),
  keepCopy: jest.fn(),
  unpair: jest.fn(),
}));
jest.mock('../src/lib/landing', () => ({
  loadSeen: () => Promise.resolve(Date.now()),
  markSeen: () => {},
}));
jest.mock('../src/lib/haptics', () => ({
  haptic: { select: () => {}, success: () => {}, warning: () => {}, error: () => {} },
}));
jest.mock('../src/components/ConnectionPill', () => ({
  ConnectionBar: () => null,
  useNow: () => Date.now(),
}));
jest.mock('../src/components/AgentKey', () => ({ AgentKey: () => null }));

import { endRun, startRun } from '../src/lib/catchUpEntry';
const approval = (requestId: string, over: Partial<Approval> = {}): Approval =>
  ({ requestId, title: 'Run a command', detail: 'ls', status: 'pending', ...over }) as Approval;
const ask = (id: string, agentId: string, ts: number, over: Partial<Approval> = {}) =>
  msg(id, ts, { agentId, kind: 'approval', text: '', approval: approval(id, over) });

const site = agent({ id: 'site', name: 'Acme Site', isMain: false, pendingApprovals: 1 });
const ops = agent({ id: 'ops', name: 'Ops', isMain: false, pendingApprovals: 1 });

function state(chats: Record<string, AgentMessage[]>, agents = [site, ops]) {
  setApp({
    overview: { agents, engineReady: true, engines: [] } as never,
    link: { kind: 'connected' } as never,
    welcome: { methods: ['agents.answerApproval'], features: [] } as unknown as WelcomeFrame,
    chats: Object.fromEntries(
      Object.entries(chats).map(([id, messages]) => [id, { messages, more: false, loaded: true }])
    ),
    teamSetup: null,
  });
}

beforeEach(() => {
  endRun();
  jest.useFakeTimers();
  mockPush.mockClear();
  mockNavigate.mockClear();
  mockAnswer.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Catch up', () => {
  it('leads with one card into the one-at-a-time flow, then the list to pick from', async () => {
    state({
      site: [
        ask('s1', 'site', 10, { risk: 'low', title: 'List files', summary: 'List the folder' }),
      ],
      ops: [ask('o1', 'ops', 20, { risk: 'high', title: 'Delete files', detail: 'rm -r out' })],
    });
    await render(<CatchUp />);
    expect(screen.getByText('2 things need you')).toBeTruthy();
    expect(screen.getByText('From 2 agents')).toBeTruthy();
    // No estimate: the app shows only what it knows.
    expect(screen.queryByText(/minute/)).toBeNull();
    // The list is quiet: what each wants, no answers on it.
    expect(screen.getByText('Or pick one')).toBeTruthy();
    expect(screen.getByText('List files')).toBeTruthy();
    expect(screen.getByText('Delete files')).toBeTruthy();
    expect(screen.queryByText('Allow')).toBeNull();
    expect(screen.queryByText('One at a time')).toBeNull();

    // The card starts the flow; a row opens it at that one.
    await act(async () => {
      await fireEvent.press(screen.getByText('Start catching up'));
    });
    expect(mockPush).toHaveBeenCalledWith('/one-at-a-time');
    await act(async () => {
      await fireEvent.press(screen.getByText('Delete files'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/one-at-a-time',
      params: { agent: 'ops', message: 'o1' },
    });
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it('an answered card leaves: one left says what it is and Review it', async () => {
    state({
      site: [ask('s1', 'site', 10, { risk: 'low' })],
      ops: [ask('o1', 'ops', 20, { risk: 'high', title: 'Delete files' })],
    });
    await render(<CatchUp />);
    expect(screen.getByText('2 things need you')).toBeTruthy();
    await act(async () => {
      state(
        {
          site: [ask('s1', 'site', 10, { risk: 'low', status: 'allowed' })],
          ops: [ask('o1', 'ops', 20, { risk: 'high', title: 'Delete files' })],
        },
        [{ ...site, pendingApprovals: 0 }, ops]
      );
    });
    expect(screen.getByText('1 thing needs you')).toBeTruthy();
    expect(screen.getByText('Ops · Delete files')).toBeTruthy();
    expect(screen.getByText('Review it')).toBeTruthy();
    expect(screen.queryByText('Or pick one')).toBeNull();
  });

  it('back from part of a run: what is left, what is done, Continue', async () => {
    startRun(5);
    state({
      site: [ask('s1', 'site', 10)],
      ops: [ask('o1', 'ops', 20)],
    });
    await render(<CatchUp />);
    expect(screen.getByText('2 left')).toBeTruthy();
    expect(screen.getByText('3 done · from 2 agents')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('all clear: says so, and hands you to Agents', async () => {
    state({ site: [], ops: [] }, [
      { ...site, pendingApprovals: 0 },
      { ...ops, pendingApprovals: 0 },
    ]);
    await render(<CatchUp />);
    expect(screen.getByText('All caught up')).toBeTruthy();
    void fireEvent.press(screen.getByText('Go to Agents'));
    expect(mockNavigate).toHaveBeenCalledWith('/agents');
  });
});
