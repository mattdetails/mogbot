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
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { choose, showActions } from '../components/menu';
import { SheetTitle } from '../components/SheetTitle';
import { Button, IconButton, Icon, SheetPage, T } from '../components/ui';
import { haptic } from '../lib/haptics';
import { call, describeError } from '../lib/session';
import { useServed } from '../lib/store';
import { makeStyles, useColors } from '../lib/appearance';
import { withAgentAccent } from '../lib/accentScreen';
import { useAgentTasks } from '../lib/agentTasks';
import { useComputer } from '../lib/computer';
import { catchUp, iconSize, radius, space, type } from '../lib/theme';
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

type Mode = 'none' | 'add' | 'reorder' | 'drop';

function Group({
  label,
  items,
  mode = 'none',
  onMove,
  onDrop,
}: {
  label: string;
  items: AgentTask[];
  mode?: Mode;
  onMove?: (t: AgentTask, direction: 'up' | 'down') => void;
  onDrop?: (t: AgentTask) => void;
}) {
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
      {items.map((t, i) => {
        const waiting = t.state === 'waiting' || t.state === 'stuck';
        const done = t.state === 'done';
        return (
          <Pressable
            key={t.id}
            style={styles.line}
            accessible
            accessibilityLabel={`${t.title}, ${taskSubLine(t)}`}
            accessibilityRole={mode === 'drop' && !done ? 'button' : undefined}
            accessibilityHint={mode === 'drop' && !done ? 'Drops this line' : undefined}
            disabled={mode !== 'drop' || done}
            onPress={() => onDrop?.(t)}
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
            {mode === 'reorder' && !done && !!onMove && (
              <View style={styles.moves}>
                <IconButton
                  name="arrow.up"
                  label={`Move ${t.title} up`}
                  disabled={i === 0}
                  onPress={() => onMove?.(t, 'up')}
                />
                <IconButton
                  name="arrow.down"
                  label={`Move ${t.title} down`}
                  disabled={i === items.length - 1}
                  onPress={() => onMove?.(t, 'down')}
                />
              </View>
            )}
            {mode === 'drop' && !done && (
              <Icon name="minus.circle" size={iconSize.button} color={colors.accentError} />
            )}
          </Pressable>
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
  const { tasks, at, failed, reload } = useAgentTasks(id, agent?.status.state);
  const canAdd = useServed('agents.taskAdd');
  const canMove = useServed('agents.taskMove');
  const canDrop = useServed('agents.taskDrop');
  const [mode, setMode] = useState<Mode>('none');
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const older = `Update ${comp.your} to change the list from here.`;
  // The call, then the list again: what the Mac says is what's shown.
  const act = (run: () => Promise<unknown>) => {
    setProblem(null);
    run().then(
      () => {
        haptic.light();
        reload();
      },
      (e: unknown) => setProblem(describeError(e))
    );
  };
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    setMode('none');
    act(() => call('agents.taskAdd', { agentId: id, title }));
  };
  const openMenu = () =>
    showActions(
      undefined,
      [
        { id: 'add', title: 'Add a task', icon: 'plus' },
        { id: 'reorder', title: 'Reorder', icon: 'arrow.up' },
        { id: 'drop', title: 'Drop a task', icon: 'minus.circle', destructive: true },
      ],
      (a) => {
        setProblem(null);
        const served = a === 'add' ? canAdd : a === 'reorder' ? canMove : canDrop;
        if (!served) return setProblem(older);
        setMode(a);
      }
    );
  const dropIt = (t: AgentTask) =>
    choose(`Drop “${t.title}”?`, [
      {
        label: 'Drop it',
        destructive: true,
        run: () => act(() => call('agents.taskDrop', { agentId: id, taskId: t.id })),
      },
    ]);
  const move = (t: AgentTask, direction: 'up' | 'down') =>
    act(() => call('agents.taskMove', { agentId: id, taskId: t.id, direction }));
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
      <View style={styles.head}>
        <SheetTitle
          // The sheet's own ⋯ (Reorder / Drop / Add) takes the × place; the grabber closes it.
          close={false}
          trailing={
            <>
              {tasks && (
                <T variant="small" color={colors.textMuted}>
                  {todo === 0 ? TASK_WORDS.nothing : `${todo} to do`}
                </T>
              )}
              <IconButton name="ellipsis" label="Tasks menu" fallback="⋯" onPress={openMenu} />
            </>
          }
        >
          {TASK_WORDS.title}
        </SheetTitle>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {mode === 'add' && (
          <View style={styles.addRow}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={add}
              returnKeyType="done"
              placeholder="What needs doing?"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="New task"
              style={[styles.input, { color: colors.textStrong, borderColor: colors.borderStrong }]}
            />
            <View style={styles.addButtons}>
              <Button
                title="Add"
                variant="answer"
                size="compact"
                disabled={!draft.trim()}
                onPress={add}
              />
              <Button
                title="Cancel"
                variant="outline"
                size="compact"
                onPress={() => {
                  setDraft('');
                  setMode('none');
                }}
              />
            </View>
          </View>
        )}
        {(mode === 'reorder' || mode === 'drop') && (
          <View style={styles.modeBar}>
            <T variant="small" color={colors.textSecondary} style={styles.modeText}>
              {mode === 'reorder' ? 'Move a line up or down' : 'Tap the line to drop'}
            </T>
            <Button title="Done" variant="outline" size="compact" onPress={() => setMode('none')} />
          </View>
        )}
        {problem && (
          <T variant="small" color={colors.accentWarning} style={styles.count}>
            {problem}
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
            <Group label={TASK_WORDS.doing} items={groups.doing} mode={mode} onDrop={dropIt} />
            <Group
              label={TASK_WORDS.next}
              items={groups.next}
              mode={mode}
              onMove={move}
              onDrop={dropIt}
            />
            <Group label={TASK_WORDS.waits} items={groups.waits} mode={mode} onDrop={dropIt} />
            <Group label={TASK_WORDS.doneToday} items={groups.done} />
          </>
        )}
      </ScrollView>
    </SheetPage>
  );
}

const MARK = 18;
const useStyles = makeStyles((colors) => ({
  head: { paddingHorizontal: space.xl, paddingTop: space.lg },
  scroll: { paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.lg },
  count: { marginBottom: space.xs },
  moves: { flexDirection: 'row' },
  addRow: { gap: space.sm },
  addButtons: { flexDirection: 'row', gap: space.sm },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    fontSize: type.body,
  },
  modeBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  modeText: { flex: 1 },
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
