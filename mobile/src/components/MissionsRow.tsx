/**
 * The Agents list's line for missions: shown only when this Mac has any open
 * (`agents.missions`), saying the one that needs you first, and opening them.
 * Amber only for something to decide (paused at its share, ready for review)
 * and always with words.
 */

import { metCount, stateWord, type Mission } from '@shipstudio/companion-protocol';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { makeStyles, useColors } from '../lib/appearance';
import { servesMissions, useMissions } from '../lib/missions';
import { iconSize, PRESSED, radius, space } from '../lib/theme';
import { Icon, T } from './ui';

const needsYou = (m: Mission) =>
  m.state === 'paused_cap' || m.state === 'ready' || m.state === 'blocked';

export function MissionsRow() {
  const colors = useColors();
  const styles = useStyles();
  const { missions } = useMissions();
  if (!servesMissions()) return null;
  const open = (missions ?? []).filter((m) => m.state !== 'done' && m.state !== 'stopped');
  if (open.length === 0) return null;
  const first = open.find(needsYou) ?? open[0];
  const warn = needsYou(first);
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Missions: ${first.goal}. ${stateWord(first, Date.now())}`}
        onPress={() => router.push('/missions')}
        style={({ pressed }) => [styles.row, pressed && PRESSED]}
      >
        <View style={styles.grow}>
          <T variant="caption" color={colors.textMuted}>
            {open.length === 1 ? 'Mission' : `Missions · ${open.length}`}
          </T>
          <T variant="body" color={colors.textStrong} numberOfLines={1}>
            {first.goal}
          </T>
          <T
            variant="small"
            color={warn ? colors.accentWarning : colors.textMuted}
            numberOfLines={1}
          >
            {stateWord(first, Date.now())} · {metCount(first)} of {first.criteria.length} met
          </T>
        </View>
        <Icon name="chevron.right" size={iconSize.inline} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { paddingHorizontal: space.lg, paddingTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfacePanel,
  },
  grow: { flex: 1, minWidth: 0 },
}));
