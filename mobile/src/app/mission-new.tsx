/**
 * Set up a mission on the phone: one question to a screen (the goal, what
 * counts as done, the usage to spend, what asks first, the updates), then one
 * summary card with Start and Save for later. The same record and the same
 * rules as the desk's dialog (`@shipstudio/companion-protocol` missions):
 * Start is off until a goal, a criterion and a share exist and says why under
 * the buttons; a chosen engine with no usage reading is one inline "Start
 * anyway?". `?id=` reopens a saved draft.
 */

import {
  ENGINE_NAME,
  NEW_DRAFT,
  missionDraftOf,
  setupGate,
  startAnywayNote,
  type EngineId,
  type MissionDraft,
} from '@shipstudio/companion-protocol';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import { SheetTitle } from '../components/SheetTitle';
import { Button, SheetPage, T } from '../components/ui';
import { makeStyles, useColors } from '../lib/appearance';
import { useMissions } from '../lib/missions';
import { call, canCall, describeError } from '../lib/session';
import { radius, space, type as typeScale } from '../lib/theme';

const ENGINES: EngineId[] = ['claude', 'codex', 'opencode'];
const MAX_CRITERIA = 5;
const QUESTIONS = [
  'What do you want to be true?',
  'What counts as done?',
  'How much usage to spend?',
  'What asks you first?',
  'How should it keep you posted?',
] as const;

export default function MissionNew() {
  const styles = useStyles();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { missions } = useMissions();
  const [draft, setDraft] = useState<MissionDraft>(NEW_DRAFT);
  const [step, setStep] = useState(0);
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // A saved draft reopened, its fields filled.
  useEffect(() => {
    if (!id || loadedId === id) return;
    const found = missions?.find((m) => m.id === id && m.state === 'draft');
    if (found) {
      setDraft(missionDraftOf(found));
      setLoadedId(id);
      setStep(QUESTIONS.length);
    }
  }, [id, missions, loadedId]);

  useEffect(() => {
    if (!canCall('agents.usagePlan')) return;
    void call('agents.usagePlan', {})
      .then((inv) => {
        const next: Record<string, boolean> = {};
        for (const e of ENGINES) {
          next[e] = inv.accounts.some((a) => a.engine === e && a.signedIn && a.windows.length > 0);
        }
        setRead(next);
      })
      .catch(() => {});
  }, []);

  const gate = useMemo(() => setupGate(draft, (e) => read[e] === true), [draft, read]);
  const summary = step >= QUESTIONS.length;

  const send = async (action: 'save' | 'start') => {
    setBusy(true);
    setError(null);
    try {
      await call('agents.missions.setup', {
        action,
        draft: { ...draft, criteria: draft.criteria.filter((c) => c.text.trim()) },
      });
      router.back();
    } catch (e) {
      setError(
        action === 'start'
          ? `Couldn't start. Nothing was spent. ${describeError(e)}`
          : `Couldn't save. What you wrote is kept. ${describeError(e)}`
      );
    } finally {
      setBusy(false);
    }
  };

  const onStart = () => {
    if (!gate.canStart) return;
    if (gate.unread.length > 0 && !asked) {
      setAsked(true);
      return;
    }
    void send('start');
  };

  const sharing = (e: EngineId) => draft.shares.find((s) => s.engine === e);
  const toggleShare = (e: EngineId, on: boolean) =>
    setDraft((d) => ({
      ...d,
      shares: on
        ? [...d.shares, e === 'opencode' ? { engine: e, hours: 24 } : { engine: e, percent: 30 }]
        : d.shares.filter((s) => s.engine !== e),
    }));
  const setAmount = (e: EngineId, value: string) => {
    const n = Math.max(
      0,
      Math.min(e === 'opencode' ? 24 * 14 : 100, Number(value.replace(/\D/g, '')) || 0)
    );
    setDraft((d) => ({
      ...d,
      shares: d.shares.map((s) =>
        s.engine === e
          ? e === 'opencode'
            ? { engine: e, hours: n }
            : { engine: e, percent: n }
          : s
      ),
    }));
  };

  return (
    <SheetPage>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <SheetTitle>New mission</SheetTitle>
        {!summary && (
          <T variant="caption" color={colors.textMuted}>
            Question {step + 1} of {QUESTIONS.length}
          </T>
        )}

        {step === 0 && (
          <View style={styles.block}>
            <T variant="headline" color={colors.textStrong}>
              {QUESTIONS[0]}
            </T>
            <TextInput
              autoFocus
              multiline
              value={draft.goal}
              onChangeText={(t) => setDraft({ ...draft, goal: t.replace(/\n/g, ' ') })}
              placeholder="One sentence"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.tall]}
              accessibilityLabel="Goal"
            />
          </View>
        )}

        {step === 1 && (
          <View style={styles.block}>
            <T variant="headline" color={colors.textStrong}>
              {QUESTIONS[1]}
            </T>
            <T variant="small" color={colors.textMuted}>
              Two to five things you can check yourself.
            </T>
            {draft.criteria.map((c, i) => (
              <TextInput
                key={i}
                value={c.text}
                onChangeText={(t) =>
                  setDraft({
                    ...draft,
                    criteria: draft.criteria.map((x, j) => (j === i ? { ...x, text: t } : x)),
                  })
                }
                placeholder="Something you can check"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                accessibilityLabel={`Criterion ${i + 1}`}
              />
            ))}
            {draft.criteria.length < MAX_CRITERIA && (
              <Button
                title="Add what counts as done"
                variant="outline"
                size="compact"
                onPress={() => setDraft({ ...draft, criteria: [...draft.criteria, { text: '' }] })}
              />
            )}
          </View>
        )}

        {step === 2 && (
          <View style={styles.block}>
            <T variant="headline" color={colors.textStrong}>
              {QUESTIONS[2]}
            </T>
            <T variant="small" color={colors.textMuted}>
              A share is soft: usage is read about every ten minutes, so a step that's running
              finishes first.
            </T>
            {ENGINES.map((e) => {
              const s = sharing(e);
              const time = e === 'opencode';
              return (
                <View key={e} style={styles.engine}>
                  <View style={styles.engineHead}>
                    <T variant="body" color={colors.textStrong} style={styles.grow}>
                      {ENGINE_NAME[e]}
                    </T>
                    <Switch
                      value={!!s}
                      onValueChange={(on) => toggleShare(e, on)}
                      accessibilityLabel={`Use ${ENGINE_NAME[e]}`}
                    />
                  </View>
                  {s && (
                    <View style={styles.amountRow}>
                      <TextInput
                        value={String(time ? (s.hours ?? 0) : (s.percent ?? 0))}
                        onChangeText={(t) => setAmount(e, t)}
                        keyboardType="number-pad"
                        style={[styles.input, styles.amount]}
                        accessibilityLabel={
                          time ? `${ENGINE_NAME[e]} hours` : `${ENGINE_NAME[e]} share, percent`
                        }
                      />
                      <T variant="small" color={colors.textMuted} style={styles.grow}>
                        {time ? 'hours, capped by time' : '% of its week, about'}
                        {!time && read[e] === false ? ' · not read yet' : ''}
                      </T>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {step === 3 && (
          <View style={styles.block}>
            <T variant="headline" color={colors.textStrong}>
              {QUESTIONS[3]}
            </T>
            <T variant="body" color={colors.textSecondary}>
              Spending money always asks. Your own rules (Never, Ask first) apply too.
            </T>
          </View>
        )}

        {step === 4 && (
          <View style={styles.block}>
            <T variant="headline" color={colors.textStrong}>
              {QUESTIONS[4]}
            </T>
            <View style={styles.engineHead}>
              <T variant="body" color={colors.textStrong} style={styles.grow}>
                When it's blocked
              </T>
              <Switch
                value={draft.updates.whenBlocked}
                onValueChange={(v) =>
                  setDraft({ ...draft, updates: { ...draft.updates, whenBlocked: v } })
                }
                accessibilityLabel="Update me when it's blocked"
              />
            </View>
            <View style={styles.engineHead}>
              <T variant="body" color={colors.textStrong} style={styles.grow}>
                At each milestone
              </T>
              <Switch
                value={draft.updates.eachMilestone}
                onValueChange={(v) =>
                  setDraft({ ...draft, updates: { ...draft.updates, eachMilestone: v } })
                }
                accessibilityLabel="Update me at each milestone"
              />
            </View>
          </View>
        )}

        {summary && (
          <View style={styles.card}>
            <T variant="caption" color={colors.textMuted}>
              Mission
            </T>
            <T variant="headline" color={colors.textStrong}>
              {draft.goal || 'No goal yet'}
            </T>
            <T variant="small" color={colors.textMuted}>
              What counts as done
            </T>
            {draft.criteria
              .filter((c) => c.text.trim())
              .map((c, i) => (
                <T key={i} variant="body" color={colors.textStrong}>
                  {c.text}
                </T>
              ))}
            <T variant="small" color={colors.textMuted}>
              Usage to spend
            </T>
            {draft.shares.map((s) => (
              <T key={s.engine} variant="body" color={colors.textStrong}>
                {ENGINE_NAME[s.engine]}:{' '}
                {s.hours !== undefined
                  ? `capped at ${s.hours} hours`
                  : `about ${s.percent}% of its week`}
              </T>
            ))}
            {asked && gate.unread.length > 0 && (
              <T variant="small" color={colors.textSecondary}>
                {startAnywayNote(draft, gate.unread)}
              </T>
            )}
            {!!error && (
              <T variant="small" color={colors.accentErrorLight}>
                {error}
              </T>
            )}
            {asked && gate.unread.length > 0 ? (
              <>
                <Button
                  title="Start anyway"
                  variant="answer"
                  disabled={busy}
                  onPress={() => void send('start')}
                />
                <Button title="Change" variant="outline" onPress={() => setAsked(false)} />
              </>
            ) : (
              <>
                <Button
                  title="Start mission"
                  variant="answer"
                  disabled={!gate.canStart || busy}
                  onPress={onStart}
                />
                <Button
                  title="Save for later"
                  variant="outline"
                  disabled={busy}
                  onPress={() => void send('save')}
                />
              </>
            )}
            {!!gate.reason && (
              <T variant="small" color={colors.textMuted}>
                {gate.reason}
              </T>
            )}
          </View>
        )}

        {!summary ? (
          <View style={styles.nav}>
            {step > 0 && <Button title="Back" variant="ghost" onPress={() => setStep(step - 1)} />}
            <Button title="Next" variant="answer" onPress={() => setStep(step + 1)} />
          </View>
        ) : (
          <Button title="Back" variant="ghost" onPress={() => setStep(QUESTIONS.length - 1)} />
        )}
      </ScrollView>
    </SheetPage>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { padding: space.lg, gap: space.lg, paddingBottom: space['2xl'] },
  block: { gap: space.md },
  input: {
    color: colors.textBody,
    fontSize: typeScale.body,
    backgroundColor: colors.inputFill,
    borderRadius: radius.inner,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  tall: { minHeight: 88, textAlignVertical: 'top' },
  engine: { gap: space.sm },
  engineHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  amount: { width: 84 },
  grow: { flex: 1, minWidth: 0 },
  nav: { gap: space.sm },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surfacePanel,
  },
}));

/** A throw while drawing stays on this screen, with the way back. */
export { ScreenError as ErrorBoundary } from '../components/ScreenError';
