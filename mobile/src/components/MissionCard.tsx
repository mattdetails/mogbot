/**
 * One mission, as a card on the phone: the hero count, each engine's share
 * worded "about", what waits on you with a real Review button, who is on it,
 * and the ways on when it paused or is ready. Every rule is the shared one
 * (`@shipstudio/companion-protocol` missions): the desk's page and this card
 * say the same words from the same record.
 */

import {
  agentStatus,
  asksStrip,
  banner,
  bottomNote,
  criterionWord,
  dayLabel,
  ENGINE_NAME,
  fmt,
  hero,
  shareRow,
  isAsleep,
  stateWord,
  type Mission,
} from '@shipstudio/companion-protocol';
import { useState } from 'react';
import { View } from 'react-native';
import { makeStyles, useColors } from '../lib/appearance';
import { engineName } from '../lib/agents';
import { missionCall, type MissionCall } from '../lib/missions';
import { radius, space } from '../lib/theme';
import { Button, SectionTitle, T } from './ui';

const BAR = 8;

function Bar({
  fill,
  marker,
  over,
  hatched,
}: {
  fill: number;
  marker?: number;
  over?: boolean;
  hatched?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const reach = marker ?? 100;
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: hatched ? colors.surfacePanel : colors.surfaceControl },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!hatched && (
        <View
          style={[
            styles.fill,
            { width: `${over ? reach : fill}%`, backgroundColor: colors.textStrong },
          ]}
        />
      )}
      {over && (
        <View
          style={[
            styles.fill,
            {
              left: `${reach}%`,
              width: `${Math.max(0, fill - reach)}%`,
              backgroundColor: colors.accentWarning,
            },
          ]}
        />
      )}
      {marker !== undefined && !over && (
        <View
          style={[
            styles.marker,
            { left: `${Math.min(99, marker)}%`, backgroundColor: colors.textSecondary },
          ]}
        />
      )}
    </View>
  );
}

function Hero({ mission }: { mission: Mission }) {
  const colors = useColors();
  const styles = useStyles();
  const h = hero(mission);
  if (h.kind === 'criteria') {
    return (
      <View style={styles.block}>
        <T variant="headline" color={colors.textStrong}>
          {h.met} of {h.total} criteria met
        </T>
        <View style={styles.ticks}>
          {mission.criteria.map((c) => (
            <View
              key={c.id}
              style={[
                styles.tick,
                {
                  backgroundColor:
                    c.status === 'met' || c.status === 'holding'
                      ? colors.textStrong
                      : colors.surfaceControl,
                },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }
  const goal = h.kind === 'reduce' ? `goal under ${fmt(h.target)}` : `of ${fmt(h.target)}`;
  return (
    <View style={styles.block}>
      <T variant="headline" color={colors.textStrong}>
        {fmt(h.value)}{' '}
        <T variant="small" color={colors.textSecondary}>
          {goal}
          {h.unit ? ` ${h.unit}` : ''}
        </T>
      </T>
      {h.kind === 'ticks' ? (
        <View style={styles.ticks}>
          {Array.from({ length: h.target }, (_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                { backgroundColor: i < h.value ? colors.textStrong : colors.surfaceControl },
              ]}
            />
          ))}
        </View>
      ) : (
        <Bar
          fill={h.kind === 'reduce' ? h.covered * 100 : Math.min(100, (h.value / h.target) * 100)}
        />
      )}
      {!!h.source && (
        <T variant="caption" color={colors.textMuted}>
          {h.source}
        </T>
      )}
    </View>
  );
}

export function MissionCard({
  mission,
  now,
  onReview,
  onReconnect,
}: {
  mission: Mission;
  now: number;
  /** "Review": the asks are answered in the Chief's chat. */
  onReview: () => void;
  /** "Reconnect": ask the Chief, which has the login card for that app. */
  onReconnect: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const b = banner(mission, now);
  const asks = asksStrip(mission.asks);
  const live =
    (mission.state === 'starting' || mission.state === 'running') && !isAsleep(mission, now);

  const act = async (
    action: MissionCall | 'reconnect',
    engine?: Mission['shares'][number]['engine']
  ) => {
    if (action === 'reconnect') return onReconnect();
    setBusy(true);
    setError(null);
    const why = await missionCall(mission.id, action, engine);
    if (why) setError(why);
    setBusy(false);
  };

  return (
    <View style={styles.card} accessibilityLabel={`Mission: ${mission.goal}`}>
      <T variant="caption" color={colors.textMuted}>
        {stateWord(mission, now)} · {dayLabel(mission, now)}
      </T>
      <T variant="headline" color={colors.textStrong} numberOfLines={3}>
        {mission.goal}
      </T>
      {!!mission.summary && (
        <T variant="small" color={colors.textSecondary}>
          {mission.summary}
        </T>
      )}

      {b && (
        <View
          style={[
            styles.banner,
            { backgroundColor: b.tone === 'amber' ? colors.surfaceControl : colors.surfacePanel },
            b.tone === 'red' && { borderColor: colors.accentError, borderWidth: 1 },
            b.tone === 'amber' && { borderColor: colors.accentWarning, borderWidth: 1 },
          ]}
        >
          <T variant="body" color={colors.textStrong} style={styles.bold}>
            {b.title}
          </T>
          <T variant="small" color={colors.textSecondary}>
            {b.text}
          </T>
          <View style={styles.actions}>
            {b.actions
              .filter((a) => a.action !== 'see' && a.action !== 'finish_with')
              .map((a) => (
                <Button
                  key={a.label}
                  title={a.label}
                  variant="outline"
                  size="compact"
                  disabled={busy}
                  onPress={() => void act(a.action as MissionCall | 'reconnect', a.engine)}
                />
              ))}
          </View>
        </View>
      )}

      <Hero mission={mission} />

      <View style={styles.block}>
        <SectionTitle title="Usage to spend" style={styles.flushTitle} />
        {mission.shares.map((s) => {
          const r = shareRow(s);
          return (
            <View key={s.engine} style={styles.share}>
              <View style={styles.shareHead}>
                <T variant="small" color={colors.textStrong}>
                  {r.name}
                </T>
                <T
                  variant="small"
                  color={r.over ? colors.accentWarning : colors.textMuted}
                  style={styles.shareText}
                >
                  {r.text}
                </T>
              </View>
              <Bar
                fill={r.fill}
                marker={s.kind === 'usage' ? r.marker : undefined}
                over={r.over}
                hatched={r.unread}
              />
            </View>
          );
        })}
      </View>

      {asks.all > 0 && (
        <View style={styles.block}>
          <SectionTitle title="Waiting on you" style={styles.flushTitle} />
          {asks.shown.map((a) => (
            <View key={a.id} style={styles.ask}>
              <View style={[styles.askDot, { backgroundColor: colors.accentWarning }]} />
              <View style={styles.grow}>
                <T variant="body" color={colors.textStrong}>
                  {a.text}
                </T>
                {!!a.detail && (
                  <T variant="small" color={colors.textMuted}>
                    {a.detail}
                  </T>
                )}
              </View>
            </View>
          ))}
          {asks.more > 0 && (
            <T variant="small" color={colors.textMuted}>
              and {asks.more} more
            </T>
          )}
          <Button
            title={asks.all > 1 ? `Review all ${asks.all}` : 'Review'}
            variant="answer"
            onPress={onReview}
          />
        </View>
      )}

      <View style={styles.block}>
        <SectionTitle title="What counts as done" style={styles.flushTitle} />
        {mission.criteria.slice(0, 4).map((c) => (
          <View key={c.id} style={styles.agent}>
            <View style={styles.grow}>
              <T variant="small" color={colors.textStrong} numberOfLines={2}>
                {c.text}
              </T>
              {!!c.note && (
                <T variant="caption" color={colors.textMuted} numberOfLines={3}>
                  {c.note}
                </T>
              )}
            </View>
            <T
              variant="small"
              color={
                c.status === 'couldnt_check' || c.status === 'not_met'
                  ? colors.accentWarning
                  : colors.textMuted
              }
            >
              {criterionWord(c)}
            </T>
          </View>
        ))}
        {mission.criteria.length > 4 && (
          <T variant="small" color={colors.textMuted}>
            + {mission.criteria.length - 4} more criteria
          </T>
        )}
        {!!mission.checkedBy && (
          <T variant="caption" color={colors.textMuted}>
            Checked by {ENGINE_NAME[mission.checkedBy]}
            {mission.agents.some((a) => a.engine === mission.checkedBy)
              ? ''
              : ', which did not do the work'}
            . It says it checked.
          </T>
        )}
      </View>

      {mission.agents.length > 0 && (
        <View style={styles.block}>
          <SectionTitle title="On it" style={styles.flushTitle} />
          {mission.agents.slice(0, 4).map((a) => (
            <View key={a.name} style={styles.agent}>
              <View style={styles.grow}>
                <T variant="small" color={colors.textStrong} numberOfLines={1}>
                  {a.name}
                </T>
                <T variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {engineName({ engine: a.engine })}
                </T>
              </View>
              <T variant="small" color={colors.textMuted}>
                {agentStatus(mission, a)}
              </T>
            </View>
          ))}
          {mission.agents.length > 4 && (
            <T variant="small" color={colors.textMuted}>
              + {mission.agents.length - 4} more agents
            </T>
          )}
        </View>
      )}

      <T variant="caption" color={colors.textMuted}>
        {bottomNote(mission)}
      </T>
      {!!error && (
        <T variant="small" color={colors.accentErrorLight}>
          {error}
        </T>
      )}
      {live && (
        <View style={styles.actions}>
          <Button
            title="Pause"
            variant="outline"
            size="compact"
            disabled={busy}
            onPress={() => void act('pause')}
          />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surfacePanel,
  },
  block: { gap: space.sm },
  flushTitle: { marginLeft: 0 },
  bold: { fontWeight: '600' },
  track: { height: BAR, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  ticks: { flexDirection: 'row', flexWrap: 'wrap', gap: space['2xs'] },
  tick: {
    flexGrow: 1,
    flexBasis: space.md,
    minWidth: space.sm,
    height: BAR,
    borderRadius: radius.sm,
  },
  share: { gap: space.xs },
  shareHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  shareText: { flexShrink: 1, textAlign: 'right' },
  banner: { gap: space.sm, padding: space.md, borderRadius: radius.control },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  agent: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ask: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  askDot: { width: space.sm, height: space.sm, borderRadius: radius.pill, marginTop: space.tight },
  grow: { flex: 1, minWidth: 0 },
}));
