/**
 * Settings → Notifications → End-of-day check-in: read with `agents.endOfDay`
 * and set with `agents.setEndOfDay` (audited on the Mac). One row: its time,
 * or "Off"; tapping it offers the common evenings and Off. A Mac that doesn't
 * serve it shows nothing; one that reads but can't set shows the row, not
 * tappable.
 */

import {
  END_OF_DAY_DETAIL,
  END_OF_DAY_TIMES,
  END_OF_DAY_TITLE,
  endOfDayLabel,
  type EndOfDay,
} from '@shipstudio/companion-protocol';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { choose } from './menu';
import { Row, Section, tap } from './ui';
import { haptic } from '../lib/haptics';
import { useLinkLive } from '../lib/linkLive';
import { call, describeError } from '../lib/session';
import { useServed } from '../lib/store';

export function EndOfDaySetting() {
  const canRead = useServed('agents.endOfDay');
  const canSet = useServed('agents.setEndOfDay');
  // `undefined` until the Mac answers: nothing is shown that wasn't read.
  const [eod, setEod] = useState<EndOfDay | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const connected = useLinkLive();

  const read = useCallback(() => {
    if (!canRead || !connected) return;
    call('agents.endOfDay', {}).then(
      (r) => setEod(r),
      () => {}
    );
  }, [canRead, connected]);
  useEffect(() => {
    read();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && read());
    return () => sub.remove();
  }, [read]);

  if (!canRead || eod === undefined) return null;

  const set = async (on: boolean, at: number) => {
    if (busy || (on === eod.on && at === eod.at)) return;
    setBusy(true);
    try {
      const r = await call('agents.setEndOfDay', { on, at });
      haptic.select();
      setEod(r);
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn’t change the end-of-day check-in', describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = () => {
    tap();
    choose(END_OF_DAY_TITLE, [
      ...END_OF_DAY_TIMES.map((at) => ({
        label: endOfDayLabel({ on: true, at }),
        run: () => void set(true, at),
      })),
      ...(eod.on
        ? [{ label: 'Turn off', destructive: true, run: () => void set(false, eod.at) }]
        : []),
    ]);
  };

  return (
    <Section title={END_OF_DAY_TITLE} footer={END_OF_DAY_DETAIL}>
      <Row
        label={END_OF_DAY_TITLE}
        value={endOfDayLabel(eod)}
        onPress={canSet ? pick : undefined}
        disabled={canSet && busy}
        last
      />
    </Section>
  );
}
