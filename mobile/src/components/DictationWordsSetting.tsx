/**
 * Settings → Dictation words: the words dictation should always get right,
 * as the computer keeps them (`dictation.words`), typed there or learned
 * from fixes made before sending. Read-only here, with Remove
 * (`dictation.removeWord`, audited on the Mac; a removed word is never
 * learned again). Adding stays on the computer. A Mac that doesn't serve it,
 * or has no words yet, shows nothing.
 */

import type { DictationWords } from '@shipstudio/companion-protocol';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { wordDetail } from '../lib/dictationWords';
import { useLinkLive } from '../lib/linkLive';
import { haptic } from '../lib/haptics';
import { call, describeError } from '../lib/session';
import { useServed } from '../lib/store';
import { useComputer } from '../lib/computer';
import { choose } from './menu';
import { Row, Section, tap } from './ui';

/** The list opens this long; the rest is "Show all". */
const FIRST = 8;

export function DictationWordsSetting() {
  const comp = useComputer();
  const canRead = useServed('dictation.words');
  const canRemove = useServed('dictation.removeWord');
  const [list, setList] = useState<DictationWords | undefined>(undefined);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const connected = useLinkLive();

  const read = useCallback(() => {
    if (!canRead || !connected) return;
    call('dictation.words', {}).then(
      (r) => setList(r),
      () => {}
    );
  }, [canRead, connected]);
  useEffect(() => {
    read();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && read());
    return () => sub.remove();
  }, [read]);

  if (!canRead || !list || list.words.length === 0) return null;

  const remove = async (word: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setList(await call('dictation.removeWord', { word }));
      haptic.select();
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn’t remove the word', describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = all ? list.words : list.words.slice(0, FIRST);
  const more = list.words.length - shown.length;
  return (
    <Section
      title="Dictation words"
      footer={`Names and terms dictation should always get right, kept on ${comp.your}. Add them there; when you fix the same dictated word twice before sending, it's added here on its own.`}
    >
      {shown.map((w, i) => (
        <Row
          key={w.word}
          label={w.word}
          detail={wordDetail(w, comp.your)}
          onPress={
            canRemove
              ? () => {
                  tap();
                  choose(w.word, [
                    { label: 'Remove', destructive: true, run: () => void remove(w.word) },
                  ]);
                }
              : undefined
          }
          disabled={busy}
          last={i === shown.length - 1 && more <= 0}
        />
      ))}
      {more > 0 && (
        <Row
          label={`Show all ${list.words.length}`}
          onPress={() => {
            tap();
            setAll(true);
          }}
          last
        />
      )}
    </Section>
  );
}
