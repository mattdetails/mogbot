/**
 * Catch up, one at a time: Later on the last card ends it on "You’re caught
 * up", with what only happened listed under "While you were away".
 */

import type { AgentMessage, Approval, WelcomeFrame } from '@shipstudio/companion-protocol';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CatchUp from '../src/app/one-at-a-time';
import { setApp } from '../src/lib/store';
import { agent, msg } from './helpers';

const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: mockBack }),
    useFocusEffect: (fn: () => void | (() => void)) => useEffect(fn, [fn]),
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
    FadeInRight: preset,
    FadeOut: preset,
    FadeOutLeft: preset,
    LinearTransition: preset,
    useReducedMotion: () => true,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/lib/session', () => ({
  canCall: () => true,
  describeError: String,
  loadLatest: () => Promise.resolve(),
  setOpenChat: () => {},
  answerApproval: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/lib/haptics', () => ({
  haptic: {
    light: () => {},
    select: () => {},
    success: () => {},
    warning: () => {},
    error: () => {},
  },
}));
jest.mock('../src/components/agent', () => ({ Spinner: () => null }));
jest.mock('../src/components/AgentKey', () => ({ AgentKey: () => null }));
jest.mock('../src/components/chat', () => ({ MessageRow: () => null }));
jest.mock('../src/components/ApprovalCard', () => ({
  ApprovalCard: () => null,
  useArmed: () => true,
}));

const ask: AgentMessage = msg('s1', 10, {
  agentId: 'site',
  kind: 'approval',
  text: '',
  approval: {
    requestId: 's1',
    title: 'Run a command',
    detail: 'ls',
    status: 'pending',
  } as Approval,
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('Later on the last card ends on “You’re caught up”, listing what only happened', async () => {
  const site = agent({ id: 'site', name: 'Acme Site', isMain: false, pendingApprovals: 1 });
  const ops = agent({
    id: 'ops',
    name: 'Ops',
    isMain: false,
    unread: 1,
    preview: 'Inbox sweep ran',
  } as never);
  setApp({
    overview: { agents: [site, ops], engineReady: true, engines: [] } as never,
    link: { kind: 'connected' } as never,
    welcome: { methods: ['agents.answerApproval'], features: [] } as unknown as WelcomeFrame,
    chats: {
      site: { messages: [ask], more: false, loaded: true },
      ops: { messages: [], more: false, loaded: true },
    },
    teamSetup: null,
  });
  await render(<CatchUp />);
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(screen.getByText('1 left')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Later'));
  });
  expect(screen.getByText('You’re caught up')).toBeTruthy();
  expect(screen.getByText('While you were away')).toBeTruthy();
});
