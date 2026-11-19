import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GRACE_KEY, type MacRelay } from '../src/mac';
import { Client, loginMac, loginMacResume, newMacKey, open, seqFrame } from './helpers';

/** The Mac says `resume` with what it holds, and the relay answers `resumed`. */
async function resume(mac: Client, chs: { ch: number; rx: number }[]) {
  mac.ws.send(JSON.stringify({ t: 'resume', chs }));
  const answer = await mac.json();
  expect(answer.t).toBe('resumed');
  return answer.chs as { ch: number; rx: number }[];
}

/** A resumable Mac and one phone on a channel, the Mac already flowing. */
async function pair() {
  const mac = await newMacKey();
  const macWs = await loginMacResume(mac);
  expect(await resume(macWs, [])).toEqual([]);
  const phone = await open(`/v1/phone/${mac.fingerprint}`);
  const opened = await macWs.json();
  expect(opened.t).toBe('open');
  return { mac, macWs, phone, ch: opened.ch as number };
}

const bytes = (...n: number[]) => new Uint8Array(n);
const arr = (u: Uint8Array) => Array.from(u);

describe('resumable Mac', () => {
  it('numbers phone frames for the Mac and strips the numbers going back', async () => {
    const { macWs, phone, ch } = await pair();
    phone.ws.send(bytes(1));
    phone.ws.send(bytes(2));
    expect(arr(await macWs.bytes())).toEqual(arr(seqFrame(ch, 1, bytes(1))));
    expect(arr(await macWs.bytes())).toEqual(arr(seqFrame(ch, 2, bytes(2))));
    macWs.ws.send(seqFrame(ch, 1, bytes(7)));
    expect(arr(await phone.bytes())).toEqual([7]);
  });

  it('refuses phones until the Mac has said what it holds', async () => {
    const mac = await newMacKey();
    await loginMacResume(mac);
    const phone = await open(`/v1/phone/${mac.fingerprint}`);
    expect(await phone.closed).toEqual({ code: 4404, reason: 'mac_offline' });
  });

  it('a Mac with no resume keeps the old framing and closing', async () => {
    const mac = await newMacKey();
    const macWs = await loginMac(mac);
    const phone = await open(`/v1/phone/${mac.fingerprint}`);
    const opened = await macWs.json();
    phone.ws.send(bytes(5));
    expect(arr(await macWs.bytes())).toEqual([0, 0, 0, opened.ch as number, 5]);
    macWs.ws.close(1000);
    expect(await phone.closed).toEqual({ code: 4404, reason: 'mac_offline' });
  });

  it('acks every few frames from the Mac and drops repeats', async () => {
    const { macWs, phone, ch } = await pair();
    for (let i = 1; i <= 8; i++) macWs.ws.send(seqFrame(ch, i, bytes(i)));
    for (let i = 1; i <= 8; i++) expect(arr(await phone.bytes())).toEqual([i]);
    expect(await macWs.json()).toEqual({ t: 'ack', ch, seq: 8 });
    macWs.ws.send(seqFrame(ch, 8, bytes(8))); // sent again after a blip
    expect(await phone.silent()).toBe(true);
  });

  it('closes a channel the Mac skipped a frame on', async () => {
    const { macWs, phone, ch } = await pair();
    macWs.ws.send(seqFrame(ch, 2, bytes(2)));
    expect(await phone.closed).toEqual({ code: 4404, reason: 'mac_offline' });
    expect(await macWs.json()).toEqual({ t: 'close', ch });
  });

  it('keeps the phone through a Mac blip and sends it what it missed', async () => {
    const { mac, macWs, phone, ch } = await pair();
    phone.ws.send(bytes(1));
    await macWs.bytes();
    // The Mac saw frame 1; the link dies; the phone talks into the gap.
    macWs.ws.close(1001);
    await new Promise((r) => setTimeout(r, 20));
    phone.ws.send(bytes(2));
    phone.ws.send(bytes(3));
    const back = await loginMacResume(mac);
    // The Mac holds the channel and had 1 of the phone's frames; the relay had 0 of the Mac's.
    const answer = await resume(back, [{ ch, rx: 1 }]);
    expect(answer).toEqual([{ ch, rx: 0 }]);
    expect(arr(await back.bytes())).toEqual(arr(seqFrame(ch, 2, bytes(2))));
    expect(arr(await back.bytes())).toEqual(arr(seqFrame(ch, 3, bytes(3))));
    // And the other way: the Mac sends 1 and 2 (1 repeated), the phone gets each once.
    back.ws.send(seqFrame(ch, 1, bytes(9)));
    back.ws.send(seqFrame(ch, 1, bytes(9)));
    back.ws.send(seqFrame(ch, 2, bytes(10)));
    expect(arr(await phone.bytes())).toEqual([9]);
    expect(arr(await phone.bytes())).toEqual([10]);
    expect(await phone.silent()).toBe(true);
    // The phone never saw a close.
    phone.ws.send(bytes(4));
    expect(arr(await back.bytes())).toEqual(arr(seqFrame(ch, 4, bytes(4))));
  });

  it('keeps the phone when a newer resumable login replaces a silently dead socket', async () => {
    const { mac, macWs, phone, ch } = await pair();
    const back = await loginMacResume(mac);
    expect((await macWs.closed).code).toBe(4409);
    expect(await resume(back, [{ ch, rx: 0 }])).toEqual([{ ch, rx: 0 }]);
    phone.ws.send(bytes(1));
    expect(arr(await back.bytes())).toEqual(arr(seqFrame(ch, 1, bytes(1))));
  });

  it('lets go of a phone the Mac no longer holds, and of a channel only the Mac holds', async () => {
    const { mac, macWs, phone, ch } = await pair();
    macWs.ws.close(1001);
    await new Promise((r) => setTimeout(r, 20));
    const back = await loginMacResume(mac);
    back.ws.send(JSON.stringify({ t: 'resume', chs: [{ ch: ch + 50, rx: 0 }] }));
    expect(await back.json()).toEqual({ t: 'close', ch: ch + 50 });
    expect(await back.json()).toEqual({ t: 'resumed', chs: [] });
    expect(await phone.closed).toEqual({ code: 4404, reason: 'mac_offline' });
  });

  it('closes a channel it can no longer replay, rather than leave a hole', async () => {
    const { mac, macWs, phone, ch } = await pair();
    macWs.ws.close(1001);
    await new Promise((r) => setTimeout(r, 20));
    phone.ws.send(bytes(1));
    const stub = env.MAC.get(env.MAC.idFromName(mac.fingerprint));
    // The object was evicted: what it held in memory is gone.
    await runInDurableObject(stub, (o: MacRelay) => {
      (o as unknown as { held: Map<number, unknown> }).held.clear();
    });
    const back = await loginMacResume(mac);
    back.ws.send(JSON.stringify({ t: 'resume', chs: [{ ch, rx: 0 }] }));
    expect(await back.json()).toEqual({ t: 'close', ch });
    expect(await back.json()).toEqual({ t: 'resumed', chs: [] });
    expect(await phone.closed).toEqual({ code: 4404, reason: 'mac_offline' });
  });

  it('closes the waiting phones 4404 once the grace is up with no Mac', async () => {
    const { mac, macWs, phone } = await pair();
    macWs.ws.close(1001);
    await new Promise((r) => setTimeout(r, 20));
    expect(await phone.silent(100)).toBe(true);
    const stub = env.MAC.get(env.MAC.idFromName(mac.fingerprint));
    await runInDurableObject(stub, async (_: MacRelay, state) => {
      await state.storage.put(GRACE_KEY, 1);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await phone.closed).toEqual({ code: 4404, reason: 'mac_offline' });
  });

  it('a legacy login after a resumable one closes the old phones', async () => {
    const { mac, phone } = await pair();
    await loginMac(mac);
    expect(await phone.closed).toEqual({ code: 4404, reason: 'mac_offline' });
  });
});
