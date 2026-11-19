/**
 * A draft to send as you, on the phone: the exact words and who gets them,
 * Discard / Edit / Send, the neutral Send. A Slack reply posts the edit; an
 * email's edit goes back to the agent as a declined draft with the new words.
 */

import type { AgentMessage } from '@shipstudio/companion-protocol';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ARM_MS } from '../src/components/ApprovalCard';
import { DraftCard } from '../src/components/DraftCard';
import { setApp } from '../src/lib/store';
import { agent } from './helpers';

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const preset: Record<string, unknown> = {};
  preset.duration = () => preset;
  preset.delay = () => preset;
  return {
    __esModule: true,
    default: { View },
    FadeIn: preset,
    FadeOut: preset,
    LinearTransition: preset,
  };
});
jest.mock('expo-haptics', () => ({}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
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
  answerApproval: jest.fn(() => Promise.resolve(null)),
  call: jest.fn(),
  describeError: String,
}));
const mockAnswer = jest.requireMock<{ answerApproval: jest.Mock }>(
  '../src/lib/session'
).answerApproval;

const message = (approval: object): AgentMessage =>
  ({ id: 'm', agentId: 'a', ts: 1, kind: 'approval', text: '', approval }) as AgentMessage;

const email = message({
  requestId: 'r1',
  title: 't',
  detail: '',
  status: 'pending',
  plan: {
    actions: [
      {
        kind: 'send',
        target: 'a@b.co',
        summary: 's',
        text: 'Subject: Hi\n\nThe words.',
      },
    ],
  },
});
const slack = message({
  requestId: 'r2',
  title: 't',
  detail: '',
  status: 'pending',
  slackReply: { channel: 'C', threadTs: '1', place: '#beta', text: 'Hello all' },
});

beforeEach(() => {
  jest.useFakeTimers();
  mockAnswer.mockClear();
  setApp({ link: { kind: 'connected' } as never });
});
afterEach(() => jest.useRealTimers());

const armed = () => act(() => jest.advanceTimersByTime(ARM_MS + 50));

it('shows who gets it and the exact words, with the neutral Send', async () => {
  await render(<DraftCard message={email} agent={agent()} onError={jest.fn()} />);
  expect(screen.getByText('a@b.co')).toBeTruthy();
  expect(screen.getByText('The words.')).toBeTruthy();
  expect(screen.getByText('Discard')).toBeTruthy();
  expect(screen.getByText('Draft in Gmail')).toBeTruthy();
  await armed();
  await act(async () => fireEvent.press(screen.getByText('Send')));
  expect(mockAnswer).toHaveBeenCalledWith('a', 'r1', true, false, undefined);
});

it('a Slack reply posts the edit; an email’s edit goes back declined with the new words', async () => {
  const { unmount } = await render(
    <DraftCard message={slack} agent={agent()} onError={jest.fn()} />
  );
  await armed();
  await act(async () => fireEvent.press(screen.getByText('Edit')));
  await act(async () =>
    fireEvent.changeText(screen.getByLabelText('What it says'), 'Hello everyone')
  );
  await act(async () => fireEvent.press(screen.getByText('Send')));
  expect(mockAnswer).toHaveBeenCalledWith('a', 'r2', true, false, 'Hello everyone');
  await unmount();
  mockAnswer.mockClear();
  await render(<DraftCard message={email} agent={agent()} onError={jest.fn()} />);
  await armed();
  await act(async () => fireEvent.press(screen.getByText('Edit')));
  await act(async () => fireEvent.changeText(screen.getByLabelText('What it says'), 'New words'));
  await act(async () => fireEvent.press(screen.getByText('Send my version')));
  expect(mockAnswer).toHaveBeenCalledWith(
    'a',
    'r1',
    false,
    false,
    expect.stringContaining('New words')
  );
});
