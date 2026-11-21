import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChromeNotice } from './ChromeNotice';
import { ModalProvider } from '../../contexts/ModalContext';
import { chromeNeedsAttention, reachedForChrome, type UserChromeStatus } from '../../lib/userChrome';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
}));

const status = (over: Partial<UserChromeStatus> = {}): UserChromeStatus =>
  ({
    supported: true,
    enabled: false,
    listening: false,
    chromeInstalled: true,
    host: 'missing',
    steps: {},
    browsers: [],
    updateNeeded: false,
    management: { machine: [], profiles: [] },
    route: { route: 'none', why: 'not_set_up' },
    ...over,
  }) as UserChromeStatus;

beforeEach(() => {
  cleanup();
  invoke.mockReset();
});

describe('chromeNeedsAttention', () => {
  it('is true until it is on and a Chrome is connected, and never on a guess', () => {
    expect(chromeNeedsAttention(null)).toBe(false);
    expect(chromeNeedsAttention(status())).toBe(true);
    expect(chromeNeedsAttention(status({ enabled: true }))).toBe(true);
    expect(
      chromeNeedsAttention(
        status({
          enabled: true,
          browsers: [{ profileId: 'a', label: '', extensionVersion: '1', connectedAt: 1 }],
        })
      )
    ).toBe(false);
    expect(chromeNeedsAttention(status({ supported: false }))).toBe(false);
  });
});

describe('ChromeNotice', () => {
  it('says it isn’t installed, with one button that turns it on', async () => {
    invoke.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === 'agents_user_chrome_set_enabled' ? status({ enabled: true }) : status()
      )
    );
    render(
      <ModalProvider>
        <ChromeNotice />
      </ModalProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Install Mogbot for Chrome' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('agents_user_chrome_set_enabled', { on: true })
    );
  });

  it('shows nothing once connected', async () => {
    invoke.mockResolvedValue(
      status({
        enabled: true,
        browsers: [{ profileId: 'a', label: '', extensionVersion: '1', connectedAt: 1 }],
      })
    );
    render(
      <ModalProvider>
        <ChromeNotice />
      </ModalProvider>
    );
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.queryByTestId('chrome-notice')).toBeNull();
  });
});

describe('reachedForChrome', () => {
  const step = (label: string) => ({ label });
  it('is true only when the newest turn reached for the user’s Chrome', () => {
    expect(reachedForChrome([])).toBe(false);
    expect(reachedForChrome([{ kind: 'agent' }])).toBe(false);
    expect(reachedForChrome([{ kind: 'agent', work: { steps: [step('Read Hero.tsx')] } }])).toBe(
      false
    );
    expect(
      reachedForChrome([{ kind: 'agent', work: { steps: [step('Using your Chrome · example.com')] } }])
    ).toBe(true);
    // An older turn's browser use doesn’t count once the user has spoken again.
    expect(
      reachedForChrome([
        { kind: 'agent', work: { steps: [step('Used your Chrome')] } },
        { kind: 'user' },
        { kind: 'agent', work: { steps: [step('Ran npm test')] } },
      ])
    ).toBe(false);
  });
});
