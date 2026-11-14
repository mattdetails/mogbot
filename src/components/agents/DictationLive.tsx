/**
 * The composer's one row while you dictate, where the text was: no words,
 * only "● 0:42" and your voice as a wave filling the row, and, the moment
 * the mic isn't hearing you, "Can't hear you · check the mic (its name)" in
 * place of the time. Then "Tidying…" alone while the words are written out.
 *
 * It keeps its own clock (four times a second) and draws the wave on a
 * canvas from the meter's levels, so nothing else re-renders while you talk.
 */
import { useEffect, useRef, useState } from 'react';
import { TextButton } from '../primitives/TextButton';
import { usePolling } from '../../hooks/usePolling';
import {
  elapsedLabel,
  hearing as hearingOf,
  hearingLine,
  VOICE_LEVEL,
  type Hearing,
} from '../../lib/dictation';
import type { DictationMeter, DictationPhase } from './useDictation';

/** How many bars the wave keeps; the newest at the right. */
const BARS = 320;
const TICK_MS = 250;

export function DictationLive({
  phase,
  meter,
  onCancel,
  onRetry,
}: {
  phase: DictationPhase;
  meter: DictationMeter;
  onCancel: () => void;
  /** Heard but couldn't be written out (idle). */
  onRetry?: (() => void) | null;
}) {
  if (phase === 'idle') {
    if (!onRetry) return null;
    return (
      <span className="agent-composer__listening" data-failed role="status">
        Couldn’t write that out
        <span aria-hidden>·</span>
        <TextButton tabIndex={0} onClick={onRetry}>
          Try again
        </TextButton>
      </span>
    );
  }
  const live = phase === 'listening' || phase === 'starting';
  return (
    <span
      className="agent-composer__listening"
      data-phase={phase}
      data-live={live || undefined}
      role="status"
    >
      {live ? (
        <ListeningClock meter={meter} />
      ) : (
        <span className="agent-composer__listening-clock" data-hearing="ok">
          {phase === 'tidying' ? 'Tidying…' : 'Finishing…'}
        </span>
      )}
      {live ? <DictationWave meter={meter} live /> : <span className="agent-composer__wave" />}
      <TextButton tabIndex={0} onClick={onCancel}>
        Cancel
      </TextButton>
    </span>
  );
}

/** "● Listening · 0:42", or what's wrong with what it hears. */
function ListeningClock({ meter }: { meter: DictationMeter }) {
  const [now, setNow] = useState(() => Date.now());
  usePolling(() => Promise.resolve(setNow(Date.now())), {
    intervalMs: TICK_MS,
    name: 'dictation-clock',
  });
  const state: Hearing = hearingOf({ now, ...meter });
  const warning = hearingLine(state, meter.mic);
  return (
    <span className="agent-composer__listening-clock" data-hearing={state}>
      <span className="agent-composer__listening-dot" aria-hidden />
      {warning ?? (
        <span className="agent-composer__listening-time" aria-label="Listening">
          {/* Until your voice first reaches it: "Listening…", calm. Then the clock. */}
          {meter.lastVoiceAt === null ? 'Listening…' : elapsedLabel(now - meter.startedAt)}
        </span>
      )}
    </span>
  );
}

/**
 * The voice as bars, newest at the right, scrolling left. Flat and dim when
 * nothing comes in, so a dead mic is obvious at a glance. While tidying it
 * holds the last shape, dimmed.
 */
export function DictationWave({ meter, live }: { meter: DictationMeter; live: boolean }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const levels = useRef<number[]>([]);
  const of = useRef<DictationMeter | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // A new dictation starts a new wave; tidying keeps the last one's.
    if (of.current !== meter) {
      of.current = meter;
      levels.current = [];
    }
    let frame = 0;
    const draw = () => {
      frame = 0;
      const ctx = el.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const style = getComputedStyle(el);
      const step = 4;
      const bar = 2;
      const count = Math.min(BARS, Math.floor(w / step));
      const shown = levels.current.slice(-count);
      for (let i = 0; i < count; i++) {
        const level = shown[shown.length - count + i] ?? 0;
        const loud = level >= VOICE_LEVEL;
        const height = Math.max(2, Math.min(h, h * (0.12 + level * 1.1)));
        ctx.fillStyle = loud ? style.color : style.getPropertyValue('--wave-quiet') || style.color;
        ctx.globalAlpha = loud ? 1 : 0.55;
        const x = w - (count - i) * step;
        ctx.beginPath();
        ctx.roundRect(x, (h - height) / 2, bar, height, 1);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const onLevel = (level: number) => {
      if (!live) return;
      levels.current.push(level);
      if (levels.current.length > BARS * 2) levels.current.splice(0, BARS);
      queue();
    };
    meter.listeners.add(onLevel);
    const observer = new ResizeObserver(queue);
    observer.observe(el);
    queue();
    return () => {
      meter.listeners.delete(onLevel);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [meter, live]);

  return (
    <canvas
      ref={canvas}
      className="agent-composer__wave"
      data-live={live || undefined}
      aria-hidden
    />
  );
}
