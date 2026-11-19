/**
 * A project's site on the phone: its picture right on the project's card,
 * Phone or Desktop width, retaken with one tap and opened full size with
 * another. Not a hidden "Screenshot" action in a sheet. The Mac takes the
 * picture from the running preview (`preview.screenshot`), so it needs the
 * site running there; when it isn't, this says so plainly with what to do.
 */

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { useNow } from '../lib/moving';
import {
  keepPreview,
  keptPreview,
  previewAge,
  previewProblem,
  type PreviewDevice,
  type PreviewShot,
} from '../lib/previewShots';
import { describeError, previewScreenshot } from '../lib/session';
import { makeStyles, useColors } from '../lib/appearance';
import { useComputer } from '../lib/computer';
import { useLinkLive } from '../lib/linkLive';
import { iconSize, radius, space } from '../lib/theme';
import { Spinner } from './agent';
import { Button, IconButton, Segmented, T } from './ui';

export function ProjectPreview({ path, name }: { path: string; name: string }) {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const comp = useComputer();
  const live = useLinkLive();
  const [device, setDevice] = useState<PreviewDevice>('phone');
  const [shot, setShot] = useState<PreviewShot | undefined>(() => keptPreview(path, 'phone'));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const now = useNow(30_000);

  useEffect(() => {
    setShot(keptPreview(path, device));
    setProblem(null);
  }, [path, device]);

  const take = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const got = await previewScreenshot(path, device);
      const next = { uri: got.uri, mime: got.mime, at: Date.now() };
      keepPreview(path, device, next);
      setShot(next);
      haptic.success();
    } catch (e) {
      haptic.error();
      setProblem(previewProblem(describeError(e), comp.your));
    } finally {
      setBusy(false);
    }
  };

  const wide = device === 'desktop';
  const any = !!shot || !!keptPreview(path, 'phone') || !!keptPreview(path, 'desktop');
  return (
    <View style={styles.wrap} testID="project-preview">
      <View style={styles.head}>
        <T variant="subhead" color={colors.textStrong} style={styles.title}>
          Preview
        </T>
        {any ? (
          <>
            <Segmented
              value={device}
              options={[
                { value: 'phone', label: 'Phone' },
                { value: 'desktop', label: 'Desktop' },
              ]}
              onChange={setDevice}
            />
            {shot && (
              <IconButton
                name="arrow.clockwise"
                label="Take a new picture"
                size={iconSize.inline}
                onPress={() => void take()}
                disabled={busy || !live}
              />
            )}
          </>
        ) : (
          <Button
            title={busy ? 'Taking the picture…' : 'Show the site'}
            icon="camera"
            size="compact"
            variant="ghost"
            busy={busy}
            disabled={busy || !live}
            onPress={() => void take()}
          />
        )}
      </View>
      {shot ? (
        <View>
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={`${name} on ${device}. Open full size`}
            onPress={() => {
              haptic.select();
              router.push({
                pathname: '/viewer',
                params: { uri: shot.uri, name: `${name} · ${device}`, mime: shot.mime },
              });
            }}
            style={[styles.frame, wide ? styles.frameWide : styles.framePhone]}
          >
            <Image source={{ uri: shot.uri }} resizeMode="contain" style={styles.image} />
            {busy && (
              <View style={styles.over}>
                <Spinner />
              </View>
            )}
          </Pressable>
          <T variant="caption" color={colors.textMuted} style={styles.age}>
            {busy ? 'Taking a new picture…' : `Taken ${previewAge(shot.at, now).toLowerCase()}`}
          </T>
        </View>
      ) : any ? (
        <View style={styles.other}>
          <Button
            title={busy ? 'Taking the picture…' : `Show it at ${device} width`}
            icon="camera"
            size="compact"
            variant="ghost"
            busy={busy}
            disabled={busy || !live}
            onPress={() => void take()}
          />
        </View>
      ) : null}
      {!!problem && (
        <View style={styles.problem}>
          <T variant="small" color={colors.textSecondary}>
            {problem}
          </T>
          <Button title="Try again" variant="ghost" size="compact" onPress={() => void take()} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderDefault,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  title: { flex: 1 },
  frame: {
    borderRadius: radius.control,
    backgroundColor: colors.surfaceControl,
    overflow: 'hidden',
    alignSelf: 'center',
    width: '100%',
  },
  // A phone's picture is tall: held to a height, centred, not stretched to the card.
  framePhone: { height: 320 },
  frameWide: { aspectRatio: 16 / 10 },
  image: { width: '100%', height: '100%' },
  over: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceControl,
    opacity: 0.7,
  },
  other: { alignItems: 'flex-start' },
  age: { paddingTop: space.xs },
  problem: { gap: space.xs, alignItems: 'flex-start' },
}));
