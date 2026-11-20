/**
 * An old "needs you in its browser" card (the agent browser and its Step in
 * are gone) is one muted line on the phone: no card, no Allow, no Deny,
 * never a crash.
 */

import { STEP_IN_RETIRED_LINE, type AgentMessage } from '@shipstudio/companion-protocol';
import { render, screen } from '@testing-library/react-native';
import { MessageRow } from '../src/components/chat';
import { agent } from './helpers';

jest.mock('react-native-reanimated', () => {
  const { View, FlatList } = jest.requireActual<typeof import('react-native')>('react-native');
  const preset: Record<string, unknown> = {};
  for (const k of ['duration', 'delay', 'springify', 'damping']) preset[k] = () => preset;
  return {
    __esModule: true,
    default: { View, FlatList },
    FadeIn: preset,
    FadeInDown: preset,
    FadeOut: preset,
    ZoomIn: preset,
    ZoomOut: preset,
    LinearTransition: preset,
    useReducedMotion: () => true,
    useSharedValue: (v: unknown) => ({ value: v, set: () => {} }),
    useAnimatedStyle: () => ({}),
    withSequence: () => 0,
    withTiming: () => 0,
    Easing: { out: () => 0, inOut: () => 0, quad: 0 },
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-haptics', () => ({}));
jest.mock('../src/lib/haptics', () => ({
  haptic: {
    light: jest.fn(),
    select: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../src/lib/session', () => ({
  answerApproval: jest.fn(),
  keepCopy: jest.fn(),
  discardCopy: jest.fn(),
  saveSecret: jest.fn(),
  currentTransport: () => ({ route: 'tailscale' }),
  secretRouteProblem: () => null,
  describeError: String,
  discardPending: jest.fn(),
  editPending: jest.fn(),
  send: jest.fn(),
  resend: jest.fn(),
  revokePermission: jest.fn(),
  canCall: () => false,
}));


const old: AgentMessage = {
  id: 'm1',
  agentId: 'browse',
  ts: 1,
  kind: 'approval',
  text: '',
  approval: {
    requestId: 'req_stepin',
    title: 'Browser Helper needs you in its browser: enter the code',
    status: 'expired',
    stepIn: { reason: 'enter the code', site: 'portal.example', url: 'https://portal.example', tab: 2 },
  },
};

describe('an old step-in card', () => {
  it('is one plain line, with nothing to answer', async () => {
    await render(<MessageRow message={old} agent={agent()} queued={false} onError={jest.fn()} />);
    expect(screen.getByText(STEP_IN_RETIRED_LINE)).toBeTruthy();
    expect(screen.queryByText('Allow')).toBeNull();
    expect(screen.queryByText('Deny')).toBeNull();
    expect(screen.queryByText('Step in')).toBeNull();
    expect(screen.queryByText('Not now')).toBeNull();
  });
});
