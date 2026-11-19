/**
 * Missions: a goal with a share of your usage (desk: What's in flight →
 * Missions). One card per open mission, newest first, then the finished ones.
 * Read-only apart from the user's own calls (Pause, Add 10%, Accept), which
 * the Mac audits. `?id=` shows one. Starting one is the Chief's, in chat.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { draftLabel, ordered, reconnectMessage } from '@shipstudio/companion-protocol';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { MissionCard } from '../components/MissionCard';
import { SheetTitle } from '../components/SheetTitle';
import { Button, SheetPage, T } from '../components/ui';
import { makeStyles, useColors } from '../lib/appearance';
import { useMissions } from '../lib/missions';
import { send } from '../lib/session';
import { useApp } from '../lib/store';
import { space } from '../lib/theme';

export default function Missions() {
  const styles = useStyles();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { missions } = useMissions();
  const chiefId = useApp((s) => s.overview?.agents.find((a) => a.isMain)?.id);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const shown = useMemo(() => {
    const all = ordered(missions ?? []);
    return id ? all.filter((m) => m.id === id) : all;
  }, [missions, id]);

  return (
    <SheetPage>
      <ScrollView contentContainerStyle={styles.page}>
        <SheetTitle>Missions</SheetTitle>
        {missions === null ? (
          <T color={colors.textSecondary}>Reading your missions…</T>
        ) : shown.length === 0 ? (
          <T color={colors.textSecondary}>
            Missions give a goal a share of your usage. Ask your Chief of Staff to start one.
          </T>
        ) : (
          shown.map((m) =>
            m.state === 'draft' ? (
              <Button
                key={m.id}
                title={`${draftLabel(m)}: ${m.goal || 'Untitled mission'}`}
                variant="secondary"
                lines={2}
                onPress={() => router.push({ pathname: '/mission-new', params: { id: m.id } })}
              />
            ) : (
              <MissionCard
                key={m.id}
                mission={m}
                now={now}
                onReconnect={() => {
                  if (!chiefId) return;
                  void send(chiefId, reconnectMessage(m)).catch(() => {});
                  router.dismissTo?.('/(tabs)/agents');
                  router.push({ pathname: '/chat/[id]', params: { id: chiefId } });
                }}
                onReview={() => {
                  if (!chiefId) return;
                  router.dismissTo?.('/(tabs)/agents');
                  router.push({ pathname: '/chat/[id]', params: { id: chiefId } });
                }}
              />
            )
          )
        )}
        <Button title="New mission" variant="outline" onPress={() => router.push('/mission-new')} />
      </ScrollView>
    </SheetPage>
  );
}

const useStyles = makeStyles(() => ({
  page: { padding: space.lg, gap: space.lg, paddingBottom: space['2xl'] },
}));

/** A throw while drawing stays on this screen, with the way back. */
export { ScreenError as ErrorBoundary } from '../components/ScreenError';
