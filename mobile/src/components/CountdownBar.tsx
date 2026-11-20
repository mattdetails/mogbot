/**
 * Talk's countdown before it sends: a bar that fills to the moment it sends.
 * It runs on the UI thread (one linear withTiming on scaleX, docs/MOTION.md:
 * progress is transform, never width), so it is smooth at 120Hz whatever the
 * JS thread is doing; it used to be a width set from React state every 100ms.
 */

import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export function CountdownBar({
  sendAt,
  totalMs,
  color,
  trackStyle,
}: {
  /** When it sends (ms since epoch). */
  sendAt: number;
  /** The whole countdown's length. */
  totalMs: number;
  color: string;
  trackStyle: ViewStyle;
}) {
  const fill = useSharedValue(0);
  useEffect(() => {
    const left = Math.max(0, sendAt - Date.now());
    // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value is written through .value by design
    fill.value = Math.min(1, Math.max(0, 1 - left / totalMs));
    fill.value = withTiming(1, {
      duration: left,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never, // it is a clock, not decoration
    });
    return () => cancelAnimation(fill);
  }, [fill, sendAt, totalMs]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  return (
    <View style={trackStyle}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, transformOrigin: 'left' },
});
