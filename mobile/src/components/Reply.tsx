/**
 * Reply to a message: the swipe that asks for it, the line in the box that
 * says what's being answered, and the pill above a sent reply
 * (docs/guide/chat.md). The words come from `replyWords`, shared with the desk.
 */
import { REPLY, replyExcerptLine, replyPillText } from '@shipstudio/companion-protocol';
import type { ReplyRef } from '@shipstudio/companion-protocol';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  FadeIn,
  FadeOut,
  type SharedValue,
  ReduceMotion,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { makeStyles, useColors } from '../lib/appearance';
import { haptic } from '../lib/haptics';
import { SWIPE_ANGLE_DEG, SWIPE_ARM, swipeOffset } from '../lib/reply';
import { iconSize, radius, reply, space, type } from '../lib/theme';
import { Icon, T } from './ui';

/** What a chat gives its rows so they can offer Reply: the chat's own, absent in a room. */
export interface ReplyActions {
  /** Start a reply to this message (the line appears in the box, the keyboard opens). */
  onReply: (messageId: string) => void;
  /** Scroll to a message and flash it; false when it isn't there. */
  onJump: (messageId: string) => boolean;
  /** Whether the original is in the chat now (the pill is tappable only then). */
  has: (messageId: string) => boolean;
}
export const ReplyContext = createContext<ReplyActions | null>(null);
export const useReplyActions = () => useContext(ReplyContext);

/**
 * Any message dragged to the right: it follows the finger on a rubber band
 * (72 at most), a circle with an arrow fills at 48 with one haptic, and
 * letting go past it replies. Only a mostly sideways drag counts, so a
 * scroll is never taken. Under Reduce Motion nothing animates back.
 */
export function SwipeReply({
  onReply,
  label,
  above,
  children,
}: {
  onReply: () => void;
  label: string;
  /** Moves with the message but isn't part of it (a reply's pill): the circle centres on `children`. */
  above?: ReactNode;
  children: ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const armed = useSharedValue(false);
  const [body, setBody] = useState({ y: 0, h: 0 });
  // 25 degrees: after 12 sideways, vertical drift past tan(25°)·12 ≈ 5.6 hands the touch to the list.
  const slop = Math.tan((SWIPE_ANGLE_DEG * Math.PI) / 180) * 12;
  const pan = Gesture.Pan()
    .activeOffsetX([12, 9999])
    .failOffsetY([-slop, slop])
    .onUpdate((e) => {
      const off = swipeOffset(e.translationX);
      x.set(off);
      const now = off >= SWIPE_ARM;
      if (now !== armed.get()) {
        armed.set(now);
        if (now) runOnJS(haptic.select)();
      }
    })
    .onEnd(() => {
      if (armed.get()) runOnJS(onReply)();
    })
    .onFinalize(() => {
      armed.set(false);
      x.set(reduced ? 0 : withSpring(0, { duration: 380, dampingRatio: 1 }));
    });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const circle = useAnimatedStyle(() => ({
    opacity: Math.min(1, x.get() / 24),
    transform: [{ scale: 0.7 + 0.3 * Math.min(1, x.get() / SWIPE_ARM) }],
    backgroundColor: x.get() >= SWIPE_ARM ? colors.surfaceBubbleUser : colors.surfaceControl,
    borderWidth: x.get() >= SWIPE_ARM ? 0 : 1,
  }));
  return (
    <GestureDetector gesture={pan}>
      <View
        accessible={false}
        accessibilityActions={[{ name: 'reply', label }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'reply' && onReply()}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.circle,
            body.h > 0 && { top: body.y + body.h / 2 - reply.circle / 2, marginTop: 0 },
            circle,
          ]}
        >
          <ReplyArrow x={x} />
        </Animated.View>
        <Animated.View style={slide}>
          {above}
          <View
            onLayout={(e) => setBody({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
          >
            {children}
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** The arrow in the swipe's circle: inverse ink once it has filled. */
function ReplyArrow({ x }: { x: SharedValue<number> }) {
  const colors = useColors();
  const filled = useAnimatedStyle(() => ({ opacity: x.get() >= SWIPE_ARM ? 1 : 0 }));
  const outline = useAnimatedStyle(() => ({ opacity: x.get() >= SWIPE_ARM ? 0 : 1 }));
  return (
    <>
      <Animated.View style={outline}>
        <Icon name="arrowshape.turn.up.left" size={iconSize.body} color={colors.textPrimary} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute' }, filled]}>
        <Icon name="arrowshape.turn.up.left" size={iconSize.body} color={colors.textOnBubbleUser} />
      </Animated.View>
    </>
  );
}

/**
 * The line above a sent reply, outside its bubble: one outlined pill with the
 * quoted words. Tapping it goes to the original; when that isn't in the chat
 * it says so and does nothing.
 */
export function ReplyPill({
  to,
  mine,
  parties,
  room,
}: {
  to: ReplyRef;
  /** Your bubble's pill sits at the right edge, the agent's at the left. */
  mine: boolean;
  parties: string[];
  room?: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  const actions = useReplyActions();
  const here = actions?.has(to.id) ?? false;
  const text = here ? replyPillText(to, { parties, room }) : REPLY.gone;
  const body = (
    <View style={[styles.pill, mine ? styles.pillMine : styles.pillTheirs]}>
      <T variant="label" color={colors.textMuted} numberOfLines={1} style={styles.pillText}>
        {text}
      </T>
    </View>
  );
  if (!here) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Replying to ${to.name}: ${replyExcerptLine(to.kind, to.excerpt)}`}
      accessibilityHint="Goes to that message"
      onPress={() => actions?.onJump(to.id)}
      style={[styles.pillRow, mine ? styles.rowMine : styles.rowTheirs]}
    >
      {body}
    </Pressable>
  );
}

/** The reply set in the box: the quoted line with a × (one reply at a time). */
export function ReplyLine({ to, onCancel }: { to: ReplyRef; onCancel: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Animated.View
      entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
      style={styles.line}
      accessibilityLabel={REPLY.replyingTo(to.name)}
    >
      <T variant="label" color={colors.textMuted} numberOfLines={1} style={styles.lineText}>
        {replyExcerptLine(to.kind, to.excerpt)}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={REPLY.cancel}
        hitSlop={space.sm}
        onPress={onCancel}
        style={styles.close}
      >
        <Icon name="xmark" size={iconSize.inline} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  circle: {
    position: 'absolute',
    left: reply.circleInset,
    top: '50%',
    marginTop: -reply.circle / 2,
    width: reply.circle,
    height: reply.circle,
    borderRadius: reply.circle / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.borderDefault,
  },
  pillRow: { maxWidth: '100%' },
  rowMine: { alignSelf: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  pill: {
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.chip,
    paddingVertical: reply.pillPadV,
    paddingHorizontal: reply.pillPadH,
    marginBottom: reply.pillGap,
  },
  pillMine: { alignSelf: 'flex-end' },
  pillTheirs: { alignSelf: 'flex-start' },
  pillText: { fontSize: type.label },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: reply.lineHeight,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    paddingLeft: space.md,
    marginHorizontal: space.sm,
    marginTop: space.sm,
  },
  lineText: { flex: 1, fontSize: type.label },
  close: {
    width: reply.closeSize,
    height: reply.closeSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
