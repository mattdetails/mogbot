/**
 * Tests for TabAccountChip — which account a terminal tab runs on, and one
 * click to continue it on another.
 *
 * What matters: the chip names the current account (or this Mac's sign-in),
 * hides where the tab can't change accounts, and a pick of another account
 * asks the Mac and hands the returned notice to the tab; the current one
 * does nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TabAccountInfo, TabAccountNotice } from '../../lib/tabAccounts';

const info = vi.hoisted(() => vi.fn<(id: string) => Promise<TabAccountInfo>>());
const choose = vi.hoisted(() => vi.fn<(id: string, acc: string) => Promise<TabAccountNotice>>());
vi.mock('../../lib/tabAccounts', () => ({
  tabAccountInfo: info,
  chooseTabAccount: choose,
  onAnyTabAccountNotice: () => Promise.resolve(() => undefined),
}));
vi.mock('../../contexts/ToastContext', () => ({
  useOptionalToast: () => ({ showToast: vi.fn() }),
}));

import { TabAccountChip, THIS_MAC_SIGN_IN } from './TabAccountChip';

const two: TabAccountInfo = {
  current: 'Work',
  accounts: [
    { id: 'a1', name: 'Personal', label: 'Personal · 12% left', out: false, current: false },
    { id: 'a2', name: 'Work', label: 'Work · 61% left', out: false, current: true },
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

describe('TabAccountChip', () => {
  beforeEach(() => {
    info.mockReset();
    choose.mockReset();
  });

  it('names the account the tab runs on', async () => {
    info.mockResolvedValue(two);
    await mount();
    expect(screen.getByRole('button', { name: /Account for this tab: Work/ })).toHaveTextContent(
      'AccountWork'
    );
  });

  it('says this Mac’s sign-in when the tab is on none of the list', async () => {
    info.mockResolvedValue({ ...two, current: null });
    await mount();
    expect(screen.getByRole('button', { name: /Account for this tab/ })).toHaveTextContent(
      THIS_MAC_SIGN_IN
    );
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
    fireEvent.click(screen.getByRole('button', { name: /Account for this tab/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Work · 61% left' }));
    expect(choose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Account for this tab/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Personal · 12% left' }));
      await Promise.resolve();
    });
    expect(choose).toHaveBeenCalledWith('s1', 'a1');
    expect(onSwitch).toHaveBeenCalledWith(notice);
  });
});
