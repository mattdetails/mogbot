/**
 * The phone half of Tasks: Settings → Notifications → End-of-day check-in
 * reads the Mac (nothing before it answers), offers the common evenings and
 * Off, writes with `agents.setEndOfDay`, and shows nothing on a Mac that
 * doesn't serve it; the agent sheet's "Open asks" lists what `agents.tasks`
 * returns, in the Mac's states, and is absent on a Mac without it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { endOfDayLabel, taskStateLabel } from '@shipstudio/companion-protocol';
import * as real from '../../packages/companion-protocol/src/fixtures.gen';

const mockCall = jest.fn((method: string, params?: Record<string, unknown>) =>
  Promise.resolve(
    method === 'agents.endOfDay'
      ? real.agentsEndOfDay
      : method === 'agents.tasks'
        ? real.agentsTasks
        : { on: params?.on, at: params?.at }
  )
);
jest.mock('../src/lib/session', () => ({
  call: (m: string, p?: Record<string, unknown>) => mockCall(m, p),
  describeError: (e: unknown) => String(e),
}));
// The link's own rules (feelsLive) need a full link state; here it is simply up.
jest.mock('../src/lib/linkLive', () => ({ useLinkLive: () => true }));
const mockChoose = jest.fn();
jest.mock('../src/components/menu', () => ({
  choose: (...a: unknown[]) => mockChoose(...a),
}));
jest.mock('../src/lib/haptics', () => ({ haptic: { select: jest.fn(), error: jest.fn() } }));
jest.mock('../src/lib/appearance', () => ({
  makeStyles: () => () => ({}),
  useColors: () => ({ textSecondary: '#000' }),
}));
jest.mock('../src/components/ui', () => {
  const { Text, Pressable, View } = jest.requireActual('react-native');
  return {
    tap: jest.fn(),
    groupSurface: () => ({}),
    pageRhythm: () => ({ title: {}, note: {} }),
    SectionTitle: ({ title }: { title: string }) => <Text>{title}</Text>,
    T: ({ children }: { children: unknown }) => <Text>{children as never}</Text>,
    Section: ({
      title,
      footer,
      children,
    }: {
      title: string;
      footer?: string;
      children: unknown;
    }) => (
      <View>
        <Text>{title}</Text>
        {children as never}
        {footer ? <Text>{footer}</Text> : null}
      </View>
    ),
    Row: ({
      label,
      value,
      detail,
      onPress,
    }: {
      label: string;
      value?: string;
      detail?: string;
      onPress?: () => void;
    }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
        {value ? <Text>{value}</Text> : null}
        {detail ? <Text>{detail}</Text> : null}
      </Pressable>
    ),
  };
});
const mockMethods = { list: ['agents.endOfDay', 'agents.setEndOfDay', 'agents.tasks'] };
jest.mock('../src/lib/store', () => ({
  useServed: (m: string) => mockMethods.list.includes(m),
  useApp: (select: (s: unknown) => unknown) => select({ link: { kind: 'connected' } }),
}));

import { EndOfDaySetting } from '../src/components/EndOfDaySetting';
import { OpenAsks } from '../src/components/OpenAsks';

describe('the end-of-day check-in on the phone', () => {
  beforeEach(() => {
    mockCall.mockClear();
    mockChoose.mockClear();
    mockMethods.list = ['agents.endOfDay', 'agents.setEndOfDay', 'agents.tasks'];
  });

  it('shows the Mac’s time, and sets an evening or off from the sheet', async () => {
    await render(<EndOfDaySetting />);
    expect(await screen.findByText('6:00 PM')).toBeTruthy();
    fireEvent.press(screen.getAllByText('End-of-day check-in')[1]);
    const [title, choices] = mockChoose.mock.calls[0] as [
      string,
      { label: string; run: () => void }[],
    ];
    expect(title).toBe('End-of-day check-in');
    expect(choices.map((c) => c.label)).toEqual([
      '4:30 PM',
      '5:00 PM',
      '5:30 PM',
      '6:00 PM',
      '6:30 PM',
      '7:00 PM',
      'Turn off',
    ]);
    // The one already set writes nothing.
    choices[3].run();
    expect(mockCall).not.toHaveBeenCalledWith('agents.setEndOfDay', expect.anything());
    await act(async () => {
      choices[4].run();
    });
    expect(mockCall).toHaveBeenCalledWith('agents.setEndOfDay', { on: true, at: 1110 });
    expect(screen.getByText('6:30 PM')).toBeTruthy();
  });

  it('is absent on a Mac that doesn’t serve it', async () => {
    mockMethods.list = [];
    await render(<EndOfDaySetting />);
    expect(screen.queryByText('End-of-day check-in')).toBeNull();
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('words the time on the 12-hour clock', () => {
    expect(endOfDayLabel({ on: true, at: 1080 })).toBe('6:00 PM');
    expect(endOfDayLabel({ on: true, at: 0 })).toBe('12:00 AM');
    expect(endOfDayLabel({ on: true, at: 750 })).toBe('12:30 PM');
    expect(endOfDayLabel({ on: false, at: 1080 })).toBe('Off');
  });
});

describe('Open asks on the agent sheet', () => {
  beforeEach(() => {
    mockCall.mockClear();
    mockMethods.list = ['agents.endOfDay', 'agents.setEndOfDay', 'agents.tasks'];
  });

  it('lists what the Mac says is open, in its states', async () => {
    await render(<OpenAsks agentId="ops" />);
    expect(await screen.findByText('Open asks')).toBeTruthy();
    expect(screen.getByText('Rotate the staging certificates')).toBeTruthy();
    expect(screen.getByText('Doing')).toBeTruthy();
    expect(screen.getByText('Send Dana the deploy notes')).toBeTruthy();
    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(screen.getByText("On Dana's reply", { exact: false })).toBeTruthy();
    expect(mockCall).toHaveBeenCalledWith('agents.tasks', { agentId: 'ops' });
  });

  it('is absent on a Mac that doesn’t serve it', async () => {
    mockMethods.list = [];
    await render(<OpenAsks agentId="ops" />);
    expect(screen.queryByText('Open asks')).toBeNull();
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('says each state in a word', () => {
    expect(taskStateLabel({ state: 'doing' })).toBe('Doing');
    expect(taskStateLabel({ state: 'waiting', waitingOn: 'Dana' })).toBe('Waiting on Dana');
    expect(taskStateLabel({ state: 'stuck' })).toBe('Stuck');
  });
});
