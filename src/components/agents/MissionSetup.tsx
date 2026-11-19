/**
 * Set up a mission (`agents::missions`, Designer's gap B): the goal, what
 * counts as done, the usage to spend, what asks first and the updates, then
 * Start or Save for later. Start is off until a goal, a criterion and a share
 * exist, and says why in a muted line (never a tooltip). A chosen engine with
 * no usage reading is one inline note, "Start anyway?", not a card. Usually
 * the Chief drafts this from its short talk; this is the same record by hand.
 *
 * @module components/agents/MissionSetup
 */
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { ModalFrame } from '../primitives/ModalFrame';
import { TextButton } from '../primitives/TextButton';
import { TextField } from '../primitives/TextField';
import { useOptionalToast } from '../../contexts/ToastContext';
import { glanceUsageInventory } from '../../lib/agentsUsage';
import {
  ENGINE_NAME,
  NEW_DRAFT,
  setupGate,
  startAnywayNote,
  type EngineId,
  type MissionDraft,
} from '../../lib/missions';

const ENGINES: EngineId[] = ['claude', 'codex', 'opencode'];
const MAX_CRITERIA = 5;

const setup = (action: 'save' | 'start', draft: MissionDraft) =>
  invoke<string>('agents_mission_setup', { action, draft });

export function MissionSetup({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  /** A saved draft reopened: its fields filled. */
  initial?: MissionDraft;
  onClose: () => void;
}) {
  const { showToast } = useOptionalToast();
  const [draft, setDraft] = useState<MissionDraft>(initial ?? NEW_DRAFT);
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [asked, setAsked] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initial ?? NEW_DRAFT);
      setAsked(false);
      setFailed(null);
    }
  }, [open, initial]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void glanceUsageInventory()
      .then((inv) => {
        if (!alive) return;
        const next: Record<string, boolean> = {};
        for (const e of ENGINES) {
          next[e] = inv.accounts.some((a) => a.engine === e && a.signedIn && a.windows.length > 0);
        }
        setRead(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const gate = useMemo(() => setupGate(draft, (e) => read[e] === true), [draft, read]);
  const sharing = (e: EngineId) => draft.shares.find((s) => s.engine === e);

  const setShare = (e: EngineId, on: boolean) =>
    setDraft((d) => ({
      ...d,
      shares: on
        ? [...d.shares, e === 'opencode' ? { engine: e, hours: 24 } : { engine: e, percent: 30 }]
        : d.shares.filter((s) => s.engine !== e),
    }));
  const setAmount = (e: EngineId, value: string) => {
    const n = Math.max(0, Math.min(e === 'opencode' ? 24 * 14 : 100, Number(value) || 0));
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

  const send = async (action: 'save' | 'start') => {
    setBusy(true);
    setFailed(null);
    try {
      await setup(action, {
        ...draft,
        criteria: draft.criteria.filter((c) => c.text.trim()),
      });
      onClose();
    } catch {
      setFailed(
        action === 'start'
          ? "Couldn't start. Nothing was spent."
          : "Couldn't save. What you wrote is kept."
      );
      showToast(
        action === 'start' ? "Couldn't start the mission" : "Couldn't save the draft",
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    if (!gate.canStart) return;
    if (gate.unread.length > 0 && !asked) {
      setAsked(true);
      return;
    }
    void send('start');
  };

  return (
    <ModalFrame isOpen={open} onClose={onClose} title="New mission">
      <div className="mission-setup">
        <section className="mission-setup__field">
          <label className="mission-setup__label" htmlFor="mission-goal">
            Goal
          </label>
          <TextField
            id="mission-goal"
            value={draft.goal}
            placeholder="One sentence: what do you want to be true?"
            onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
          />
        </section>

        <section className="mission-setup__field" aria-label="What counts as done">
          <p className="mission-setup__label">What counts as done</p>
          {draft.criteria.map((c, i) => (
            <div key={i} className="mission-setup__row mission-setup__row--field">
              <TextField
                aria-label={`Criterion ${i + 1}`}
                value={c.text}
                placeholder="Something you can check"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    criteria: draft.criteria.map((x, j) =>
                      j === i ? { ...x, text: e.target.value } : x
                    ),
                  })
                }
              />
              <TextButton
                onClick={() =>
                  setDraft({ ...draft, criteria: draft.criteria.filter((_, j) => j !== i) })
                }
              >
                Remove
              </TextButton>
            </div>
          ))}
          {draft.criteria.length < MAX_CRITERIA && (
            <TextButton
              onClick={() => setDraft({ ...draft, criteria: [...draft.criteria, { text: '' }] })}
            >
              + Add what counts as done
            </TextButton>
          )}
        </section>

        <section className="mission-setup__field" aria-label="Usage to spend">
          <p className="mission-setup__label">Usage to spend</p>
          {ENGINES.map((e) => {
            const s = sharing(e);
            const time = e === 'opencode';
            return (
              <div key={e} className="mission-setup__row">
                <Checkbox
                  label={`Use ${ENGINE_NAME[e]}`}
                  checked={!!s}
                  onChange={(on) => setShare(e, on)}
                />
                <span className="mission-setup__engine">{ENGINE_NAME[e]}</span>
                {s && (
                  <>
                    <TextField
                      type="number"
                      className="mission-setup__amount"
                      aria-label={
                        time ? `${ENGINE_NAME[e]} hours` : `${ENGINE_NAME[e]} share, percent`
                      }
                      value={String(time ? (s.hours ?? 0) : (s.percent ?? 0))}
                      onChange={(ev) => setAmount(e, ev.target.value)}
                    />
                    <span className="mission-setup__unit">
                      {time ? 'hours, capped by time' : '% of its week, about'}
                    </span>
                  </>
                )}
                {!time && s && read[e] === false && (
                  <span className="mission-setup__unit">not read yet</span>
                )}
              </div>
            );
          })}
          <p className="mission-setup__hint">
            A share is soft: usage is read about every ten minutes, so a step that's running
            finishes first.
          </p>
        </section>

        <section className="mission-setup__field" aria-label="Asks you first">
          <p className="mission-setup__label">Asks you first</p>
          <p className="mission-setup__hint">
            Spending money always asks. Your own rules (Never, Ask first) apply too.
          </p>
        </section>

        <section className="mission-setup__field" aria-label="Updates">
          <p className="mission-setup__label">Updates</p>
          <div className="mission-setup__row">
            <Checkbox
              label="Update me when it's blocked"
              checked={draft.updates.whenBlocked}
              onChange={(v) =>
                setDraft({ ...draft, updates: { ...draft.updates, whenBlocked: v } })
              }
            />
            <span className="mission-setup__engine">When it's blocked</span>
          </div>
          <div className="mission-setup__row">
            <Checkbox
              label="Update me at each milestone"
              checked={draft.updates.eachMilestone}
              onChange={(v) =>
                setDraft({ ...draft, updates: { ...draft.updates, eachMilestone: v } })
              }
            />
            <span className="mission-setup__engine">At each milestone</span>
          </div>
        </section>

        {asked && gate.unread.length > 0 && (
          <p className="mission-setup__note" role="status">
            {startAnywayNote(draft, gate.unread)}
          </p>
        )}
        {failed && (
          <p className="mission-setup__note" role="alert">
            {failed}
          </p>
        )}

        <div className="mission-setup__acts">
          {asked && gate.unread.length > 0 ? (
            <>
              <Button variant="strong" disabled={busy} onClick={() => void send('start')}>
                Start anyway
              </Button>
              <Button variant="secondary" onClick={() => setAsked(false)}>
                Change
              </Button>
            </>
          ) : (
            <>
              <Button variant="strong" disabled={!gate.canStart || busy} onClick={start}>
                {failed && failed.startsWith("Couldn't start") ? 'Try again' : 'Start mission'}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => void send('save')}>
                Save for later
              </Button>
            </>
          )}
        </div>
        {gate.reason && <p className="mission-setup__reason">{gate.reason}</p>}
      </div>
    </ModalFrame>
  );
}
