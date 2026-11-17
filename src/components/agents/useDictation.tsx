/**
 * Dictation into the agent composer.
 *
 * Click the mic or press ⌘⇧D to toggle; hold ⌥Space in the composer to talk
 * while held. Escape cancels and puts back what was typed before. Spoken text
 * goes after whatever was already in the draft. Enter (or Send) while
 * listening stops and sends once the words are in.
 *
 * While it listens no words show, only your voice as a wave, how long it's
 * been, and "Can't hear you" the moment the mic hears nothing (`meter`,
 * drawn by DictationLive). When it stops, the computer writes the words out
 * (Whisper, then a pass that knows the team's names: src-tauri/src/voice):
 * "Tidying…", then they appear. macOS's live recogniser still runs, unseen:
 * its words are kept in case the writing out can't happen (no model yet),
 * and sound with no words from it for a while says so. A recording that was
 * heard but couldn't be written out is kept on the computer: "Couldn't write
 * that out · Try again" (`failed`, `retry`).
 *
 * The level goes straight to a CSS variable on `meterRef` and to the
 * meter's listeners, so the ~15 updates a second don't re-render the
 * conversation.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { MicrophoneIcon } from '@/components/icons';
import { useCommands } from '../../commands/useCommands';
import { useOptionalToast } from '../../contexts/ToastContext';
import {
  cancelDictation,
  dictationOffError,
  joinDictation,
  learnedWordsLine,
  learnFromDictation,
  onDictationEvent,
  removeDictationWord,
  onDictationModel,
  retryDictation,
  startDictation,
  VOICE_LEVEL,
  stopDictation,
  type DictationBlock,
} from '../../lib/dictation';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { isMac } from '../../lib/setup';

export type DictationPhase = 'idle' | 'starting' | 'listening' | 'finishing' | 'tidying';

/**
 * One dictation as it's heard, for the listening line: read on its own
 * clock by DictationLive, never through React state.
 */
export interface DictationMeter {
  startedAt: number;
  /** When a voice was last heard (a level at or over VOICE_LEVEL). */
  lastVoiceAt: number | null;
  /** When the live recogniser last gave words (macOS). */
  lastWordsAt: number | null;
  wordsExpected: boolean;
  /** The microphone listening, by name, when the computer said. */
  mic: string | null;
  listeners: Set<(level: number) => void>;
}

export function newDictationMeter(now = Date.now()): DictationMeter {
  return {
    startedAt: now,
    lastVoiceAt: null,
    lastWordsAt: null,
    wordsExpected: isMac(),
    mic: null,
    listeners: new Set(),
  };
}

interface Options {
  getDraft: () => string;
  /** Must be stable (a useState setter). */
  setDraft: (text: string) => void;
  /** Names worth recognising (agents, projects), read when dictation starts. */
  getVocabulary: () => Promise<string[]>;
  meterRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** The conversation so far, for the names pass (read when it starts). */
  getContext?: () => string;
  /**
   * Enter or Send while the words are still coming: the words leave the
   * field at once (`held`, which the chat shows as a dimmed message with
   * "Tidying…"), the last and better words go to them, and they're sent
   * from the field when they're in. Without it they wait in the field.
   */
  holdOnSend?: boolean;
}

/** Longest a message sent mid-dictation waits for the written-out words. */
export const HELD_MAX_MS = 20_000;

export function useDictation({
  getDraft: getField,
  setDraft: setField,
  getVocabulary,
  meterRef,
  enabled,
  getContext,
  holdOnSend = false,
}: Options) {
  const { showToast } = useOptionalToast();
  const [phase, setPhaseState] = useState<DictationPhase>('idle');
  const [blocked, setBlocked] = useState<DictationBlock | null>(null);
  const phaseRef = useRef<DictationPhase>('idle');
  const sessionRef = useRef<number | null>(null);
  /** The draft as typed before dictation began; cancel puts it back. */
  const originalRef = useRef('');
  /** Every finished segment's live words; partials are appended to it. */
  const baseRef = useRef('');
  /** A stop or cancel asked for before the session id came back. */
  const pendingRef = useRef<'stop' | 'cancel' | null>(null);
  const holdingRef = useRef(false);
  /** Send once this dictation has ended (Enter or Send while listening). */
  const sendAfterRef = useRef<(() => void) | null>(null);
  /** The draft as the last dictation left it, until it's sent (to learn your fixes). */
  const dictatedRef = useRef<string | null>(null);
  const [preparing, setPreparing] = useState<number | null>(null);
  /** The live recogniser's words, never shown: the fallback if writing out can't happen. */
  const liveRef = useRef('');
  const gotWordsRef = useRef(false);
  const unwrittenRef = useRef(false);
  const [meter, setMeter] = useState<DictationMeter>(newDictationMeter);
  const meterRef2 = useRef<DictationMeter>(meter);
  /** Heard but not written out: the recording waits on the computer for Try again. */
  const [failed, setFailed] = useState<number | null>(null);

  /** Sent while the words were still coming: they live here, not in the field, until they go. */
  const heldRef = useRef<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const getDraft = useCallback(() => heldRef.current ?? getField(), [getField]);
  const setDraft = useCallback(
    (text: string) => {
      if (heldRef.current === null) {
        setField(text);
        return;
      }
      heldRef.current = text;
      setHeld(text);
    },
    [setField]
  );

  const setPhase = useCallback((next: DictationPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const setLevel = useCallback(
    (level: number) => {
      meterRef.current?.style.setProperty('--dictation-level', String(level));
      const m = meterRef2.current;
      if (level >= VOICE_LEVEL) m.lastVoiceAt = Date.now();
      for (const listen of m.listeners) listen(level);
    },
    [meterRef]
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    void onDictationEvent((event) => {
      if (event.session !== sessionRef.current) return;
      switch (event.kind) {
        // Live words are kept, not shown: you see them once they're written out.
        case 'partial':
          liveRef.current = joinDictation(baseRef.current, event.text);
          if (event.text.trim()) meterRef2.current.lastWordsAt = Date.now();
          break;
        case 'final':
          // A long dictation arrives as several segments; each final one
          // becomes part of what the next is appended to.
          baseRef.current = joinDictation(baseRef.current, event.text);
          liveRef.current = baseRef.current;
          if (event.text.trim()) meterRef2.current.lastWordsAt = Date.now();
          break;
        case 'improving':
          setLevel(0);
          setPhase('tidying');
          break;
        case 'improved':
          gotWordsRef.current = true;
          setDraft(joinDictation(originalRef.current, event.text));
          break;
        case 'unwritten':
          unwrittenRef.current = true;
          break;
        case 'level':
          setLevel(event.level);
          break;
        case 'error':
          if (dictationOffError(event.message)) setBlocked('dictationOff');
          else showToast(event.message, 'error');
          break;
        case 'ended':
          if (event.cancelled && phaseRef.current !== 'finishing') {
            // Cancelled: nothing goes, and a held message's field is the field again.
            heldRef.current = null;
            setHeld(null);
            setField(originalRef.current);
            sendAfterRef.current = null;
          } else {
            if (!gotWordsRef.current) {
              // Not written out: the live words if there were any; else, if it
              // heard you, the recording waits for Try again.
              const live = liveRef.current.trim();
              if (live) setDraft(joinDictation(originalRef.current, live));
              else if (unwrittenRef.current) {
                setFailed(event.session);
                if (heldRef.current !== null) {
                  // Nothing to send after all: the field is the field again.
                  setField(heldRef.current);
                  heldRef.current = null;
                  setHeld(null);
                  sendAfterRef.current = null;
                }
              }
            }
            dictatedRef.current = getDraft();
          }
          sessionRef.current = null;
          holdingRef.current = false;
          setLevel(0);
          setPhase('idle');
          break;
      }
    }).then((fn) => {
      if (alive) unlisten = fn;
      else fn();
    });
    return () => {
      alive = false;
      unlisten?.();
      if (sessionRef.current !== null) void cancelDictation(sessionRef.current);
    };
  }, [getDraft, setDraft, setField, setLevel, setPhase, showToast]);

  /**
   * A held message that can't wait any longer (the better words took too
   * long, or the chat is closing): it goes now with the words it has (the
   * written-out ones if they came, else the live ones), and this dictation
   * is let go, so nothing it says later lands anywhere.
   */
  const letGoHeld = useCallback(() => {
    const send = sendAfterRef.current;
    if (heldRef.current === null || !send) return;
    const live = liveRef.current.trim();
    const held = heldRef.current;
    // Nothing of what you said is here yet: it waits in the field for you, never half sent.
    const said = gotWordsRef.current || live !== '';
    const words = gotWordsRef.current ? held : joinDictation(originalRef.current, live);
    sendAfterRef.current = null;
    heldRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session !== null) void cancelDictation(session);
    holdingRef.current = false;
    setLevel(0);
    setPhase('idle');
    const typed = getField();
    if (!said) {
      setField(typed.trim() ? joinDictation(held, typed) : held);
    } else if (words.trim()) {
      setField(words);
      send();
      setField(typed);
    }
    setHeld(null);
  }, [getField, setField, setLevel, setPhase]);
  const letGoHeldRef = useRef(letGoHeld);
  useEffect(() => {
    letGoHeldRef.current = letGoHeld;
  }, [letGoHeld]);

  // Held, it never waits longer than HELD_MAX_MS for the better words.
  useEffect(() => {
    if (held === null) return;
    const t = setTimeout(() => letGoHeldRef.current(), HELD_MAX_MS);
    return () => clearTimeout(t);
  }, [held === null]); // eslint-disable-line react-hooks/exhaustive-deps -- once per hold

  // The chat closing (another agent opened) with a message held: it goes now, never lost.
  useEffect(() => () => letGoHeldRef.current(), []);

  // Enter or Send while listening: it goes once the words are in. After the
  // phase is idle (an effect), so the chat's send sees dictation over.
  useEffect(() => {
    if (phase !== 'idle' || !sendAfterRef.current) return;
    const send = sendAfterRef.current;
    sendAfterRef.current = null;
    const words = heldRef.current;
    if (words === null) {
      send();
      return;
    }
    // Held: the words go from the field as any message does, and whatever
    // was typed there meanwhile is left for the next one.
    heldRef.current = null;
    const typed = getField();
    setField(words);
    send();
    setField(typed);
    // The held message gives way to the sent one in the same render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeld(null);
  }, [phase, getField, setField]);

  // Windows and Linux wait for the speech model the first time: say how far.
  useEffect(() => {
    if (blocked !== 'preparing') return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void onDictationModel((status) => {
      if (!alive) return;
      if (status.ready) {
        setBlocked(null);
        setPreparing(null);
      } else if (status.failed && !status.downloading) {
        setPreparing(null);
        setBlocked('modelFailed');
      } else {
        setPreparing(status.total ? status.received / status.total : 0);
      }
    }).then((fn) => (alive ? (unlisten = fn) : fn()));
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [blocked]);

  /**
   * The message is going: if you fixed a dictated word in it first, the
   * computer notes the fix, and the second time a word becomes yours, said
   * in a toast with Undo.
   */
  const noteSent = useCallback(
    (sent: string) => {
      const dictated = dictatedRef.current;
      dictatedRef.current = null;
      if (!dictated || !sent.trim() || dictated.trim() === sent.trim()) return;
      void learnFromDictation(dictated, sent)
        .then((learned) => {
          if (!learned.length) return;
          showToast(learnedWordsLine(learned), 'info', {
            label: 'Undo',
            onClick: () => {
              for (const word of learned) void removeDictationWord(word).catch(() => {});
            },
          });
        })
        .catch(() => {});
    },
    [showToast]
  );

  const stop = useCallback(() => {
    holdingRef.current = false;
    if (phaseRef.current === 'starting') pendingRef.current = 'stop';
    if (phaseRef.current !== 'listening' || sessionRef.current === null) return;
    setPhase('finishing');
    setLevel(0);
    const session = sessionRef.current;
    // If the stop never reaches the Mac, no "ended" follows: keep what was
    // heard and give the field back rather than sit on "Finishing…".
    stopDictation(session).catch((error) => {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      // What the live recogniser heard is better than nothing.
      if (liveRef.current.trim()) setDraft(joinDictation(originalRef.current, liveRef.current));
      setPhase('idle');
      showToast(formatCommandError(asCommandError(error)), 'error');
    });
  }, [setDraft, setLevel, setPhase, showToast]);

  const cancel = useCallback(() => {
    // Already sent (held for its better words): nothing to cancel.
    if (heldRef.current !== null) return;
    holdingRef.current = false;
    sendAfterRef.current = null;
    if (phaseRef.current === 'starting') pendingRef.current = 'cancel';
    const session = sessionRef.current;
    if (session === null) return;
    sessionRef.current = null;
    setDraft(originalRef.current);
    setLevel(0);
    setPhase('idle');
    void cancelDictation(session);
  }, [setDraft, setLevel, setPhase]);

  const start = useCallback(async () => {
    if (!enabled || phaseRef.current !== 'idle') return;
    originalRef.current = getDraft();
    baseRef.current = '';
    liveRef.current = '';
    gotWordsRef.current = false;
    unwrittenRef.current = false;
    setFailed(null);
    const fresh = newDictationMeter();
    fresh.listeners = meterRef2.current.listeners;
    meterRef2.current = fresh;
    setMeter(fresh);
    pendingRef.current = null;
    sendAfterRef.current = null;
    setBlocked(null);
    setPhase('starting');
    try {
      const vocabulary = await getVocabulary().catch(() => []);
      const result = await startDictation(vocabulary, getContext?.());
      if (result.status === 'blocked') {
        setBlocked(result.reason);
        setPhase('idle');
        return;
      }
      sessionRef.current = result.session;
      meterRef2.current.mic = result.mic ?? null;
      meterRef2.current.startedAt = Date.now();
      setPhase('listening');
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending === 'stop') stop();
      else if (pending === 'cancel') cancel();
    } catch (error) {
      setPhase('idle');
      showToast(formatCommandError(asCommandError(error)), 'error');
    }
  }, [enabled, getDraft, getVocabulary, getContext, setPhase, stop, cancel, showToast]);

  /** Stop listening and send once the words are in. */
  const stopAndSend = useCallback(
    (send: () => void) => {
      if (phaseRef.current === 'idle') return send();
      sendAfterRef.current = send;
      if (holdOnSend && heldRef.current === null) {
        const words = getField();
        heldRef.current = words;
        setHeld(words);
        setField('');
      }
      if (phaseRef.current === 'listening' || phaseRef.current === 'starting') stop();
    },
    [stop, holdOnSend, getField, setField]
  );

  /** Try again on a recording that couldn't be written out. */
  const retry = useCallback(() => {
    const session = failed;
    if (session === null || phaseRef.current !== 'idle') return;
    setFailed(null);
    originalRef.current = getDraft();
    liveRef.current = '';
    gotWordsRef.current = false;
    unwrittenRef.current = false;
    sessionRef.current = session;
    setPhase('tidying');
    retryDictation(session).catch((error) => {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      setPhase('idle');
      showToast(formatCommandError(asCommandError(error)), 'error');
    });
  }, [failed, getDraft, setPhase, showToast]);

  const toggle = useCallback(() => {
    if (phaseRef.current === 'idle') void start();
    else stop();
  }, [start, stop]);

  /**
   * Composer keys: hold ⌥Space to talk, Escape to cancel, Enter to stop and
   * send (with `send`; without, Enter only stops). True if handled.
   */
  const onComposerKeyDown = useCallback(
    (e: KeyboardEvent, send?: () => void) => {
      if (e.code === 'Space' && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!e.repeat && phaseRef.current === 'idle') {
          holdingRef.current = true;
          void start();
        }
        return true;
      }
      if (e.key === 'Escape' && phaseRef.current !== 'idle') {
        e.preventDefault();
        cancel();
        return true;
      }
      // Enter while listening stops and sends once the last words are in
      // (and written out again). Shift+Enter only stops.
      if (e.key === 'Enter' && phaseRef.current !== 'idle') {
        e.preventDefault();
        if (send && !e.shiftKey) stopAndSend(send);
        else stop();
        return true;
      }
      return false;
    },
    [start, stop, cancel, stopAndSend]
  );

  // Releasing either key of the hold ends it; ⌘⇧D toggles from anywhere in
  // the chat. Window-level so a release outside the composer still counts.
  useEffect(() => {
    const onKeyUp = (e: globalThis.KeyboardEvent) => {
      if (holdingRef.current && (e.code === 'Space' || e.key === 'Alt')) stop();
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.code === 'KeyD' && !e.repeat) {
        e.preventDefault();
        toggle();
      }
    };
    const onBlur = () => {
      if (holdingRef.current) stop();
    };
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [stop, toggle]);

  useCommands(
    () =>
      enabled
        ? [
            {
              id: 'agents.dictate',
              title: phase === 'idle' ? 'Dictate a message' : 'Stop dictating',
              icon: <MicrophoneIcon size={14} />,
              category: 'action',
              shortcut: '⌘⇧D',
              keywords: ['voice', 'speak', 'microphone', 'speech', 'talk'],
              run: toggle,
            },
          ]
        : [],
    [enabled, phase, toggle]
  );

  return {
    phase,
    blocked,
    /** Windows and Linux, first use: how much of the speech model is here (0..1). */
    preparing,
    dismissBlocked: () => setBlocked(null),
    toggle,
    cancel,
    stopAndSend,
    /** The words of a message sent before they were all in (`holdOnSend`): show it as on its way. */
    held,
    onComposerKeyDown,
    /** This dictation as it's heard: the wave, the time, "Can't hear you". */
    meter,
    /** Heard but couldn't be written out: Try again (null when not). */
    retry: failed !== null ? retry : null,
    dismissFailed: () => setFailed(null),
    /** Call with a message as it's sent: learns the fixes you made to dictated words. */
    noteSent,
  };
}
