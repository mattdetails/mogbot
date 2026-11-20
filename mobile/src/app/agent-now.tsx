/**
 * The quiet header's sheet (spec-header-dropdown, the phone): tapping the
 * name in a chat opens everything about the agent right now, in the desk
 * panel's groups, each an inset card: who it is, Now, its top tasks, what
 * needs your OK, its conversations (the only conversation switcher), and
 * Edit agent. A group with nothing to show is left out. Swipe down closes it.
 */

import {
  conversationTitle,
  CONTINUE_TEXT,
  failureFix,
  INDEPENDENCE_LABEL,
  type AgentTask,
  type ConversationView,
} from '@shipstudio/companion-protocol';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AgentKey } from '../components/AgentKey';
import { Button, Icon, SheetPage, T } from '../components/ui';
import { withAgentAccent } from '../lib/accentScreen';
import { useAgentTasks } from '../lib/agentTasks';
import { agentKeyState, engineName, formatAgo } from '../lib/agents';
import { makeStyles, useColors } from '../lib/appearance';
import { jumpToFirstCard } from '../lib/chatJump';
import { haptic } from '../lib/haptics';
import { nowLine, requestsLine, taskSummary, type NowTone } from '../lib/headerHint';
import { conversationsOffered } from '../lib/conversations';
import { useLinkLive } from '../lib/linkLive';
import {
  describeError,
  newConversation,
  openConversation,
  refreshConversations,
  send,
} from '../lib/session';
import { useApp } from '../lib/store';
import { iconSize, keySize, radius, space } from '../lib/theme';

export default withAgentAccent(AgentNowSheet);

/** Conversations shown besides the one on screen; the rest are in Conversations. */
const MORE_CONVERSATIONS = 3;
/** Task lines shown: Doing, then what waits on you, then Next. */
const TOP_TASKS = 3;

function AgentNowSheet() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const agent = useApp((s) => s.overview?.agents.find((a) => a.id === id));
  const team = useApp((s) => s.overview?.independence);
  const list = useApp((s) => s.conversations[id]);
  const offered = useApp((s) => conversationsOffered(s.welcome));
  const viewing = useApp((s) => s.viewing[id] ?? s.conversations[id]?.current);
  const lines = useApp((s) => s.chats[id]?.messages);
  const connected = useLinkLive();
  const { tasks } = useAgentTasks(id, agent?.status.state);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (connected) refreshConversations(id).catch(() => {});
  }, [connected, id]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/chat/[id]', params: { id } });
  };
  const run = (work: () => Promise<unknown>) => {
    setError(null);
    work().then(
      () => {
        haptic.success();
        close();
      },
      (e: unknown) => {
        haptic.error();
        setError(describeError(e));
      }
    );
  };

  const top = useMemo<AgentTask[]>(() => {
    if (!tasks) return [];
    const by = (s: AgentTask['state'][]) => tasks.open.filter((t) => s.includes(t.state));
    return [...by(['doing']), ...by(['waiting', 'stuck']), ...by(['next'])].slice(0, TOP_TASKS);
  }, [tasks]);

  const conversations = useMemo<ConversationView[]>(() => {
    const items = list?.items ?? [];
    const current = items.find((c) => c.id === viewing);
    const rest = items
      .filter((c) => c.id !== viewing)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .slice(0, MORE_CONVERSATIONS);
    return current ? [current, ...rest] : rest;
  }, [list, viewing]);

  // What Try again sends: Continue for a cut-off turn, else your last words (only words).
  const failure = agent?.failure;
  const retryText = useMemo(() => {
    if (!failure) return null;
    const fix = failureFix(failure.kind);
    if (fix === 'continue') return CONTINUE_TEXT;
    if (fix !== 'retry') return null;
    const all = lines ?? [];
    for (let i = all.length - 1; i >= 0; i--) {
      const m = all[i];
      if (m.kind !== 'user') continue;
      return m.attachments?.length ? null : m.text.trim() || null;
    }
    return null;
  }, [failure, lines]);

  if (!agent) return <SheetPage>{null}</SheetPage>;

  const nowRow = nowLine(agent, engineName(agent), now);
  const level = agent.independence ?? team;
  const runsOn = [`Runs on ${engineName(agent)}`, level ? INDEPENDENCE_LABEL[level] : null]
    .filter(Boolean)
    .join(' · ');
  const counts = agent.tasks;
  const summary = counts ? taskSummary(counts.toDo, counts.waits) : null;
  const requests = agent.pendingApprovals ?? 0;
  const dotOf = (tone: NowTone) =>
    tone === 'working'
      ? colors.statusRunning
      : tone === 'waits'
        ? colors.accentWarning
        : tone === 'failed'
          ? colors.accentErrorLight
          : colors.textFaint;

  return (
    <SheetPage>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Who it is */}
        <View style={styles.identity}>
          <AgentKey
            id={agent.id}
            name={agent.name}
            color={agent.color}
            state={agentKeyState(agent)}
            size={keySize.lg}
          />
          <View style={styles.identityText}>
            <T variant="title" color={colors.textStrong} numberOfLines={1}>
              {agent.name}
            </T>
            {!!agent.role?.trim() && (
              <T color={colors.textSecondary} numberOfLines={2}>
                {agent.role.trim()}
              </T>
            )}
            <T variant="small" color={colors.textMuted} numberOfLines={1}>
              {runsOn}
            </T>
          </View>
        </View>

        {error && (
          <T variant="small" color={colors.accentErrorLight}>
            {error}
          </T>
        )}

        {/* Now */}
        <Group label="Now">
          <Line
            leading={<Dot color={dotOf(nowRow.tone)} />}
            text={nowRow.text}
            ink={
              nowRow.tone === 'waits'
                ? colors.accentWarning
                : nowRow.tone === 'failed'
                  ? colors.accentErrorLight
                  : colors.textBody
            }
            trailing={
              nowRow.time ? (
                <T color={colors.textMuted}>{nowRow.time}</T>
              ) : nowRow.retryable && retryText ? (
                <Button
                  title="Try again"
                  variant="outline"
                  size="compact"
                  disabled={!connected}
                  onPress={() => run(() => send(agent.id, retryText))}
                />
              ) : undefined
            }
            last
          />
        </Group>

        {/* Tasks: only when there are any */}
        {summary && (counts!.toDo > 0 || counts!.waits > 0 || top.length > 0) && (
          <Group
            label="Tasks"
            aside={
              <T variant="small" color={colors.textSecondary}>
                {summary.toDo}
                {summary.waits ? ' · ' : ''}
                {summary.waits && (
                  <T variant="small" color={colors.accentWarning}>
                    {summary.waits}
                  </T>
                )}
              </T>
            }
          >
            {top.map((t) => (
              <Line key={t.id} leading={<Mark state={t.state} />} text={t.title} />
            ))}
            <Line
              text="All tasks"
              ink={colors.textSecondary}
              trailing={
                <Icon name="chevron.right" size={iconSize.inline} color={colors.textMuted} />
              }
              onPress={() => {
                close();
                router.push({ pathname: '/tasks', params: { id: agent.id } });
              }}
              last
            />
          </Group>
        )}

        {/* Needs your OK: only when there are requests */}
        {requests > 0 && (
          <Group label="Needs your OK">
            <Line
              leading={<Dot color={colors.accentWarning} />}
              text={requestsLine(requests)}
              trailing={
                <Button
                  title="Review"
                  variant="outline"
                  size="compact"
                  onPress={() => {
                    close();
                    // After the sheet is down: the chat under it scrolls to the first card.
                    setTimeout(() => jumpToFirstCard(agent.id), 350);
                  }}
                />
              }
              last
            />
          </Group>
        )}

        {/* Conversations: the only switcher */}
        {offered && (
          <Group label="Conversations">
            {conversations.map((c) => {
              const current = c.id === viewing;
              return (
                <Line
                  key={c.id}
                  selected={current}
                  leading={
                    current ? (
                      <Icon name="checkmark" size={iconSize.inline} color={colors.textStrong} />
                    ) : (
                      <View style={styles.checkSpace} />
                    )
                  }
                  text={conversationTitle(c)}
                  trailing={
                    <T color={c.waiting > 0 ? colors.accentWarning : colors.textMuted}>
                      {c.waiting > 0
                        ? 'Needs your OK'
                        : current
                          ? 'now'
                          : c.lastActivityAt > 0
                            ? formatAgo(c.lastActivityAt, now)
                            : ''}
                    </T>
                  }
                  onPress={
                    current || !connected ? undefined : () => run(() => openConversation(id, c.id))
                  }
                />
              );
            })}
            <Line
              leading={<Icon name="plus" size={iconSize.inline} color={colors.textSecondary} />}
              text="New conversation"
              ink={connected ? colors.textBody : colors.textMuted}
              onPress={connected ? () => run(() => newConversation(id)) : undefined}
              last
            />
          </Group>
        )}

        {/* Footer: everything else stays in ⋯ */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            hitSlop={space.sm}
            onPress={() => {
              close();
              router.push({ pathname: '/agent/[id]', params: { id: agent.id } });
            }}
          >
            <T color={colors.textSecondary}>Edit agent</T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            hitSlop={space.sm}
            onPress={() => {
              close();
              router.push({ pathname: '/instructions', params: { id: agent.id } });
            }}
          >
            <T color={colors.textSecondary}>Instructions and memory</T>
          </Pressable>
        </View>
      </ScrollView>
    </SheetPage>
  );
}

/** A group: its label (and what's beside it), then one inset card. */
function Group({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <View style={styles.groupLabel}>
        <T variant="small" color={colors.textSecondary}>
          {label}
        </T>
        {aside}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** One 44pt row in a card; a selected one has its own concentric fill. */
function Line({
  leading,
  text,
  ink,
  trailing,
  onPress,
  selected,
  last,
}: {
  leading?: ReactNode;
  text: string;
  ink?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  last?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={selected != null ? { selected } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.line,
        selected && [styles.selected, { backgroundColor: colors.surfaceSelected }],
        pressed && !!onPress && { backgroundColor: colors.surfaceGroupPressed },
      ]}
    >
      {leading}
      <T color={ink ?? colors.textBody} numberOfLines={1} style={styles.lineText}>
        {text}
      </T>
      {trailing}
      {!last && !selected && <View style={styles.divider} />}
    </Pressable>
  );
}

function Dot({ color }: { color: string }) {
  const styles = useStyles();
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/** Doing a ring with a centre; waits an amber box; Next an empty box. */
function Mark({ state }: { state: AgentTask['state'] }) {
  const colors = useColors();
  const styles = useStyles();
  if (state === 'doing') {
    return (
      <View style={[styles.mark, styles.ring, { borderColor: colors.textPrimary }]}>
        <View style={[styles.centre, { backgroundColor: colors.textPrimary }]} />
      </View>
    );
  }
  const waits = state === 'waiting' || state === 'stuck';
  return (
    <View
      style={[
        styles.mark,
        styles.box,
        { borderColor: waits ? colors.accentWarning : colors.borderStrong },
      ]}
    />
  );
}

const MARK = 18;
const DOT = 8;

const useStyles = makeStyles((colors) => ({
  content: { padding: space.lg, paddingTop: space.xl, gap: space.lg },
  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  identityText: { flex: 1, gap: space['2xs'] },
  group: { gap: space.xs },
  groupLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: space.xs,
  },
  card: {
    backgroundColor: colors.surfaceGroup,
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  line: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  // Concentric inside the card's 12: radius 10 with a 2px inset.
  selected: {
    margin: space['2xs'],
    borderRadius: radius.inner,
    paddingHorizontal: space.md - space['2xs'],
  },
  lineText: { flex: 1 },
  divider: {
    position: 'absolute',
    left: space.md,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill },
  checkSpace: { width: iconSize.inline },
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  ring: { borderRadius: radius.pill, borderWidth: 1.5 },
  centre: { width: MARK / 2, height: MARK / 2, borderRadius: radius.pill },
  box: { borderRadius: radius.sm, borderWidth: 1.5 },
  footer: {
    flexDirection: 'row',
    gap: space.xl,
    paddingHorizontal: space.xs,
    paddingBottom: space.xl,
  },
}));

export { ScreenError as ErrorBoundary } from '../components/ScreenError';
