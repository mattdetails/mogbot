import type { UsageInventory } from '@shipstudio/companion-protocol';
import { keepReadings } from '../src/lib/usageSheet';

const NOW = 1_000_000;
const line = (id: string, windows: unknown[], signedIn = true) =>
  ({ engine: 'claude', id, name: id, signedIn, windows }) as never;
const inv = (accounts: unknown[]) => ({ accounts }) as unknown as UsageInventory;
const w = (resetsAt: number) => ({ kind: 'weekly', usedPercent: 40, resetsAt, limited: false, observedAt: 1 });

describe('keepReadings', () => {
  it('keeps an account’s last reading when the new read has none', () => {
    const out = keepReadings(inv([line('a', [w(NOW + 10)])]), inv([line('a', [])]), NOW);
    expect(out.accounts[0].windows).toHaveLength(1);
  });
  it('drops a kept window once it has refilled', () => {
    const out = keepReadings(inv([line('a', [w(NOW - 1)])]), inv([line('a', [])]), NOW);
    expect(out.accounts[0].windows).toHaveLength(0);
  });
  it('a new reading always wins, and signed-out accounts keep nothing', () => {
    const fresh = keepReadings(inv([line('a', [w(NOW + 10)])]), inv([line('a', [w(NOW + 99)])]), NOW);
    expect(fresh.accounts[0].windows[0].resetsAt).toBe(NOW + 99);
    const off = keepReadings(inv([line('a', [w(NOW + 10)])]), inv([line('a', [], false)]), NOW);
    expect(off.accounts[0].windows).toHaveLength(0);
  });
  it('no earlier read: the new one as it is', () => {
    const next = inv([line('a', [])]);
    expect(keepReadings(null, next, NOW)).toBe(next);
  });
});
