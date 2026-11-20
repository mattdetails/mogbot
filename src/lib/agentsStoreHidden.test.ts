/**
 * A window nobody can see gets no frames, so held status events used to apply
 * on the 50 ms backstop: twenty renders a second of a window no one looks at.
 * Hidden, they wait up to a second, and apply at once when it's shown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { __resetAgentsStore, getAgentsSnapshot, subscribeAgents } from './agentsStore';
import { AGENT_EVENTS } from './agents';

let hidden = false;
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const state = () => getAgentsSnapshot().agents[0]?.status.state;

beforeEach(() => {
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  // A hidden window gets no frames: only the timer applies what's held.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  mockIPC(
    (cmd) => {
      if (cmd === 'agents_overview')
        return { agents: [{ id: 'a', name: 'a', status: { state: 'idle' } }], engineReady: true };
      if (cmd === 'agents_rooms' || cmd === 'agents_messages') return [];
      return null;
    },
    { shouldMockEvents: true }
  );
});

afterEach(() => {
  __resetAgentsStore();
  clearMocks();
  vi.unstubAllGlobals();
});

describe('held events in a hidden window', () => {
  it('wait instead of applying every 50 ms, and apply as soon as the window is shown', async () => {
    const off = subscribeAgents(() => {});
    await settle();
    await settle();
    expect(state()).toBe('idle');

    hidden = true;
    await emit(AGENT_EVENTS.status, { agentId: 'a', status: { state: 'working' } });
    await settle(120);
    expect(state()).toBe('idle');

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state()).toBe('working');
    off();
  });

  it('a visible window still applies on the backstop', async () => {
    const off = subscribeAgents(() => {});
    await settle();
    await settle();
    await emit(AGENT_EVENTS.status, { agentId: 'a', status: { state: 'working' } });
    await settle(120);
    expect(state()).toBe('working');
    off();
  });
});
