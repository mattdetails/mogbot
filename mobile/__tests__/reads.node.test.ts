/**
 * The phone never piles onto the Mac (lib/reads): the same read on its way
 * twice is one request, reads queue past a few at once, a fresh read is
 * answered from the last one, and any change makes what's kept old.
 */

import { createReads } from '../src/lib/reads';

/** A request that answers when the test says. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

it('the same read asked twice while it is on its way is one request', async () => {
  const reads = createReads();
  const d = deferred<string>();
  const request = jest.fn(() => d.promise);
  const a = reads.call('agents.quota', {}, request);
  const b = reads.call('agents.quota', {}, request);
  expect(request).toHaveBeenCalledTimes(1);
  d.resolve('q');
  await expect(a).resolves.toBe('q');
  await expect(b).resolves.toBe('q');
  // Once it has landed, the next one asks again.
  await reads.call('agents.quota', {}, () => Promise.resolve('q2'));
  expect(reads.last('agents.quota', {})).toBe('q2');
});

it('reads with other params, and changes, are never shared', async () => {
  const reads = createReads();
  const request = jest.fn(() => new Promise<never>(() => {}));
  void reads.call('agents.messages', { agentId: 'a' }, request);
  void reads.call('agents.messages', { agentId: 'b' }, request);
  void reads.call('agents.send', { agentId: 'a', text: 'hi', clientId: '1' }, request);
  void reads.call('agents.send', { agentId: 'a', text: 'hi', clientId: '1' }, request);
  expect(request).toHaveBeenCalledTimes(4);
});

it('no more than a few reads are at the Mac at once; changes never wait', async () => {
  const reads = createReads(Date.now, 2);
  const waiting = [deferred<number>(), deferred<number>(), deferred<number>()];
  let at = 0;
  const started: number[] = [];
  const ask = (n: number) =>
    reads.call('agents.messages', { agentId: String(n) }, () => {
      started.push(n);
      return waiting[at++].promise;
    });
  const all = [ask(1), ask(2), ask(3)];
  expect(started).toEqual([1, 2]);
  const change = jest.fn(() => Promise.resolve(null));
  void reads.call('agents.stop', { agentId: '1' }, change);
  expect(change).toHaveBeenCalledTimes(1);
  waiting[0].resolve(1);
  await all[0];
  await Promise.resolve();
  expect(started).toEqual([1, 2, 3]);
  // A read that fails gives its place up too.
  waiting[1].reject(new Error('no'));
  await expect(all[1]).rejects.toThrow('no');
  waiting[2].resolve(3);
  await expect(all[2]).resolves.toBe(3);
});

it('a fresh read is answered from the last one until it is old or something changed', async () => {
  let t = 1_000;
  const reads = createReads(() => t);
  const request = jest.fn(() => Promise.resolve(['quota']));
  await reads.fresh('agents.quota', {}, 20_000, request);
  t += 5_000;
  await reads.fresh('agents.quota', {}, 20_000, request);
  expect(request).toHaveBeenCalledTimes(1);
  // Looking at a chat changes no reading.
  await reads.call('agents.focus', { agentId: 'a' }, () => Promise.resolve(null));
  await reads.fresh('agents.quota', {}, 20_000, request);
  expect(request).toHaveBeenCalledTimes(1);
  // Old: asked again.
  t += 20_000;
  await reads.fresh('agents.quota', {}, 20_000, request);
  expect(request).toHaveBeenCalledTimes(2);
  // A change: asked again, though it was just read; what's kept still shows meanwhile.
  await reads.call('agents.accounts.use', { engine: 'claude', id: 'w1' }, () =>
    Promise.resolve([])
  );
  expect(reads.last('agents.quota', {})).toEqual(['quota']);
  await reads.fresh('agents.quota', {}, 20_000, request);
  expect(request).toHaveBeenCalledTimes(3);
});

it('another Mac keeps nothing of the last one, even an answer that lands after', async () => {
  const reads = createReads();
  const d = deferred<string>();
  const late = reads.call('agents.accounts', {}, () => d.promise);
  reads.forget();
  d.resolve('old Mac');
  await late;
  expect(reads.last('agents.accounts', {})).toBeUndefined();
});

it('a first read (the chat on screen) goes ahead of ten slow background reads', async () => {
  const reads = createReads(Date.now, 2);
  const order: string[] = [];
  const hold: Array<() => void> = [];
  const slow = (name: string) => () =>
    new Promise<string>((res) => {
      hold.push(() => {
        order.push(name);
        res(name);
      });
    });
  // Two fill the slots, ten more wait: Catch up, rooms, team setup.
  const background = Array.from({ length: 12 }, (_, i) =>
    reads.call('agents.messages', { agentId: `bg${i}` }, slow(`bg${i}`))
  );
  const chat = reads.call('agents.messages', { agentId: 'open' }, slow('open'), { first: true });
  // Each background read answers in turn; the open chat is next after the two already at the Mac.
  while (order.length < 3) {
    hold.shift()?.();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  expect(order.slice(0, 3)).toEqual(['bg0', 'bg1', 'open']);
  await chat;
  while (hold.length) {
    hold.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  }
  await Promise.all(background);
});

it('asking for a read already waiting as first moves it to the front, still one request', async () => {
  const reads = createReads(Date.now, 1);
  const hold: Array<() => void> = [];
  const request = (name: string) => () => new Promise<string>((res) => hold.push(() => res(name)));
  void reads.call('agents.quota', { n: 'a' }, request('a'));
  void reads.call('agents.quota', { n: 'b' }, request('b'));
  const c = reads.call('agents.messages', { agentId: 'x' }, request('x'));
  const again = reads.call('agents.messages', { agentId: 'x' }, request('x2'), { first: true });
  expect(again).toBe(c);
  hold.shift()?.(); // a answers; x, not b, takes the slot
  await new Promise((r) => setTimeout(r, 0));
  expect(hold).toHaveLength(1);
  hold.shift()?.();
  await expect(c).resolves.toBe('x');
  hold.shift()?.();
});

it('background reads wait for every other read, at most two at once, and move up when a screen asks', async () => {
  const reads = createReads(Date.now, 3);
  const hold: Array<{ name: string; go: () => void }> = [];
  const started: string[] = [];
  const request = (name: string) => () =>
    new Promise<string>((res) => {
      started.push(name);
      hold.push({ name, go: () => res(name) });
    });
  const ahead = [0, 1, 2, 3].map((i) =>
    reads.call('agents.messages', { agentId: `bg${i}` }, request(`bg${i}`), { background: true })
  );
  // Two background reads at once, never a third, even with a slot free.
  expect(started).toEqual(['bg0', 'bg1']);
  const screen = reads.call('agents.missions', {}, request('missions'));
  expect(started).toEqual(['bg0', 'bg1', 'missions']);
  // A screen now wants bg3: one request, out of the background lane, next in.
  const open = reads.call('agents.messages', { agentId: 'bg3' }, request('again'), { first: true });
  hold.find((h) => h.name === 'missions')?.go();
  await screen;
  await new Promise((r) => setTimeout(r, 0));
  expect(started).toEqual(['bg0', 'bg1', 'missions', 'bg3']);
  for (const h of hold.splice(0)) h.go();
  await new Promise((r) => setTimeout(r, 0));
  for (const h of hold.splice(0)) h.go();
  await expect(open).resolves.toBe('bg3');
  await Promise.all(ahead);
  expect(started).toHaveLength(5);
});

/**
 * Julian's reconnect (21 Nov, 15:52 UTC): Catch up read ten chats' newest
 * pages (~40 KB each) as `first` the moment the agents list arrived, and the
 * relay delivered the replies one after another, ~110 ms apart. The reads the
 * screen itself was waiting on (missions, rooms, team setup) came back at
 * 2.4-2.6 s instead of ~0.15 s. Replayed here on a link that carries one
 * reply at a time: 100 ms there and back, then 360 KB/s.
 */
it('on reconnecting, what the screen waits for is not held behind ten chats read ahead', async () => {
  async function reconnect(ahead: { first?: boolean; background?: boolean }) {
    let clock = 0;
    let linkFree = 0;
    const deliveries: Array<{ at: number; go: () => void }> = [];
    const answered: Record<string, number> = {};
    const reads = createReads(() => clock);
    const reply = (name: string, kb: number) => () =>
      new Promise<void>((res) => {
        // The Mac answers at once; the reply waits for the link.
        const at = Math.max(clock + 50, linkFree) + (kb / 360) * 1000;
        linkFree = at;
        deliveries.push({ at: at + 50, go: () => ((answered[name] = clock), res()) });
      });
    const pages = Array.from({ length: 10 }, (_, i) =>
      reads.call('agents.messages', { agentId: `a${i}` }, reply(`a${i}`, 40), ahead)
    );
    const screen = [
      reads.call('agents.missions', {}, reply('missions', 4)),
      reads.call('rooms.list', {}, reply('rooms', 2)),
      reads.call('agents.teamSetup', {}, reply('teamSetup', 3)),
    ];
    while (deliveries.length) {
      deliveries.sort((a, b) => a.at - b.at);
      const next = deliveries.shift()!;
      clock = next.at;
      next.go();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all([...pages, ...screen]);
    return answered;
  }
  const before = await reconnect({ first: true });
  const after = await reconnect({ background: true });
  const slowest = (a: Record<string, number>) => Math.max(a.missions, a.rooms, a.teamSetup);
  // Before: the screen's reads waited for the pages ahead of them.
  expect(slowest(before)).toBeGreaterThan(700);
  // After: behind at most the two pages already on the link.
  expect(slowest(after)).toBeLessThan(slowest(before) / 2);
  // And every chat is still read, in about the same time overall.
  expect(Math.max(...Object.values(after))).toBeLessThan(Math.max(...Object.values(before)) + 500);
  console.log(
    `[reconnect] screen's reads answered by ${Math.round(slowest(before))} ms before, ${Math.round(
      slowest(after)
    )} ms after; last chat page ${Math.round(Math.max(...Object.values(before)))} -> ${Math.round(
      Math.max(...Object.values(after))
    )} ms`
  );
});
