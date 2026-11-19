/**
 * A short drop is silent (docs/mobile.md, "Connection status"): nothing is
 * shown for the first QUIET_MS of a continuous failure, screens act as if
 * the Mac were there, and past it the bar speaks. A refusal never waits.
 */

import type { LinkState } from '@shipstudio/companion-protocol';
import { QUIET_MS, failureDue, feelsLive, shownBar } from '../src/lib/connection';

const T0 = 1_700_000_000_000;
const down = (since = T0): LinkState => ({
  kind: 'reconnecting',
  lastSeenAt: since - 1000,
  nextTryAt: since + 5000,
  since,
});
const state = (link: LinkState, extra: object = {}) =>
  ({ link, phoneOnline: true, syncedAt: 0, ...extra }) as never;

describe('short drops are silent', () => {
  it('shows nothing for a 90-second drop, in every kind of failure', () => {
    const now = T0 + 90_000;
    expect(shownBar(state(down()), now)).toBeNull();
    expect(shownBar(state(down(), { phoneOnline: false }), now)).toBeNull();
    expect(
      shownBar(state({ kind: 'reconnecting', lastSeenAt: T0, nextTryAt: now, since: T0, appStuck: true }), now)
    ).toBeNull();
    expect(
      shownBar(state({ kind: 'reconnecting', lastSeenAt: T0, nextTryAt: now, since: T0, relaySaid: 'mac_offline' }), now)
    ).toBeNull();
    expect(shownBar(state({ kind: 'connected', route: 'relay', since: T0, stuck: T0 }), now)).toBeNull();
  });

  it('shows the bar once a drop has gone on for 4 minutes', () => {
    const now = T0 + 4 * 60_000;
    const bar = shownBar(state(down()), now);
    expect(bar).not.toBeNull();
    expect(bar?.tone).toBe('problem');
    expect(shownBar(state({ kind: 'connected', route: 'relay', since: T0, stuck: T0 }), now)?.kind).toBe('stuck');
  });

  it('turns on exactly at QUIET_MS', () => {
    expect(failureDue(down(), T0 + QUIET_MS - 1)).toBe(false);
    expect(failureDue(down(), T0 + QUIET_MS)).toBe(true);
  });

  it('screens act as if the Mac were there for the whole quiet spell', () => {
    expect(feelsLive(down(), T0 + 90_000)).toBe(true);
    expect(feelsLive(down(), T0 + 4 * 60_000)).toBe(false);
    expect(feelsLive({ kind: 'connected', route: 'relay', since: T0 }, T0)).toBe(true);
  });

  it('dates a state with no `since` from when the app first saw it down', () => {
    const link: LinkState = { kind: 'connecting', attempt: 1 };
    expect(failureDue(link, T0 + 90_000, T0)).toBe(false);
    expect(failureDue(link, T0 + 4 * 60_000, T0)).toBe(true);
  });

  it('a refusal that needs the person is never held back', () => {
    const link: LinkState = { kind: 'refused', reason: 'revoked' } as never;
    expect(failureDue(link, T0)).toBe(true);
    expect(feelsLive(link, T0)).toBe(false);
  });
});
