/**
 * The agent sheet's "Open asks": what this agent still owes, read from the
 * Mac with `agents.tasks` (`agents::tasks`): doing now, next in line, waiting
 * on someone, stuck. The Mac decides every state; this only lists them. A Mac
 * that doesn't serve it shows nothing, and nothing is shown before it answers.
 */

import { taskStateLabel, type AgentTasks } from '@shipstudio/companion-protocol';
import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Row, SectionTitle, T, groupSurface, pageRhythm } from './ui';
import { useLinkLive } from '../lib/linkLive';
import { call } from '../lib/session';
import { useServed } from '../lib/store';
import { makeStyles, useColors } from '../lib/appearance';
import { space } from '../lib/theme';

const RHYTHM = pageRhythm();

export function OpenAsks({ agentId }: { agentId: string }) {
  const colors = useColors();
  const styles = useStyles();
  const canRead = useServed('agents.tasks');
  const connected = useLinkLive();
  // `undefined` until the Mac answers: nothing is shown that wasn't read.
  const [tasks, setTasks] = useState<AgentTasks | undefined>(undefined);

  const read = useCallback(() => {
    if (!canRead || !connected) return;
    call('agents.tasks', { agentId }).then(
      (r) => setTasks(r),
      () => {}
    );
  }, [canRead, connected, agentId]);
  useEffect(() => {
    read();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && read());
    return () => sub.remove();
  }, [read]);

  if (!canRead || tasks === undefined) return null;

  return (
    <>
      <SectionTitle title="Open asks" style={styles.title} />
      <View style={styles.list}>
        {tasks.open.length === 0 ? (
          <View style={styles.none}>
            <T variant="small" color={colors.textSecondary}>
              Nothing open.
            </T>
          </View>
        ) : (
          tasks.open.map((t, i) => (
            <Row
              key={t.id}
              label={t.title}
              value={taskStateLabel({ state: t.state })}
              detail={
                t.waitingOn
                  ? `On ${t.waitingOn}`
                  : t.source === 'agent' && t.from
                    ? `From ${t.from.name}`
                    : undefined
              }
              warning={t.state === 'stuck'}
              last={i === tasks.open.length - 1}
            />
          ))
        )}
      </View>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  title: RHYTHM.title,
  list: groupSurface(colors),
  none: { padding: space.lg },
}));
