import { createReadTimings, SLOW_READ_MS, TIMED_FIRST } from '../src/lib/readTimings';

function setup() {
  let t = 1000;
  const notes: string[] = [];
  const timings = createReadTimings(
    (w) => notes.push(w),
    () => t
  );
  const advance = (ms: number) => (t += ms);
  const slowRead =
    (ms: number, ok = true) =>
    () =>
      new Promise<string>((resolve, reject) =>
        setTimeout(() => (ok ? resolve('x') : reject(new Error('no'))), 0)
      ).finally(() => advance(ms));
  return { timings, notes, advance, slowRead };
}

test('frames are timed from the welcome, and not before one', () => {
  const { timings, notes, advance } = setup();
  timings.frame('snapshot');
  expect(notes).toEqual([]);
  timings.welcomed();
  advance(420);
  timings.frame('snapshot');
  advance(80);
  timings.frame('caught up');
  expect(notes).toEqual(['snapshot +420ms after welcome', 'caught up +500ms after welcome']);
});

test('the first reads after a welcome are noted, with how long they took and when they were asked', async () => {
  const { timings, notes, advance, slowRead } = setup();
  timings.welcomed();
  advance(300);
  await timings.read('agents.conversations', slowRead(250));
  expect(notes).toEqual(['read agents.conversations answered in 250ms, 300ms after welcome']);
});

test('after the first few, only a slow read is noted; a failed one says so', async () => {
  const { timings, notes, slowRead } = setup();
  timings.welcomed();
  for (let i = 0; i < TIMED_FIRST; i++) await timings.read('rooms.list', slowRead(5));
  notes.length = 0;
  await timings.read('rooms.list', slowRead(SLOW_READ_MS - 1));
  expect(notes).toEqual([]);
  await timings.read('agents.teamSetup', slowRead(SLOW_READ_MS));
  expect(notes).toEqual([expect.stringMatching(/^read agents.teamSetup answered in 1000ms/)]);
  await expect(timings.read('agents.teamSetup', slowRead(2500, false))).rejects.toThrow('no');
  expect(notes[1]).toMatch(/failed in 2500ms/);
});

test('a new welcome starts the count over', async () => {
  const { timings, notes, slowRead } = setup();
  timings.welcomed();
  for (let i = 0; i < TIMED_FIRST; i++) await timings.read('a', slowRead(1));
  timings.welcomed();
  notes.length = 0;
  await timings.read('b', slowRead(1));
  expect(notes).toHaveLength(1);
});
