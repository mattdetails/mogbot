/**
 * An agent's task list, from the line under its name or the ⋯ menu: Doing,
 * Next, Waits on you and Done today, each line in the user's own words with
 * who asked and when (`taskWords`, shared with the desk). Read from the Mac
 * (`agents.tasks`); a list that can't be refreshed stays, saying from when.
 */

import {
  TASK_WORDS,
  taskClock,
  taskGroups,
  taskSubLine,
  type AgentTask,
} from '@shipstudio/companion-protocol';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SheetTitle } from '../components/SheetTitle';
import { SheetPage, T } from '../components/ui';
import { makeStyles, useColors } from '../lib/appearance';
import { withAgentAccent } from '../lib/accentScreen';
import { useAgentTasks } from '../lib/agentTasks';
import { useComputer } from '../lib/computer';
import { catchUp, radius, space, type } from '../lib/theme';
import { useApp } from '../lib/store';
import { ScrollView } from 'react-native-gesture-handler';

export default withAgentAccent(TasksSheet);

/** A line's mark: Doing a ring with a centre, Next an empty square, Waits an amber square, Done a filled check. */
function Mark({ state }: { state: AgentTask['state'] | 'done-mark' }) {
  const colors = useColors();
  const styles = useStyles();
  if (state === 'doing') {
    return (
      <View style={[styles.mark, styles.ring, { borderColor: colors.textPrimary }]}>
        <View style={[styles.centre, { backgroundColor: colors.textPrimary }]} />
      </View>
    );
  }
  if (state === 'waiting' || state === 'stuck') {
    return <View style={[styles.mark, styles.square, { backgroundColor: colors.accentWarning }]} />;
  }
  if (state === 'done') {
    return (
      <View style={[styles.mark, styles.square, { backgroundColor: colors.accentSuccess }]}>
        <T variant="caption" color={colors.surfaceApp}>
          ✓
        </T>
      </View>
    );
  }
  return <View style={[styles.mark, styles.square, { borderColor: colors.borderStrong }]} />;
}

function Group({ label, items }: { label: string; items: AgentTask[] }) {
  const colors = useColors();
  const styles = useStyles();
  if (items.length === 0) return null;
  return (
    <View style={styles.group}>
      <T
        variant="caption"
        color={colors.textMuted}
        accessibilityRole="header"
        style={styles.groupLabel}
      >
        {label.toUpperCase()}
      </T>
      {items.map((t) => {
        const waiting = t.state === 'waiting' || t.state === 'stuck';
        const done = t.state === 'done';
        return (
          <View
            key={t.id}
            style={styles.line}
            accessible
            accessibilityLabel={`${t.title}, ${taskSubLine(t)}`}
          >
            <Mark state={t.state} />
            <View style={styles.lineText}>
              <T
                color={done ? colors.textMuted : colors.textStrong}
                style={[styles.title, done && styles.struck]}
              >
                {t.title}
              </T>
              <T variant="caption" color={waiting ? colors.accentWarning : colors.textMuted}>
                {taskSubLine(t)}
              </T>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function TasksSheet() {
  const colors = useColors();
  const styles = useStyles();
  const comp = useComputer();
  const { id } = useLocalSearchParams<{ id: string }>();
  const agent = useApp((s) => s.overview?.agents.find((a) => a.id === id));
  const { tasks, at, failed } = useAgentTasks(id, agent?.status.state);
  const groups = tasks ? taskGroups(tasks, at ?? 0) : null;
  const todo = tasks?.open.length ?? 0;
  const empty =
    !!groups &&
    !groups.doing.length &&
    !groups.next.length &&
    !groups.waits.length &&
    !groups.done.length;
  return (
    <SheetPage>
      <SheetTitle>{TASK_WORDS.title}</SheetTitle>
      <ScrollView contentContainerStyle={styles.scroll}>
        {tasks && (
          <T variant="small" color={colors.textMuted} style={styles.count}>
            {todo === 0 ? TASK_WORDS.nothing : `${todo} to do`}
          </T>
        )}
        {failed && at !== null && (
          <T variant="small" color={colors.accentWarning} style={styles.count}>
            {TASK_WORDS.stale(comp.your, taskClock(at))}
          </T>
        )}
        {empty && (
          <T color={colors.textSecondary} style={styles.empty}>
            {TASK_WORDS.empty}
          </T>
        )}
        {groups && (
          <>
            <Group label={TASK_WORDS.doing} items={groups.doing} />
            <Group label={TASK_WORDS.next} items={groups.next} />
            <Group label={TASK_WORDS.waits} items={groups.waits} />
            <Group label={TASK_WORDS.doneToday} items={groups.done} />
          </>
        )}
      </ScrollView>
    </SheetPage>
  );
}

const MARK = 18;
const useStyles = makeStyles((colors) => ({
  scroll: { padding: space.lg, gap: space.lg },
  count: { marginBottom: space.xs },
  empty: { paddingVertical: space.xl },
  group: { gap: space.sm },
  groupLabel: { letterSpacing: 1, fontSize: catchUp.eyebrow },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, minHeight: 44 },
  lineText: { flex: 1, gap: space['2xs'] },
  title: { fontSize: type.body },
  struck: { textDecorationLine: 'line-through' },
  mark: {
    width: MARK,
    height: MARK,
    marginTop: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { borderWidth: 2, borderRadius: radius.pill },
  centre: { width: MARK / 3, height: MARK / 3, borderRadius: radius.pill },
  square: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.inner / 2,
  },
}));

export { ScreenError as ErrorBoundary } from '../components/ScreenError';
