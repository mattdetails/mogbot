/**
 * Paths an agent wrote in a reply (Chat UI's file-paths shape, 49b662d41;
 * the desk's `useProsePaths`): checked on the Mac before anyone taps
 * (`agents.checkPaths`, the allowlist a tap is judged by). An image (png,
 * jpg, gif, webp; never svg) is drawn under the reply like an attached
 * picture; a file or folder stays a link that opens it; a missing one is
 * muted and struck through, "Not found on this Mac"; one outside the agent's
 * folder and your projects is plain text. On a Mac without the check, every
 * path stays a link, as before.
 */

import type { PathCheck } from '@shipstudio/companion-protocol';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { makeStyles, useColors } from '../lib/appearance';
import { preview } from '../lib/files';
import { useLinkLive } from '../lib/linkLive';
import { call, describeError, fetchPath } from '../lib/session';
import { useServed } from '../lib/store';
import { radius, space, PRESSED } from '../lib/theme';
import { Spinner } from './agent';
import { PathKinds, pathsIn } from './Markdown';
import { T } from './ui';

/** Checks this session, per agent and path, for a minute (a file may appear). */
const cache = new Map<string, { at: number; kind: PathCheck['kind'] }>();
const FRESH_MS = 60_000;
const keyOf = (agentId: string, path: string) => `${agentId}\n${path}`;

/** What the Mac says each path in `text` is; empty until it answers, or without the check. */
export function useCheckedPaths(
  agentId: string,
  text: string
): ReadonlyMap<string, PathCheck['kind']> {
  const served = useServed('agents.checkPaths');
  const live = useLinkLive();
  const paths = useMemo(() => pathsIn(text), [text]);
  const [, setTick] = useState(0);
  const joined = paths.join('\n');
  useEffect(() => {
    if (!served || !live || !joined) return;
    const now = Date.now();
    const unknown = joined
      .split('\n')
      .filter((p) => {
        const hit = cache.get(keyOf(agentId, p));
        return !hit || now - hit.at > FRESH_MS;
      })
      .slice(0, 64);
    if (!unknown.length) return;
    let gone = false;
    call('agents.checkPaths', { agentId, paths: unknown }).then(
      (checks) => {
        for (const c of checks) cache.set(keyOf(agentId, c.path), { at: Date.now(), kind: c.kind });
        if (!gone) setTick((n) => n + 1);
      },
      () => {}
    );
    return () => {
      gone = true;
    };
  }, [served, live, agentId, joined]);
  const out = new Map<string, PathCheck['kind']>();
  for (const p of paths) {
    const hit = cache.get(keyOf(agentId, p));
    if (hit) out.set(p, hit.kind);
  }
  return out;
}

/** The images a reply names, drawn under it like attached pictures; a tap opens one. */
export function ReplyPathImages({
  agentId,
  kinds,
  onError,
}: {
  agentId: string;
  kinds: ReadonlyMap<string, PathCheck['kind']>;
  onError?: (text: string) => void;
}) {
  const styles = useStyles();
  const images = [...kinds].filter(([, k]) => k === 'image').map(([p]) => p);
  if (!images.length) return null;
  return (
    <View style={styles.grid}>
      {images.map((p) => (
        <PathImage key={p} agentId={agentId} path={p} onError={onError} />
      ))}
    </View>
  );
}

/** One picture: fetched from the Mac as a file a tap could open, kept on the phone. */
function PathImage({
  agentId,
  path,
  onError,
}: {
  agentId: string;
  path: string;
  onError?: (text: string) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    fetchPath(agentId, path).then(
      (f) => !gone && setUri(f.uri),
      () => !gone && setFailed(true)
    );
    return () => {
      gone = true;
    };
  }, [agentId, path]);
  const name = path.split('/').pop() ?? path;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`${name}, from the reply`}
      disabled={!uri}
      onPress={() =>
        uri && void preview(uri, mimeOf(name)).catch((e: unknown) => onError?.(describeError(e)))
      }
      style={({ pressed }) => [styles.tile, pressed && PRESSED]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.image} contentFit="cover" />
      ) : failed ? (
        <T variant="caption" color={colors.textMuted} style={styles.note}>
          Image not available
        </T>
      ) : (
        <Spinner />
      )}
    </Pressable>
  );
}

const mimeOf = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext ?? 'png'}`;
};

/** Checks the paths in a reply and draws its pictures under it. */
export function CheckedReply({
  agentId,
  text,
  children,
  onError,
}: {
  agentId: string;
  text: string;
  children: ReactNode;
  onError?: (text: string) => void;
}) {
  const kinds = useCheckedPaths(agentId, text);
  return (
    <PathKinds.Provider value={kinds}>
      {children}
      <ReplyPathImages agentId={agentId} kinds={kinds} onError={onError} />
    </PathKinds.Provider>
  );
}

/** The same tile as an attached picture's (`attachments.tsx`). */
const TILE = 112;

const useStyles = makeStyles((colors) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, maxWidth: TILE * 2 + space.xs },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surfaceControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: TILE, height: TILE },
  note: { textAlign: 'center', padding: space.sm },
}));
