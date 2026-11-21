/**
 * Tests for TabAccountChip — which account a terminal tab runs on, at the
 * foot of the terminal, and one click to continue it on another or choose
 * what happens when it runs out.
 *
 * What matters: the chip names the current account (or this Mac's sign-in)
 * with what it has left, says when tabs switch on their own, hides where the
 * tab can't change accounts, a pick of another account asks the Mac and
 * hands the returned notice to the tab (the current one does nothing), and
 * the run-out choice is saved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TabAccountInfo, TabAccountMode, TabAccountNotice } from '../../lib/tabAccounts';

const info = vi.hoisted(() => vi.fn<(id: string) => Promise<TabAccountInfo>>());
const choose = vi.hoisted(() => vi.fn<(id: string, acc: string) => Promise<TabAccountNotice>>());
const getMode = vi.hoisted(() => vi.fn<() => Promise<TabAccountMode>>());
const setMode = vi.hoisted(() => vi.fn<(m: TabAccountMode) => Promise<TabAccountMode>>());
vi.mock('../../lib/tabAccounts', () => ({
  tabAccountInfo: info,
  chooseTabAccount: choose,
  getTabAccountMode: getMode,
  setTabAccountMode: setMode,
  onAnyTabAccountNotice: () => Promise.resolve(() => undefined),
}));
vi.mock('../../contexts/ToastContext', () => ({
  useOptionalToast: () => ({ showToast: vi.fn() }),
}));

import {
  LOW_LEFT_PERCENT,
  TabAccountChip,
  THIS_MAC_SIGN_IN,
  leftWords,
  limitsLine,
  meterOf,
} from './TabAccountChip';

const two: TabAccountInfo = {
  current: 'Work',
  accounts: [
    {
      id: 'a1',
      name: 'Personal',
      label: 'Personal · 12% left',
      leftPercent: 12,
      out: false,
      current: false,
    },
    {
      id: 'a2',
      name: 'Work',
      label: 'Work · 61% left',
      leftPercent: 61,
      out: false,
      current: true,
    },
  ],
};

const notice: TabAccountNotice = {
  sessionId: 's1',
  kind: 'switch',
  ask: false,
  line: 'Continuing on Personal…',
  to: 'Personal',
  prompt: 'Continue where you left off.',
};

async function mount(onSwitch = vi.fn()) {
  await act(async () => {
    render(<TabAccountChip sessionId="s1" onSwitch={onSwitch} />);
    await Promise.resolve();
  });
  return onSwitch;
}

const chip = () => screen.getByRole('button', { name: /Account for this tab/ });

describe('TabAccountChip', () => {
  beforeEach(() => {
    info.mockReset();
    choose.mockReset();
    getMode.mockReset().mockResolvedValue('ask');
    setMode.mockReset().mockImplementation((m) => Promise.resolve(m));
  });

  it('names the account the tab runs on and what it has left', async () => {
    info.mockResolvedValue(two);
    await mount();
    expect(chip()).toHaveTextContent('Work61% left');
    expect(chip()).toHaveAccessibleName(/Account for this tab: Work, 61% left/);
    expect(chip()).not.toHaveTextContent('Auto');
  });

  it('says Auto while tabs move on their own', async () => {
    info.mockResolvedValue(two);
    getMode.mockResolvedValue('auto');
    await mount();
    expect(chip()).toHaveTextContent('Auto');
    expect(chip()).toHaveAccessibleName(/switches on its own when out/);
  });

  it('says this Mac’s sign-in when the tab is on none of the list', async () => {
    info.mockResolvedValue({
      ...two,
      current: null,
      accounts: two.accounts.map((a) => ({ ...a, current: false })),
    });
    await mount();
    expect(chip()).toHaveTextContent(THIS_MAC_SIGN_IN);
  });

  it('shows nothing where the tab can’t change accounts', async () => {
    info.mockResolvedValue({ accounts: [] });
    await mount();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('moves the tab on a pick, and not for the current account', async () => {
    info.mockResolvedValue(two);
    choose.mockResolvedValue(notice);
    const onSwitch = await mount();
    fireEvent.click(chip());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Work · 61% left' }));
    expect(choose).not.toHaveBeenCalled();
    fireEvent.click(chip());
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Personal · 12% left' }));
      await Promise.resolve();
    });
    expect(choose).toHaveBeenCalledWith('s1', 'a1');
    expect(onSwitch).toHaveBeenCalledWith(notice);
  });

  it('saves what happens when an account runs out', async () => {
    info.mockResolvedValue(two);
    await mount();
    fireEvent.click(chip());
    expect(screen.getByText('When an account runs out')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Switch on its own' }));
      await Promise.resolve();
    });
    expect(setMode).toHaveBeenCalledWith('auto');
    expect(chip()).toHaveTextContent('Auto');
  });
});

describe('meterOf', () => {
  it('is ink with room, amber when low, empty when out', () => {
    expect(meterOf(61, false)).toEqual({ fill: 61, level: 'ok' });
    expect(meterOf(LOW_LEFT_PERCENT, false).level).toBe('low');
    expect(meterOf(12, true)).toEqual({ fill: 0, level: 'out' });
    expect(meterOf(null, false).level).toBe('unknown');
    expect(meterOf(140, false).fill).toBe(100);
  });
});

describe('TabAccountChip — the 5-hour and weekly limits, and the offer', () => {
  beforeEach(() => {
    info.mockReset();
    choose.mockReset();
    getMode.mockReset().mockResolvedValue('ask');
  });

  it('says both limits when both were read, else the one figure', () => {
    expect(leftWords({ out: false, leftPercent: 40, sessionLeft: 40, weekLeft: 61 })).toBe(
      '5h 40% · week 61% left'
    );
    expect(leftWords({ out: false, leftPercent: 61 })).toBe('61% left');
    expect(leftWords({ out: true, leftPercent: null })).toBe('out');
    expect(limitsLine({ ...two.accounts[1], sessionLeft: 72, weekLeft: 61 })).toBe(
      '5-hour 72% left · weekly 61% left'
    );
    expect(limitsLine(two.accounts[1])).toBeNull();
  });

  it('offers another account when this one will likely run out, and Not now puts it away', async () => {
    info.mockResolvedValue({
      ...two,
      suggest: {
        estimate: true,
        toId: 'a1',
        toName: 'Personal',
        line: 'At this pace Work runs out at 3:40 PM, before its 5-hour limit refills (an estimate). Personal has 80% left.',
      },
    });
    choose.mockResolvedValue(notice);
    const onSwitch = await mount();
    expect(screen.getByText('Switch?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(chip());
      await Promise.resolve();
    });
    expect(document.querySelector('.tab-account-chip__suggest')?.textContent).toContain(
      '(an estimate)'
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Continue on Personal'));
      await Promise.resolve();
    });
    expect(choose).toHaveBeenCalledWith('s1', 'a1');
    expect(onSwitch).toHaveBeenCalledWith(notice);
  });

  it('Not now hides the offer for this tab', async () => {
    info.mockResolvedValue({
      ...two,
      suggest: { estimate: true, toId: 'a1', toName: 'Personal', line: 'At this pace …' },
    });
    await mount();
    await act(async () => {
      fireEvent.click(chip());
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Not now'));
      await Promise.resolve();
    });
    expect(screen.queryByText('Switch?')).toBeNull();
    expect(choose).not.toHaveBeenCalled();
  });
});
