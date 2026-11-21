/**
 * Catch up, direction 2 on the phone (design: spec-catchup-dir2.md): one
 * decision per screen. A header (back, "Catch up", "1 of 3" / "N left"),
 * then the open card: who and when, what kind of ask it is (the amber dot's
 * words), what it is asking, and its actions stacked full width under it (the
 * strong answer first; Allow is the neutral answer, never the accent). Under
 * the card the rest of the queue, "Up next · N" (tap to jump), ending on the
 * "While you were away" row. Later sends a card to the end of the queue and
 * never drops it. Done with the decisions, a summary card ("While you were
 * away", Got it in a fixed bar), then "All clear". Words and order are
 * `CATCH_UP` in companion-protocol, shared with the desk.
 *
 * Swiping right never allows: an Allow can't be taken back and a command
 * scrolls under the same finger. Allow is a button, inert for a beat after
 * each card lands, as in the chat.
 */

import { useLinkLive } from '../lib/linkLive';
import type { Agent, AgentMessage, Approval } from '@shipstudio/companion-protocol';
import {
  CATCH_UP,
  CATCH_UP_EYEBROW,
  CATCH_UP_SUMMARY_ROWS,
  catchUpAge,
  catchUpAllClearBody,
  catchUpGroup,
  catchUpLeft,
  catchUpMore,
  catchUpOf,
  catchUpThingsNoDecisions,
  catchUpThingsHead,
  previewText,
  type CatchUpEyebrow,
} from '@shipstudio/companion-protocol';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOutLeft,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { spring } from '../lib/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner } from '../components/agent';
import { AgentKey } from '../components/AgentKey';
import { ApprovalCard, useArmed } from '../components/ApprovalCard';
import { MessageRow } from '../components/chat';
import { RowBoundary } from '../components/RowBoundary';
import { Card, FlatCardContext, Line } from '../components/surfaces';
import { Button, Icon, IconButton, T } from '../components/ui';
import { AgentAccent } from '../lib/accent';
import { askingLine, engineName, failedTurn, failureLine, needsLine } from '../lib/agents';
import { makeStyles, useColors } from '../lib/appearance';
import {
  askAction,
  askState,
  buildItems,
  cardMessages,
  current,
  isDone,
  jumpTo,
  later,
  progressOf,
  upNext,
  OFFER_PROGRESS,
  startQueue,
  syncQueue,
  type CatchItem,
  type CatchQueue,
} from '../lib/catchUp';
import { GalleryContext, chatGallery } from '../lib/gallery';
import { haptic } from '../lib/haptics';
import { SETUP_TITLE } from '../lib/home';
import { useInFlight } from '../lib/once';
import { answerApproval, canCall, describeError, loadLatest, setOpenChat } from '../lib/session';
import { highRisk } from '../lib/needsYou';
import { useApp } from '../lib/store';
import { progress as setupProgress } from '../lib/teamSetup';
import {
  catchKeySize,
  catchUp,
  fonts,
  iconSize,
  lineHeight,
  radius,
  PRESSED,
  READ_LINE,
  space,
  type,
} from '../lib/theme';
import { useComputer } from '../lib/computer';

/** How long a card's chats get to load before the queue starts without them. */
const LOAD_WAIT_MS = 5000;
/** How long a card answered elsewhere, or expired, says so before moving on. */
const MOVE_ON_MS = 1600;
/** Past this share of the width, a swipe left is Next. */
const SWIPE_SHARE = 0.28;

export default function CatchUp() {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const overview = useApp((s) => s.overview);
  const chats = useApp((s) => s.chats);
  const setup = useApp((s) => s.teamSetup);
  const connected = useLinkLive();
  const reviewHere = canCall('agents.import.review');

  // Every chat a card will need, loaded once before the queue starts, so
  // its order doesn't change under you as they arrive.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const agents = useApp.getState().overview?.agents ?? [];
    const loaded = useApp.getState().chats;
    const ids = connected
      ? agents
          .filter(
            (a) =>
              !a.hidden &&
              ((a.pendingApprovals ?? 0) > 0 || a.unread > 0 || !!failedTurn(a)) &&
              !loaded[a.id]?.loaded
          )
          .map((a) => a.id)
      : [];
    let live = true;
    const wait = new Promise((r) => setTimeout(r, LOAD_WAIT_MS));
    void Promise.race([Promise.allSettled(ids.map((id) => loadLatest(id))), wait]).then(
      () => live && setReady(true)
    );
    return () => {
      live = false;
    };
    // Once, on opening: later arrivals join the end through `syncQueue`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = useMemo(
    () => (overview ? buildItems(overview.agents, chats, setup, reviewHere) : []),
    [overview, chats, setup, reviewHere]
  );
  // Decisions first, one card each. What only happened (a result, a routine's
  // run) isn't a decision: it is the summary, "While you were away".
  const fresh = useMemo(() => all.filter((i) => i.kind !== 'reply'), [all]);
  const happened = useMemo(() => all.filter((i) => i.kind === 'reply'), [all]);
  const [queue, setQueue] = useState<CatchQueue | null>(null);
  // Opened on one thing from Catch up's list: that one first, the rest after it.
  const { agent: atAgent, message: atMessage } = useLocalSearchParams<{
    agent?: string;
    message?: string;
  }>();
  useEffect(() => {
    if (!ready) return;
    setQueue((q) => {
      if (q) return syncQueue(q, fresh);
      const start = startQueue(fresh);
      const chosen = atAgent
        ? fresh.find((i) => i.agentId === atAgent && (!atMessage || i.messageId === atMessage))
        : undefined;
      return chosen ? jumpTo(start, chosen.key) : start;
    });
  }, [ready, fresh, atAgent, atMessage]);
  // Cards sent to the end, tagged "Later" until they are the open one again.
  const [laterKeys, setLaterKeys] = useState<ReadonlySet<string>>(new Set());
  // The summary: opened from the queue's last row, or by finishing the decisions.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [gotIt, setGotIt] = useState(false);
  // When the last decision was answered here, for "Last decision: 2:02 pm".
  const [lastDecisionAt, setLastDecisionAt] = useState<number | null>(null);

  const item = queue ? current(queue) : null;
  const next = useCallback(() => setQueue((q) => (q ? advanceQueue(q) : q)), []);
  const sendLater = useCallback(() => {
    setQueue((q) => {
      const it = q ? current(q) : null;
      if (it) setLaterKeys((k) => new Set(k).add(it.key));
      return q ? later(q) : q;
    });
  }, []);
  const answered = useCallback(() => {
    setLastDecisionAt(Date.now());
    next();
  }, [next]);

  // On screen, the card's chat counts as read: the Mac clears its unread
  // and holds its alerts, as an open chat does.
  const readId = item && item.kind !== 'setup' ? item.agentId : null;
  useFocusEffect(
    useCallback(() => {
      if (!readId) return;
      setOpenChat(readId);
      return () => setOpenChat(null);
    }, [readId])
  );

  if (!queue) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Spinner size={iconSize.button} label="Catching up" />
      </View>
    );
  }

  const agents = overview?.agents ?? [];
  const finished = isDone(queue) || !item;
  const showSummary = (finished || summaryOpen) && !gotIt && happened.length > 0;
  if (showSummary) {
    return (
      <Summary
        happened={happened}
        agents={agents}
        onOpen={(id) => router.push({ pathname: '/chat/[id]', params: { id } })}
        onGotIt={() => {
          setGotIt(true);
          setSummaryOpen(false);
        }}
        onBack={() => (finished ? router.back() : setSummaryOpen(false))}
      />
    );
  }
  if (finished) {
    return (
      <AllClear
        lastDecisionAt={lastDecisionAt}
        onBack={() => router.back()}
        onInFlight={() => router.replace('/agents')}
      />
    );
  }

  const agent = agents.find((a) => a.id === item.agentId);
  const { n, of, offer } = progressOf(queue);
  // A skill offer comes after what blocks, and is not counted in "3 of 8".
  const where = offer || of === 0 ? OFFER_PROGRESS : of <= 1 ? catchUpLeft(1) : catchUpOf(n, of);
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader count={where} onBack={() => router.back()} />
      {agent ? (
        <AgentAccent agentId={agent.id}>
          <Shown
            key={item.key}
            item={item}
            agent={agent}
            connected={connected}
            onNext={next}
            onAnswered={answered}
            onLater={sendLater}
            onChat={(at) =>
              router.push({
                pathname: '/chat/[id]',
                params: { id: agent.id, ...(at ? { at } : {}) },
              })
            }
            bottom={insets.bottom}
            footer={
              <UpNext
                items={upNext(queue)}
                agents={agents}
                chats={chats}
                laterKeys={laterKeys}
                summaryCount={gotIt ? 0 : happened.length}
                onJump={(key) => setQueue((q) => (q ? jumpTo(q, key) : q))}
                onSummary={() => setSummaryOpen(true)}
              />
            }
          />
        </AgentAccent>
      ) : (
        // Deleted while queued: nothing to show, so on to the next.
        <Skip onSkip={next} />
      )}
    </View>
  );
}

/** The queue's on-to-the-next, named so the screen's own `next` reads clearly. */
const advanceQueue = (q: CatchQueue): CatchQueue => ({
  ...q,
  at: Math.min(q.at + 1, q.items.length),
});

/** Back (44 pt target), "Catch up", and its count in words. */
function PageHeader({ count, onBack }: { count: string; onBack: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.header}>
      <IconButton name="chevron.left" label="Back" onPress={onBack} />
      <T color={colors.textStrong} accessibilityRole="header" style={styles.pageTitle}>
        {CATCH_UP.title}
      </T>
      <T variant="label" color={colors.textMuted} accessibilityLabel={count} style={styles.count}>
        {count}
      </T>
    </View>
  );
}

function Skip({ onSkip }: { onSkip: () => void }) {
  useEffect(() => onSkip(), [onSkip]);
  return null;
}

/** What kind of ask it is, over its title: the amber dot and its words. */
function eyebrowOf(
  item: CatchItem,
  pending: boolean,
  action: ReturnType<typeof askAction>,
  failed: boolean
): CatchUpEyebrow | null {
  if (item.kind === 'setup') return 'needsInput';
  if (pending) return action.kind === 'answer' ? 'needsOk' : 'needsInput';
  if (failed) return 'didntFinish';
  return null;
}

/** One card, its actions stacked under it, and the queue after it; swipe left is Later. */
function Shown({
  item,
  agent,
  connected,
  onNext,
  onAnswered,
  onLater,
  onChat,
  bottom,
  footer,
}: {
  item: CatchItem;
  agent: Agent;
  connected: boolean;
  onNext: () => void;
  onAnswered: () => void;
  onLater: () => void;
  onChat: (at?: string) => void;
  bottom: number;
  footer: ReactNode;
}) {
  const comp = useComputer();
  const styles = useStyles();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const messages = useApp((s) => s.chats[agent.id]?.messages);
  const setup = useApp((s) => s.teamSetup);
  const card = item.messageId ? messages?.find((m) => m.id === item.messageId) : undefined;
  const state = item.kind === 'ask' ? askState(item, messages) : 'pending';
  const action = askAction(card);
  const shown = useMemo(() => cardMessages(item, messages), [item, messages]);
  const gallery = useMemo(() => chatGallery(shown), [shown]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'allow' | 'deny'>(null);
  // A card taller than the screen puts its actions in a bar under it (latched: moving them
  // out shrinks the card, which must not move them back).
  const [tall, setTall] = useState(false);
  const [viewport, setViewport] = useState(0);
  // Answered from here: it moves on at once, so "answered elsewhere" is never said of it.
  const mine = useRef(false);
  const once = useInFlight();
  const pending = item.kind === 'ask' && state === 'pending';
  const armed = useArmed(pending, item.key);

  // Answered on the Mac, or expired, while it was in front of you: say so, then on.
  const moved = item.kind === 'ask' && state !== 'pending' && !mine.current;
  useEffect(() => {
    if (!moved) return;
    const timer = setTimeout(onNext, MOVE_ON_MS);
    return () => clearTimeout(timer);
  }, [moved, onNext]);

  const goLater = useCallback(() => {
    haptic.light();
    onLater();
  }, [onLater]);

  const answer = (allow: boolean) =>
    once(async () => {
      if (!armed || !card?.approval) return;
      mine.current = true;
      setBusy(allow ? 'allow' : 'deny');
      setError(null);
      try {
        await answerApproval(agent.id, card.approval.requestId, allow, false);
        if (allow) haptic.success();
        else haptic.warning();
        onAnswered();
      } catch (e) {
        mine.current = false;
        haptic.error();
        setError(describeError(e));
      } finally {
        setBusy(null);
      }
    });

  // Swipe left: Later. The card follows the finger, and springs back short of it.
  const dx = useSharedValue(0);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  // On the UI thread (gesture-handler + Reanimated, docs/MOTION.md): it follows
  // the finger 1:1, ticks once as it crosses the line, flies off or settles
  // back on spring.standard. Only leftward and mostly sideways, so the
  // card's own scroll keeps vertical drags.
  const pastLine = useSharedValue(false);
  const pan = useMemo(() => {
    const line = width * SWIPE_SHARE;
    return Gesture.Pan()
      .activeOffsetX([-space.md, 9999])
      .failOffsetY([-space.md / 2, space.md / 2])
      .onUpdate((e) => {
        const off = Math.min(0, e.translationX);
        dx.set(off);
        const over = -off > line;
        if (over !== pastLine.get()) {
          pastLine.set(over);
          if (over) runOnJS(haptic.select)();
        }
      })
      .onEnd(() => {
        if (!pastLine.get()) return;
        dx.set(withSpring(-width, spring.standard));
        runOnJS(goLater)();
      })
      .onFinalize(() => {
        if (!pastLine.get()) dx.set(withSpring(0, spring.standard));
        pastLine.set(false);
      });
  }, [pastLine, dx, width, goLater]);

  const failure = failedTurn(agent);
  const status =
    item.kind === 'reply' && (failure || (agent.pendingApprovals ?? 0) > 0)
      ? failure && !(agent.pendingApprovals ?? 0)
        ? failureLine(failure, previewText(agent.preview), engineName(agent))
        : needsLine(agent, messages)
      : null;
  // The strong slot holds the card's one action: Allow, or the sign-in / key /
  // answer (it opens the chat), or else Open chat.
  const chatIsMain = (pending && action.kind === 'open') || item.kind === 'setup';
  const eyebrow = eyebrowOf(item, pending, action, !!failure);
  const movedLine =
    state === 'expired'
      ? 'Not answered in time · moving on'
      : state === 'answered'
        ? 'Already answered · moving on'
        : 'No longer waiting · moving on';

  // Stacked, full width: the strong answer, the outline one, then the quiet ones. In the
  // card, or (a card taller than the screen) in a bar under it, so Allow is never off screen.
  const actions = (
    <View style={styles.stack}>
      {pending && action.kind === 'answer' ? (
        <Animated.View
          entering={FadeIn.duration(400)}
          pointerEvents={armed ? 'auto' : 'none'}
          style={styles.stack}
        >
          <Button
            title={action.allow}
            // Allow is black and white, never a colour: a risky one is told
            // apart by the danger line above it, not by turning Allow red.
            variant="answer"
            size="large"
            flat
            busy={busy === 'allow'}
            disabled={!!busy || !connected}
            onPress={() => void answer(true)}
            accessibilityHint={card?.approval?.detail || undefined}
            style={styles.big}
          />
          <Button
            title={action.deny}
            variant="outline"
            size="large"
            busy={busy === 'deny'}
            disabled={!!busy || !connected}
            onPress={() => void answer(false)}
            style={styles.big}
          />
        </Animated.View>
      ) : (
        <Button
          title={
            pending && action.kind === 'open'
              ? action.label
              : item.kind === 'setup'
                ? 'Continue'
                : CATCH_UP.openChat
          }
          variant="answer"
          size="large"
          flat
          onPress={() => onChat(card?.id)}
          style={styles.big}
        />
      )}
      <View style={styles.quiet}>
        {!chatIsMain && pending && action.kind === 'answer' && (
          <Button
            title={CATCH_UP.openChat}
            variant="ghost"
            onPress={() => onChat(card?.id)}
            style={styles.quietAction}
          />
        )}
        <Button
          title={CATCH_UP.later}
          variant="ghost"
          onPress={goLater}
          style={styles.quietAction}
        />
      </View>
    </View>
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        entering={FadeInRight.duration(260)}
        exiting={FadeOutLeft.duration(160)}
        style={[styles.body, slide]}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => {
            if (viewport > 0 && h > viewport) setTall(true);
          }}
        >
          <FlatCardContext.Provider value>
            <View style={styles.cardWrap}>
              <View style={styles.who}>
                <AgentKey id={agent.id} name={agent.name} color={agent.color} size={catchKeySize} />
                <T variant="small" color={colors.textStrong} numberOfLines={1} style={styles.name}>
                  {agent.name}
                </T>
                <T variant="label" color={colors.textMuted} numberOfLines={1}>
                  {catchUpAge(card?.ts ?? agent.lastActivityAt)}
                </T>
              </View>
              {eyebrow && (
                <View style={styles.eyebrow}>
                  <View style={[styles.eyebrowDot, { backgroundColor: colors.accentWarning }]} />
                  <T variant="caption" color={colors.textSecondary} style={styles.eyebrowText}>
                    {CATCH_UP_EYEBROW[eyebrow]}
                  </T>
                </View>
              )}
              {card?.approval && shown.length > 0 && (
                // The ask is the hierarchy: what it said is plain words, not a bubble in a box.
                <T color={colors.textSecondary} numberOfLines={4}>
                  {previewText(shown.filter((m) => m.kind === 'agent').slice(-1)[0]?.text ?? '')}
                </T>
              )}
              <GalleryContext.Provider value={gallery}>
                {(card?.approval ? [] : shown).map((m) => (
                  <RowBoundary key={m.id} resetKey={m}>
                    <MessageRow message={m} agent={agent} queued={false} onError={setError} />
                  </RowBoundary>
                ))}
              </GalleryContext.Provider>
              {item.kind === 'reply' && shown.length === 0 && !!agent.preview && (
                <T color={colors.textBody} style={styles.read}>
                  {previewText(agent.preview)}
                </T>
              )}
              {status && <Line text={status} />}
              {item.kind === 'setup' && (
                <Card icon="list.bullet" title={SETUP_TITLE}>
                  <T variant="small" color={colors.textSecondary}>
                    {`${setup ? `${setupProgress(setup)} · ` : ''}in ${agent.name}’s chat`}
                  </T>
                </Card>
              )}
              {card?.approval &&
                (action.kind === 'answer' ? (
                  <ApprovalCard
                    message={card}
                    approval={card.approval}
                    agent={agent}
                    onError={setError}
                    answers={false}
                    // A risky request is read in full before it's allowed.
                    full={highRisk(card.approval)}
                  />
                ) : (
                  <Card icon={askIcon(card.approval)} title={card.approval.title}>
                    <T variant="small" color={colors.textSecondary}>
                      {askingLine(card.approval)}
                    </T>
                  </Card>
                ))}
              {moved && (
                <Animated.View entering={FadeIn.duration(150)}>
                  <Line text={movedLine} />
                </Animated.View>
              )}
              {!!error && (
                <T variant="small" color={colors.accentErrorLight} accessibilityLiveRegion="polite">
                  {error}
                </T>
              )}
              {pending && !connected && (
                <T variant="small" color={colors.textSecondary}>
                  Answer it once {comp.your} is back. It stays open until then.
                </T>
              )}
              {!tall && actions}
            </View>
          </FlatCardContext.Provider>
          {footer}
          <View style={{ height: Math.max(bottom, space.lg) }} />
        </ScrollView>
        {tall && (
          <View style={[styles.bar, { paddingBottom: Math.max(bottom, space.md) }]}>{actions}</View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

/** The icon its own card in the chat wears (a login's is the lock, as a key's). */
const askIcon = (a: Approval) =>
  a.login || a.secret ? 'lock.fill' : a.connector ? 'square.and.arrow.down' : 'checkmark.shield';

/** The card's title in the queue: the ask itself, in the chat's own words. */
function titleOf(item: CatchItem, agent: Agent, messages: AgentMessage[] | undefined): string {
  if (item.kind === 'setup') return SETUP_TITLE;
  const approval = item.messageId
    ? messages?.find((m) => m.id === item.messageId)?.approval
    : undefined;
  if (approval) return approval.title;
  return previewText(agent.preview) || 'Something new';
}

/** What kind of ask a queue row is: the words under its title (not the agent's name again). */
function kindOf(item: CatchItem, agent: Agent, messages: AgentMessage[] | undefined): string {
  if (item.kind === 'setup') return CATCH_UP_EYEBROW.needsInput;
  const approval = item.messageId
    ? messages?.find((m) => m.id === item.messageId)?.approval
    : undefined;
  if (approval?.login) return CATCH_UP.needsSignIn;
  if (approval?.secret || approval?.connector || approval?.prompt)
    return CATCH_UP_EYEBROW.needsInput;
  if (approval) return CATCH_UP_EYEBROW.needsOk;
  return failedTurn(agent) ? CATCH_UP_EYEBROW.didntFinish : agent.name;
}

/** The rest of the queue under the card: "Up next · 2", or "Then" when only the summary follows. */
function UpNext({
  items,
  agents,
  chats,
  laterKeys,
  summaryCount,
  onJump,
  onSummary,
}: {
  items: CatchItem[];
  agents: Agent[];
  chats: ReturnType<typeof useApp.getState>['chats'];
  laterKeys: ReadonlySet<string>;
  summaryCount: number;
  onJump: (key: string) => void;
  onSummary: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const rows = items
    .map((it) => ({ it, agent: agents.find((a) => a.id === it.agentId) }))
    .filter((r): r is { it: CatchItem; agent: Agent } => !!r.agent);
  if (rows.length === 0 && summaryCount === 0) return null;
  // The count is what the header's "1 of N" counts: decisions, not offers, and not the open card.
  const counted = rows.filter((r) => !r.it.offer).length;
  const label =
    rows.length > 0 ? catchUpGroup(CATCH_UP.upNext, counted || rows.length) : CATCH_UP.then;
  return (
    <View style={styles.upNext}>
      <T
        variant="caption"
        color={colors.textMuted}
        style={styles.groupLabel}
        accessibilityRole="header"
      >
        {label.toUpperCase()}
      </T>
      <View style={styles.rows}>
        {rows.map(({ it, agent }) => (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={`${titleOf(it, agent, chats[agent.id]?.messages)}, ${agent.name}`}
            onPress={() => {
              haptic.select();
              onJump(it.key);
            }}
            style={({ pressed }) => [styles.row, pressed && PRESSED]}
          >
            <AgentKey id={agent.id} name={agent.name} color={agent.color} size={catchKeySize} />
            <View style={styles.grow}>
              <T
                variant="small"
                color={colors.textStrong}
                numberOfLines={1}
                style={styles.rowTitle}
              >
                {titleOf(it, agent, chats[agent.id]?.messages)}
              </T>
              <T variant="caption" color={colors.textMuted} numberOfLines={1}>
                {laterKeys.has(it.key)
                  ? `${kindOf(it, agent, chats[agent.id]?.messages)} · ${CATCH_UP.later}`
                  : kindOf(it, agent, chats[agent.id]?.messages)}
              </T>
            </View>
            <T variant="label" color={colors.textMuted} style={styles.rowAge}>
              {catchUpAge(it.ts)}
            </T>
            <Icon name="chevron.right" size={iconSize.inline} color={colors.textMuted} />
          </Pressable>
        ))}
        {summaryCount > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${CATCH_UP.whileAway}, ${catchUpThingsNoDecisions(summaryCount)}`}
            onPress={() => {
              haptic.select();
              onSummary();
            }}
            style={({ pressed }) => [styles.row, pressed && PRESSED]}
          >
            <View style={styles.clockTile}>
              <Icon name="clock" size={iconSize.body} color={colors.textSecondary} />
            </View>
            <View style={styles.grow}>
              <T variant="small" color={colors.textStrong} numberOfLines={1}>
                {CATCH_UP.whileAway}
              </T>
              <T variant="caption" color={colors.textMuted} numberOfLines={1}>
                {catchUpThingsNoDecisions(summaryCount)}
              </T>
            </View>
            <Icon name="chevron.right" size={iconSize.inline} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** "5:57 am", in the user's own clock. */
const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();

/** What happened while you were away: the summary card, and Got it in a fixed bar. */
function Summary({
  happened,
  agents,
  onOpen,
  onGotIt,
  onBack,
}: {
  happened: CatchItem[];
  agents: Agent[];
  onOpen: (agentId: string) => void;
  onGotIt: () => void;
  onBack: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const rows = happened
    .map((h) => ({ item: h, agent: agents.find((a) => a.id === h.agentId) }))
    .filter((r): r is { item: CatchItem; agent: Agent } => !!r.agent)
    .sort((a, b) => b.agent.lastActivityAt - a.agent.lastActivityAt);
  const shownRows = rows.slice(0, CATCH_UP_SUMMARY_ROWS);
  const more = rows.length - shownRows.length;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader count={CATCH_UP.summary} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.summaryScroll}>
        <View style={styles.cardWrap}>
          <View style={styles.summaryHead}>
            <View style={styles.clockTile}>
              <Icon name="clock" size={iconSize.body} color={colors.textSecondary} />
            </View>
            <T variant="small" color={colors.textStrong} style={styles.name}>
              {CATCH_UP.whileAway}
            </T>
            <T variant="label" color={colors.textMuted}>
              {catchUpThingsHead(rows.length)}
            </T>
          </View>
          {shownRows.map(({ item, agent }) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${agent.name}: ${previewText(agent.preview)}`}
              onPress={() => onOpen(agent.id)}
              style={({ pressed }) => [styles.summaryRow, pressed && PRESSED]}
            >
              <AgentKey id={agent.id} name={agent.name} color={agent.color} size={catchKeySize} />
              <T variant="small" color={colors.textStrong} numberOfLines={2} style={styles.grow}>
                {previewText(agent.preview) || 'Something new'}
              </T>
              <T variant="label" color={colors.textMuted}>
                {clockTime(agent.lastActivityAt)}
              </T>
            </Pressable>
          ))}
          {more > 0 && (
            <T variant="label" color={colors.textMuted} style={styles.moreLine}>
              {catchUpMore(more)}
            </T>
          )}
        </View>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <Button
          title={CATCH_UP.gotIt}
          variant="answer"
          size="large"
          flat
          onPress={onGotIt}
          style={styles.big}
        />
      </View>
    </View>
  );
}

/** Nothing needs you: the ring and check, one line, and the way to what's running. */
function AllClear({
  lastDecisionAt,
  onBack,
  onInFlight,
}: {
  lastDecisionAt: number | null;
  onBack: () => void;
  onInFlight: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader count={CATCH_UP.allClear} onBack={onBack} />
      <Animated.View entering={FadeIn.duration(300)} style={styles.done}>
        <View style={styles.check}>
          <Icon name="checkmark" size={iconSize.hero} color={colors.textSecondary} />
        </View>
        <T color={colors.textStrong} accessibilityRole="header" style={styles.doneTitle}>
          {CATCH_UP.allClear}
        </T>
        <T color={colors.textSecondary} style={styles.doneText}>
          {catchUpAllClearBody(lastDecisionAt ? clockTime(lastDecisionAt) : undefined)}
        </T>
        <Button title={CATCH_UP.whatsInFlight} variant="outline" flat onPress={onInFlight} />
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.surfaceApp },
  center: { alignItems: 'center', justifyContent: 'center' },
  // 52 pt under the safe area: back in a 44 pt target, the title, its count.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  pageTitle: {
    fontSize: catchUp.title,
    lineHeight: lineHeight(catchUp.title, 1.3),
    fontFamily: fonts.semibold,
  },
  count: { marginLeft: catchUp.countGap },
  body: { flex: 1 },
  scroll: { padding: space.lg, gap: space.lg },
  // The open card: radius 16, padding 20, the control surface and its hairline.
  cardWrap: {
    gap: space.md,
    padding: space.lg + space.xs,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eyebrowDot: { width: 7, height: 7, borderRadius: radius.pill },
  eyebrowText: { letterSpacing: 1, textTransform: 'uppercase', fontSize: catchUp.eyebrow },
  read: { fontSize: type.read, lineHeight: lineHeight(type.read, READ_LINE) },
  stack: { gap: space.sm },
  big: { minHeight: catchUp.button },
  quiet: { flexDirection: 'row', gap: space.sm },
  quietAction: { flex: 1, minHeight: 44 },
  // Under the card: the rest of the queue, on a recessed surface.
  upNext: { gap: space.sm },
  groupLabel: { letterSpacing: 1, paddingHorizontal: space.xs, fontSize: catchUp.eyebrow },
  rows: { gap: space['2xs'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surfacePanel,
  },
  grow: { flex: 1 },
  rowTitle: { fontSize: catchUp.rowTitle },
  rowAge: { fontSize: catchUp.rowAge },
  clockTile: {
    width: catchKeySize,
    height: catchKeySize,
    borderRadius: radius.inner,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  summaryScroll: { padding: space.lg },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  moreLine: { textAlign: 'center' },
  // Got it: a fixed bar with its own hairline, clear of the home indicator.
  bar: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfaceApp,
  },
  done: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
  },
  check: {
    width: catchUp.clearRing,
    height: catchUp.clearRing,
    borderRadius: radius.pill,
    marginBottom: catchUp.clearGap - space.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceControl,
  },
  doneTitle: {
    fontSize: catchUp.clearTitle,
    lineHeight: lineHeight(catchUp.clearTitle, 1.3),
    fontFamily: fonts.semibold,
  },
  doneText: { textAlign: 'center', fontSize: catchUp.clearBody },
}));

/** A throw while drawing stays on this screen, with the way back. */
export { ScreenError as ErrorBoundary } from '../components/ScreenError';
