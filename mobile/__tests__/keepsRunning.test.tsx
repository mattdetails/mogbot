/**
 * A turn past half a minute says where it runs: people kept the app open,
 * thinking closing it would stop the work (Cade, 2026-11-14).
 */

import { render, screen } from '@testing-library/react-native';
import { KEEPS_RUNNING_AFTER_MS, keepsRunning, WorkingRow } from '../src/components/chat';
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
jest.mock('../src/components/work', () => ({ LiveStep: () => null, WorkLine: () => null }));
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

const turn = (startedAt: number) =>
  agent({
    status: {
      state: 'working',
      since: startedAt,
      work: {
        startedAt,
        stepCount: 1,
        steps: [],
        fileCount: 0,
        doing: 'Reading',
        lastSignAt: startedAt,
      },
    } as never,
  });

describe('a long turn says where it runs', () => {
  it('after half a minute, “Keeps running on your Mac”, never before', async () => {
    expect(keepsRunning('your Mac')).toBe('Keeps running on your Mac, even with this app closed.');
    const now = Date.now();
    const { rerender } = await render(<WorkingRow label="Reading" agent={turn(now)} />);
    expect(screen.queryByTestId('keeps-running')).toBeNull();
    await rerender(
      <WorkingRow label="Reading" agent={turn(now - KEEPS_RUNNING_AFTER_MS - 5_000)} />
    );
    expect(screen.getByTestId('keeps-running')).toBeTruthy();
    // In a room, under a speaker's name: not repeated per speaker.
    await rerender(
      <WorkingRow label="Reading" bare agent={turn(now - KEEPS_RUNNING_AFTER_MS - 5_000)} />
    );
    expect(screen.queryByTestId('keeps-running')).toBeNull();
  });
});
