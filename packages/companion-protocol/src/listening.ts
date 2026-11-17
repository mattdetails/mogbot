/**
 * Dictation shows no words while you talk, only your voice as a wave and how
 * long it's been, so it must say the moment the mic isn't hearing you: one
 * rule for desk and phone.
 */

/** A level at or above this is a voice, not the room. */
export const VOICE_LEVEL = 0.3;
/**
 * Never heard a voice: say so after this, counted from the moment the mic
 * is really running. 3 s fired while people were still drawing breath (and
 * while the phone's mic was still starting), in the warning colour.
 */
export const SILENT_FIRST_MS = 8_000;
/** Heard one, then nothing for this long. */
export const SILENT_AFTER_MS = 10_000;
/** Sound coming in but no words recognised for this long. */
export const NO_WORDS_MS = 10_000;

/** What the listening line says about what it hears. */
export type Hearing = 'ok' | 'silent' | 'noWords';

/**
 * Whether the mic is really hearing you, from the levels and live words so
 * far (times in ms). `wordsExpected`: a live recogniser runs alongside (macOS),
 * so sound with no words for a while means the wrong input or a muted one.
 */
export function hearing(m: {
  now: number;
  startedAt: number;
  lastVoiceAt: number | null;
  lastWordsAt: number | null;
  wordsExpected: boolean;
}): Hearing {
  const quietFor = m.now - (m.lastVoiceAt ?? m.startedAt);
  if (quietFor >= (m.lastVoiceAt === null ? SILENT_FIRST_MS : SILENT_AFTER_MS)) return 'silent';
  if (
    m.wordsExpected &&
    m.lastVoiceAt !== null &&
    quietFor < 2_000 &&
    m.now - (m.lastWordsAt ?? m.startedAt) >= NO_WORDS_MS
  ) {
    return 'noWords';
  }
  return 'ok';
}

/** "Can't hear you · check the mic (MacBook Pro Microphone)", or null when it can. */
export function hearingLine(state: Hearing, mic: string | null): string | null {
  if (state === 'ok') return null;
  const named = mic ? ` (${mic})` : '';
  return state === 'silent'
    ? `Can’t hear you · check the mic${named}`
    : `Hearing sound, but no words · check the mic${named}`;
}

/** 0:07, 1:42, 12:03. */
export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
