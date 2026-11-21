/**
 * A video an agent sent, opened over the relay (Julian's wife's phone, 20 Nov:
 * no MP4 would open). Its bytes go straight to disk as they arrive, never
 * whole in memory: 20 MB and 60 MB through the mock Mac's relay, the file on
 * "disk" identical, at most one 1 MB range held at once, the `.part` gone on
 * a failure, and the cached copy reused.
 */
import { createHash } from 'node:crypto';
import { WebSocket } from 'ws';
import { createMockServer } from '../dev/mock-server';
import { RELAY_DOWNLOAD_RANGE } from '../src/lib/relayHttp';
import { DirectTransport, type FileSink, type LocalFiles } from '../src/lib/transport';
import { provenBy, random, until } from './helpers';

jest.setTimeout(120_000);

const WS = WebSocket as unknown as typeof globalThis.WebSocket;
const MB = 1024 * 1024;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** A disk in memory that writes pieces like the real sink, and measures what's held. */
function diskFiles() {
  const kept = new Map<string, Buffer>();
  const parts = new Map<string, Buffer[]>();
  // Received off the socket but not yet on disk: everything the phone holds.
  let received = 0;
  let written = 0;
  let peak = 0;
  let failAt: number | null = null;
  const files: LocalFiles & { stream(key: string): Promise<FileSink> } = {
    read: () => Promise.reject(new Error('no picks here')),
    cached: (key) => Promise.resolve(kept.has(key) ? `file:///cache/${key}` : null),
    write: () => Promise.reject(new Error('a relay download must not be written whole')),
    stream: (key) => {
      const chunks: Buffer[] = [];
      parts.set(key, chunks);
      let size = 0;
      return Promise.resolve({
        append: async (piece) => {
          await new Promise((r) => setTimeout(r, 1));
          if (failAt !== null && size + piece.length > failAt) throw new Error('disk full');
          chunks.push(Buffer.from(piece));
          size += piece.length;
          written += piece.length;
        },
        commit: () => {
          kept.set(key, Buffer.concat(chunks));
          parts.delete(key);
          return Promise.resolve(`file:///cache/${key}`);
        },
        abort: () => {
          parts.delete(key);
          return Promise.resolve();
        },
      });
    },
  };
  return {
    files,
    kept,
    parts,
    peak: () => peak,
    /** The socket handed over `n` bytes so far. */
    took: (n: number) => {
      received = n;
      peak = Math.max(peak, received - written);
    },
    restart: () => {
      received = written = peak = 0;
    },
    failAfter: (n: number | null) => (failAt = n),
  };
}

describe('a big file over the relay', () => {
  const mock = createMockServer({ quiet: true, allowAfterMs: 0, relay: true });
  beforeAll(() => mock.listen());
  afterAll(() => mock.close());

  const connect = async (disk: ReturnType<typeof diskFiles>) => {
    const { token } = mock.issueToken();
    const t = new DirectTransport({
      routes: [{ kind: 'relay', url: mock.relay!.url }],
      token,
      app: { version: '0.1.0', runtimeVersion: 'test' },
      getResume: () => undefined,
      foreground: true,
      WebSocketImpl: WS,
      random,
      files: disk.files,
      ...provenBy(mock),
    });
    await until(() => t.state.kind === 'connected');
    return t;
  };

  it.each([20, 60])('%i MB arrives on disk byte for byte, a piece at a time', async (size) => {
    const disk = diskFiles();
    const t = await connect(disk);
    const video = Buffer.alloc(size * MB);
    for (let i = 0; i < video.length; i += 4096) video[i] = (i / 4096) % 251;
    const path = mock.attachFile('design', 'clip.mp4', 'video/mp4', video);
    const seen: [number, number | null][] = [];
    const uri = await t.download({ agentId: 'design', path }, undefined, (r, total) => {
      seen.push([r, total]);
      disk.took(r);
    });
    const key = `attachment/design/${path}`;
    expect(uri).toBe(`file:///cache/${key}`);
    expect(sha(disk.kept.get(key)!)).toBe(sha(video));
    // Never more than one range in hand, whatever the size: the old path
    // held the whole file, then a base64 copy a third bigger.
    expect(disk.peak()).toBeLessThanOrEqual(RELAY_DOWNLOAD_RANGE);
    // Progress counts up to the whole, against the length the Mac gave.
    expect(seen.at(-1)).toEqual([video.length, video.length]);
    // Opened again: the copy on disk, nothing over the relay.
    const before = mock.relay!.opened;
    expect(await t.download({ agentId: 'design', path })).toBe(uri);
    expect(mock.relay!.opened).toBe(before);
    t.close();
  });

  it('a download that fails part way leaves no .part and no cached copy', async () => {
    const disk = diskFiles();
    const t = await connect(disk);
    const path = mock.attachFile('design', 'cut.mp4', 'video/mp4', Buffer.alloc(3 * MB, 7));
    disk.failAfter(MB);
    await expect(t.download({ agentId: 'design', path })).rejects.toBeTruthy();
    const key = `attachment/design/${path}`;
    expect(disk.parts.has(key)).toBe(false);
    expect(disk.kept.has(key)).toBe(false);
    // Asked again once the disk is fine: it comes whole.
    disk.failAfter(null);
    await t.download({ agentId: 'design', path });
    expect(disk.kept.get(key)!.length).toBe(3 * MB);
    t.close();
  });
});
