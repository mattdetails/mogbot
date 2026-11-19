/**
 * A mission's page (`agents::missions`, Designer's spec-missions and
 * spec-mission-states): the goal, one hero number, the usage shares ("about"
 * on every cap), what waits on you, what counts as done, who is on it and
 * what happened. Every rule that turns the record into this page is a pure
 * function in `lib/missions.ts`, tested against the eight cases.
 *
 * Banners are for state only: amber at a share, red when blocked, neutral
 * when ready for review. Nothing is colour-only: every dot has words.
 *
 * @module components/agents/MissionPage
 */
import { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Button } from '../primitives/Button';
import { TextButton } from '../primitives/TextButton';
import { useOptionalToast } from '../../contexts/ToastContext';
import { asCommandError, formatCommandError } from '../../lib/errors';
import {
  AGENTS_SHOWN,
  CRITERIA_SHOWN,
  ENGINE_NAME,
  EVENTS_SHOWN,
  MISSIONS_EVENT,
  STATE_WORD,
  agentStatus,
  asksStrip,
  banner,
  bottomNote,
  criterionWord,
  dayLabel,
  endDate,
  fmt,
  hero,
  isBigNumber,
  metCount,
  missionAct,
  shareRow,
  type Banner,
  type Mission,
} from '../../lib/missions';

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function Hero({ mission }: { mission: Mission }) {
  const h = hero(mission);
  if (h.kind === 'criteria') {
    return (
      <div className="mission__hero" data-kind="criteria">
        <p className="mission__hero-line">
          <span className="mission__hero-number">{h.met}</span> of {h.total} criteria met
        </p>
        <div className="mission__segments" aria-hidden="true">
          {mission.criteria.map((c) => (
            <span
              key={c.id}
              data-met={metCount({ ...mission, criteria: [c] }) === 1 || undefined}
            />
          ))}
        </div>
      </div>
    );
  }
  const big = isBigNumber(h.value);
  const goal = h.kind === 'reduce' ? `goal under ${fmt(h.target)}` : `of ${fmt(h.target)}`;
  return (
    <div className="mission__hero" data-kind={h.kind}>
      <p className="mission__hero-line">
        <span className="mission__hero-number" data-big={big || undefined}>
          {fmt(h.value)}
        </span>{' '}
        <span className="mission__hero-goal">
          {goal}
          {h.unit ? ` ${h.unit}` : ''}
        </span>
      </p>
      {h.kind === 'ticks' ? (
        <div className="mission__ticks" aria-hidden="true">
          {Array.from({ length: h.target }, (_, i) => (
            <span key={i} data-on={i < h.value || undefined} />
          ))}
        </div>
      ) : (
        <div className="mission__bar" aria-hidden="true">
          <span
            style={{
              width: `${
                h.kind === 'reduce' ? h.covered * 100 : Math.min(100, (h.value / h.target) * 100)
              }%`,
            }}
          />
        </div>
      )}
      {h.source && <p className="mission__source">{h.source}</p>}
    </div>
  );
}

function Shares({ mission }: { mission: Mission }) {
  return (
    <section className="mission__section" aria-label="Usage to spend">
      <h3 className="mission__heading">Usage to spend</h3>
      {mission.shares.map((s) => {
        const r = shareRow(s);
        return (
          <div key={s.engine} className="mission__share" data-over={r.over || undefined}>
            <div className="mission__share-head">
              <span className="mission__engine">{r.name}</span>
              <span className="mission__share-text">{r.text}</span>
            </div>
            <div
              className="mission__share-bar"
              data-unread={r.unread || undefined}
              aria-hidden="true"
            >
              <span className="mission__share-fill" style={{ width: `${r.fill}%` }} />
              <span className="mission__share-marker" style={{ left: `${r.marker}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BannerView({
  b,
  onAct,
  busy,
}: {
  b: Banner;
  onAct: (a: Banner['actions'][number]) => void;
  busy: boolean;
}) {
  return (
    <div
      className="mission__banner"
      data-tone={b.tone}
      role={b.tone === 'red' ? 'alert' : 'status'}
    >
      <p className="mission__banner-title">{b.title}</p>
      <p className="mission__banner-text">{b.text}</p>
      <div className="mission__actions">
        {b.actions.map((a, i) => (
          <Button
            key={a.label}
            variant={i === 0 && b.tone !== 'red' ? 'default' : 'secondary'}
            size="compact"
            disabled={busy}
            onClick={() => onAct(a)}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function MissionPage({
  mission,
  onOpenChief,
}: {
  mission: Mission;
  /** "Review all": the asks are answered in the Chief's chat. */
  onOpenChief?: () => void;
}) {
  const { showToast } = useOptionalToast();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showAllCriteria, setShowAllCriteria] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const b = banner(mission);
  const asks = asksStrip(mission.asks);
  const criteria = showAllCriteria ? mission.criteria : mission.criteria.slice(0, CRITERIA_SHOWN);
  const hiddenCriteria = mission.criteria.length - criteria.length;
  const events = mission.events.slice(0, EVENTS_SHOWN);
  const totalEvents = mission.eventCount ?? mission.events.length;
  const agents = mission.agents.slice(0, AGENTS_SHOWN);
  const end = endDate(mission);
  const running = mission.state === 'starting' || mission.state === 'running';

  const act = async (a: Banner['actions'][number]) => {
    if (a.action === 'see') {
      document
        .getElementById(`mission-criteria-${mission.id}`)
        ?.scrollIntoView?.({ block: 'start' });
      return;
    }
    setBusy(true);
    try {
      if (a.action === 'finish_with') {
        // Stop the share that is over by stopping nothing: the user asked the Chief to carry on
        // with the other engine only; it is the Chief's to arrange, so say so in its chat.
        onOpenChief?.();
        return;
      }
      await missionAct(mission.id, a.action === 'add_more' ? 'add_more' : a.action, a.engine, 10);
    } catch (e) {
      showToast(formatCommandError(asCommandError(e)), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="mission" data-state={mission.state} aria-label={`Mission: ${mission.goal}`}>
      <header className="mission__head">
        <p className="mission__state">
          <span className="mission__dot" aria-hidden="true" />
          {STATE_WORD[mission.state]} · {dayLabel(mission, now)}
        </p>
        <h2 className="mission__goal">{mission.goal}</h2>
        {mission.summary && <p className="mission__summary">{mission.summary}</p>}
        <p className="mission__meta">
          Started{' '}
          {new Date(mission.startedAt).toLocaleString([], {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
          {' · '}Ends when done, the shares run out{end ? `, or ${end}` : ''}
        </p>
      </header>

      {b && <BannerView b={b} onAct={(a) => void act(a)} busy={busy} />}

      <Hero mission={mission} />

      <Shares mission={mission} />

      {asks.all > 0 && (
        <section className="mission__section mission__asks" aria-label="Waiting on you">
          <h3 className="mission__heading">Waiting on you</h3>
          {asks.shown.map((a) => (
            <div key={a.id} className="mission__ask">
              <p className="mission__ask-text">{a.text}</p>
              {a.detail && <p className="mission__ask-detail">{a.detail}</p>}
            </div>
          ))}
          {asks.more > 0 && <p className="mission__more">and {asks.more} more</p>}
          <div className="mission__actions">
            <Button variant="secondary" size="compact" onClick={onOpenChief}>
              {asks.all > 1 ? `Review all ${asks.all}` : 'Review'}
            </Button>
          </div>
        </section>
      )}

      <section
        className="mission__section"
        id={`mission-criteria-${mission.id}`}
        aria-label="What counts as done"
      >
        <h3 className="mission__heading">What counts as done</h3>
        <ul className="mission__list">
          {criteria.map((c) => (
            <li key={c.id} className="mission__criterion" data-status={c.status}>
              <span className="mission__criterion-text">{c.text}</span>
              <span className="mission__criterion-word">{criterionWord(c)}</span>
              {c.note && <span className="mission__criterion-note">{c.note}</span>}
            </li>
          ))}
        </ul>
        {hiddenCriteria > 0 && (
          <TextButton onClick={() => setShowAllCriteria(true)}>
            + {hiddenCriteria} more criteria
          </TextButton>
        )}
        {mission.checkedBy && (
          <p className="mission__checked">
            Checked by {ENGINE_NAME[mission.checkedBy]}
            {mission.agents.some((a) => a.engine === mission.checkedBy)
              ? ''
              : ', which did not do the work'}
            . It says it checked: {metCount(mission)} of {mission.criteria.length} met.
          </p>
        )}
      </section>

      {agents.length > 0 && (
        <section className="mission__section" aria-label="On it">
          <h3 className="mission__heading">On it</h3>
          <ul className="mission__list">
            {agents.map((a) => (
              <li key={a.name} className="mission__agent">
                <span className="mission__agent-name">{a.name}</span>
                <span className="mission__agent-engine">{ENGINE_NAME[a.engine]}</span>
                <span className="mission__agent-status">{agentStatus(mission, a)}</span>
              </li>
            ))}
          </ul>
          {mission.agents.length > AGENTS_SHOWN && (
            <p className="mission__more">+ {mission.agents.length - AGENTS_SHOWN} more agents</p>
          )}
        </section>
      )}

      <section className="mission__section" aria-label="What happened">
        <h3 className="mission__heading">What happened</h3>
        {events.length === 0 ? (
          <p className="mission__empty">
            Nothing yet. The first update lands when the first step finishes.
          </p>
        ) : (
          <ul className="mission__list">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="mission__event">
                <span className="mission__event-text">{e.text}</span>
                <span className="mission__event-meta">
                  {e.agent} · {clockTime(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {totalEvents > EVENTS_SHOWN && (
          <p className="mission__more">Show all {fmt(totalEvents)} updates</p>
        )}
      </section>

      <footer className="mission__foot">
        <p className="mission__note">{bottomNote(mission)}</p>
        {running && (
          <Button
            variant="secondary"
            size="compact"
            disabled={busy}
            onClick={() => void act({ label: 'Pause', action: 'pause' })}
          >
            Pause
          </Button>
        )}
      </footer>
    </article>
  );
}

/** The missions, kept fresh as they change. */
export function useMissions(load: () => Promise<Mission[]>): Mission[] {
  const [missions, setMissions] = useState<Mission[]>([]);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void load()
        .then((m) => alive && setMissions(m))
        .catch(() => {});
    read();
    let off: (() => void) | undefined;
    void listen(MISSIONS_EVENT, read)
      .then((u) => (off = u))
      .catch(() => {});
    return () => {
      alive = false;
      off?.();
    };
  }, [load]);
  return useMemo(() => missions, [missions]);
}
