/**
 * The dictation row's middle, between × and Stop/Send: no words show while
 * you talk, only "● 0:42" and your voice as a wave beside it, on the row
 * itself (nothing above the composer, no second line in it). Before your
 * voice first reaches it, the line says "Listening…" in the quiet colour
 * (the mic may still be starting); then the clock. When the mic really
 * isn't hearing you (8 s of nothing once it runs), the wave gives way to "Can't hear you · check the
 * mic" in the warning colour. Stopped, while the computer writes the words
 * out: "Tidying…" alone, once. The rule is the desk's (companion-protocol,
 * listening.ts). A tap is Stop and edit.
 *
 * It keeps its own clock, so the composer doesn't re-render while you talk.
 */
import { elapsedLabel, hearing, hearingLine } from '@shipstudio/companion-protocol';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAccent } from '../lib/accent';
import { useColors } from '../lib/appearance';
import { PILL_DOT, space } from '../lib/theme';
import { T } from './ui';

export interface ListeningMeter {
  startedAt: number;
  lastVoiceAt: number | null;
  lastWordsAt: number | null;
  /** The mic's first level: before it, the mic is still starting, never "can't hear you". */
  readyAt: number | null;
}

export function newListeningMeter(now = Date.now()): ListeningMeter {
  return { startedAt: now, lastVoiceAt: null, lastWordsAt: null, readyAt: null };
}

const TICK_MS = 250;

export function ListeningLine({
  meter,
  tidying,
  onPress,
  height,
  style,
  children,
}: {
  meter: RefObject<ListeningMeter>;
  tidying: boolean;
  onPress: () => void;
  height: number;
  style?: StyleProp<ViewStyle>;
  /** The waveform, shown beside the clock while it hears you. */
  children: ReactNode;
}) {
  const colors = useColors();
  const accent = useAccent();
  // What it has heard, read on the line's own clock.
  const [{ now, m }, setSeen] = useState(() => ({
    now: Date.now(),
    m: newListeningMeter(),
  }));
  useEffect(() => {
    if (tidying) return;
    const look = () => setSeen({ now: Date.now(), m: { ...meter.current } });
    const first = setTimeout(look, 0);
    const t = setInterval(look, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [tidying, meter]);
  // The phone's own recogniser always runs, so words are expected. Silence
  // counts only once the mic is running (its first level), never while it starts.
  const warning = tidying
    ? null
    : hearingLine(
        hearing({ now, ...m, startedAt: m.readyAt ?? now, wordsExpected: true }),
        null
      );
  const ink = warning ? colors.accentWarning : colors.textMuted;
  // Until it hears your voice: "Listening…", calm. Then the clock.
  const words = tidying
    ? 'Tidying…'
    : (warning ?? (m.lastVoiceAt === null ? 'Listening…' : elapsedLabel(now - m.startedAt)));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={tidying || warning ? words : `Listening, ${words}`}
      accessibilityHint="Double-tap to stop and edit"
      testID="dictation-line"
      style={[
        { flex: 1, height, flexDirection: 'row', alignItems: 'center', gap: space.sm },
        style,
      ]}
    >
      {!tidying && (
        <View
          style={{
            width: PILL_DOT,
            height: PILL_DOT,
            borderRadius: PILL_DOT / 2,
            backgroundColor: warning ? colors.accentWarning : accent.accent,
          }}
        />
      )}
      <T
        variant="subhead"
        color={ink}
        numberOfLines={1}
        style={[{ fontVariant: ['tabular-nums'] }, warning ? { flexShrink: 1 } : null]}
      >
        {words}
      </T>
      {!tidying && !warning ? children : null}
    </Pressable>
  );
}
