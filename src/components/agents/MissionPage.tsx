/**
 * A mission's page (`agents::missions`, Designer's spec-missions and
 * spec-mission-states, built to their render.mjs): the goal and its state, a
 * framed two-pane hero (the number that says how far it got, and the usage
 * shares with their caps marked), what waits on you, what counts as done with
 * a status mark each, what happened and who is on it, with their keys. Every
 * rule that turns the record into this page is a pure function in
 * `lib/missions.ts`, tested against the eight cases.
 *
 * Banners are for state only: amber at a share, red when blocked, neutral
 * when ready for review. Nothing is colour-only: every mark has words.
 *
 * @module components/agents/MissionPage
 */
import { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Button } from '../primitives/Button';
import { TextButton } from '../primitives/TextButton';
import { AgentKey } from './AgentKey';
import { useOptionalToast } from '../../contexts/ToastContext';
import { useAgentsShape } from '../../lib/agentsStore';
import { asCommandError, formatCommandError } from '../../lib/errors';
import {
  AGENTS_SHOWN,
  CRITERIA_SHOWN,
  ENGINE_NAME,
  EVENTS_SHOWN,
  MISSIONS_EVENT,
  agentStatus,
  asksStrip,
  banner,
  bottomNote,
  criterionMark,
  criterionWord,
  dayLabel,
  endDate,
  fmt,
  hero,
  heroNote,
  isAsleep,
  isBigNumber,
  metCount,
  missionAct,
  shareRow,
  stateWord,
  type Banner,
  type Mission,
} from '../../lib/missions';

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** A mission agent's key: the real agent's when the team has one by that name. */
function MissionKey({ name }: { name: string }) {
  const agents = useAgentsShape();
  const agent = agents.find((a) => a.name === name);
  return <AgentKey id={agent?.id} name={name} color={agent?.color} size="sm" />;
}

function Hero({ mission }: { mission: Mission }) {
  const h = hero(mission);
  const note = heroNote(h);
  const label = h.kind === 'criteria' ? 'Progress' : 'Done when';
  let big: string;
  let sentence: string;
  if (h.kind === 'criteria') {
    big = String(h.met);
    sentence = `of ${h.total} criteria met`;
  } else {
    big = fmt(h.value);
    sentence =
      `${h.kind === 'reduce' ? `${h.unit ?? ''} · goal under ${fmt(h.target)}` : `of ${fmt(h.target)} ${h.unit ?? ''}`}`.trim();
  }
  return (
    <div className="mission__pane" data-kind={h.kind}>
      <p className="mission__label">{label}</p>
      <p
        className="mission__big"
        data-small={big.length > 3 || isBigNumber(Number(big.replace(/,/g, ''))) || undefined}
      >
        <b>{big}</b>
        <span>{sentence}</span>
      </p>
      {mission.summary ? (
        <p className="mission__sub">{mission.summary}</p>
      ) : (
        <p className="mission__sub mission__sub--empty" />
      )}
      {h.kind === 'ticks' && (
        <div
          className="mission__pips"
          style={{ gridTemplateColumns: `repeat(${h.target}, 1fr)` }}
          aria-hidden="true"
        >
          {Array.from({ length: h.target }, (_, i) => (
            <i key={i} data-on={i < h.value || undefined} />
          ))}
        </div>
      )}
      {h.kind === 'criteria' && (
        <div
          className="mission__pips mission__pips--thin"
          style={{ gridTemplateColumns: `repeat(${mission.criteria.length}, 1fr)` }}
          aria-hidden="true"
        >
          {mission.criteria.map((c) => (
            <i key={c.id} data-on={metCount({ ...mission, criteria: [c] }) === 1 || undefined} />
          ))}
        </div>
      )}
      {(h.kind === 'bar' || h.kind === 'reduce') && (
        <div className="mission__cont" aria-hidden="true">
          <i
            style={{
              width: `${h.kind === 'reduce' ? h.covered * 100 : Math.min(100, (h.value / h.target) * 100)}%`,
            }}
          />
        </div>
      )}
      {(note.left || note.right) && (
        <p className="mission__pipnote">
          <span>{note.left}</span>
          <span>{note.right}</span>
        </p>
      )}
    </div>
  );
}

function Shares({ mission }: { mission: Mission }) {
  return (
    <div className="mission__pane">
      <p className="mission__label">Usage shares</p>
      {mission.shares.map((s) => {
        const r = shareRow(s);
        const cap = r.kind === 'usage';
        return (
          <div key={s.engine} className="mission__eng" data-over={r.over || undefined}>
            <div className="mission__eng-row">
              <b>{r.name}</b>
              <span>{r.text}</span>
            </div>
            <div className="mission__track" data-none={r.unread || undefined} aria-hidden="true">
              {!r.unread && (
                <i
                  className="mission__fill"
                  style={{ width: `${r.over || !cap ? (cap ? r.marker : r.fill) : r.fill}%` }}
                />
              )}
              {r.over && (
                <i
                  className="mission__over"
                  style={{ left: `${r.marker}%`, width: `${Math.max(0, r.fill - r.marker)}%` }}
                />
              )}
              {cap && (
                <i
                  className="mission__cap"
                  style={{ left: `${r.marker}%` }}
                  data-l={`${fmt(s.pct)}%`}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
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
      <div className="mission__banner-text">
        <p>{b.title}</p>
        <small>{b.text}</small>
      </div>
      {b.actions.length > 0 && (
        <div className="mission__acts">
          {b.actions.map((a, i) => (
            <Button
              key={a.label}
              variant={
                i === 0
                  ? 'strong'
                  : i === b.actions.length - 1 && b.actions.length > 2
                    ? 'ghost'
                    : 'secondary'
              }
              size="compact"
              disabled={busy}
              onClick={() => onAct(a)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MissionPage({
  mission,
  onOpenChief,
  onReconnect,
}: {
  mission: Mission;
  /** "Review all": the asks are answered in the Chief's chat. */
  onOpenChief?: () => void;
  /** "Reconnect": ask the Chief, which has the login card for that app. */
  onReconnect?: () => void;
}) {
  const { showToast } = useOptionalToast();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showAllCriteria, setShowAllCriteria] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const b = banner(mission, now);
  const asks = asksStrip(mission.asks);
  const criteria = showAllCriteria ? mission.criteria : mission.criteria.slice(0, CRITERIA_SHOWN);
  const hiddenCriteria = mission.criteria.length - criteria.length;
  const events = mission.events.slice(0, EVENTS_SHOWN);
  const totalEvents = mission.eventCount ?? mission.events.length;
  const agents = mission.agents.slice(0, AGENTS_SHOWN);
  const end = endDate(mission);
  const running =
    (mission.state === 'starting' || mission.state === 'running') && !isAsleep(mission, now);
  const tone = useMemo(() => {
    if (isAsleep(mission, now)) return 'idle';
    switch (mission.state) {
      case 'paused_cap':
        return 'warn';
      case 'blocked':
        return 'err';
      case 'running':
      case 'starting':
        return 'live';
      default:
        return 'idle';
    }
  }, [mission, now]);

  const act = async (a: Banner['actions'][number]) => {
    if (a.action === 'see') {
      document
        .getElementById(`mission-criteria-${mission.id}`)
        ?.scrollIntoView?.({ block: 'start' });
      return;
    }
    if (a.action === 'reconnect') {
      onReconnect?.();
      return;
    }
    if (a.action === 'finish_with') {
      // The Chief arranges the other engine's part: say so in its chat.
      onOpenChief?.();
      return;
    }
    setBusy(true);
    try {
      await missionAct(mission.id, a.action, a.engine, 10);
    } catch (e) {
      showToast(formatCommandError(asCommandError(e)), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="mission"
      data-state={isAsleep(mission, now) ? 'asleep' : mission.state}
      aria-label={`Mission: ${mission.goal}`}
    >
      <p className="mission__eye">
        <span className="mission__dot" data-tone={tone} aria-hidden="true" />
        Mission · {dayLabel(mission, now)} · {stateWord(mission, now)}
      </p>
      <h2 className="mission__goal">{mission.goal}</h2>
      <p className="mission__meta">
        <span>
          Started{' '}
          <b>
            {new Date(mission.startedAt).toLocaleString([], {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </b>
        </span>
        <span>
          Ends when done, the shares run out
          {end ? (
            <>
              , or <b>{end}</b>
            </>
          ) : (
            ''
          )}
        </span>
      </p>

      {b && <BannerView b={b} onAct={(a) => void act(a)} busy={busy} />}

      <div className="mission__hero">
        <Hero mission={mission} />
        <Shares mission={mission} />
      </div>

      {asks.all > 0 && (
        <section className="mission__strip" aria-label="Waiting on you">
          {asks.shown.map((a) => (
            <div key={a.id} className="mission__ask">
              <span className="mission__ask-dot" aria-hidden="true" />
              <div className="mission__ask-text">
                {a.text}
                {a.detail && <small>{a.detail}</small>}
              </div>
              {asks.all === 1 && (
                <div className="mission__acts">
                  <Button variant="strong" size="compact" onClick={onOpenChief}>
                    Review
                  </Button>
                </div>
              )}
            </div>
          ))}
          {asks.all > 1 && (
            <div className="mission__ask">
              <div className="mission__ask-text">
                {asks.more > 0 ? `and ${asks.more} more` : `${asks.all} things need your OK`}
              </div>
              <div className="mission__acts">
                <Button variant="strong" size="compact" onClick={onOpenChief}>
                  Review all {asks.all}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="mission__grid">
        <div>
          <section id={`mission-criteria-${mission.id}`} aria-label="What counts as done">
            <h3 className="mission__heading">What done means</h3>
            {criteria.map((c) => {
              const mark = criterionMark(c, mission);
              return (
                <div key={c.id} className="mission__crit" data-status={c.status}>
                  <span className="mission__mark" data-mark={mark} aria-hidden="true">
                    {mark === 'ok' ? '✓' : ''}
                  </span>
                  <div>
                    <div className="mission__crit-text">{c.text}</div>
                    {c.note && <div className="mission__crit-note">{c.note}</div>}
                  </div>
                  <span className="mission__crit-word">{criterionWord(c)}</span>
                </div>
              );
            })}
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
                . It says it checked.
              </p>
            )}
          </section>

          <section aria-label="What happened">
            <h3 className="mission__heading mission__heading--gap">What happened</h3>
            {events.length === 0 ? (
              <p className="mission__empty">
                Nothing yet. The first update lands when the first step finishes.
              </p>
            ) : (
              <div className="mission__rail">
                {events.map((e, i) => (
                  <div key={`${e.at}-${i}`} className="mission__ev">
                    <MissionKey name={e.agent} />
                    <div className="mission__ev-text">
                      {e.text}
                      <small>
                        {e.agent} · {clockTime(e.at)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {totalEvents > EVENTS_SHOWN && (
              <p className="mission__more">Show all {fmt(totalEvents)} updates</p>
            )}
          </section>
        </div>

        <aside className="mission__team" aria-label="On it">
          <h3 className="mission__heading">On it</h3>
          {agents.length === 0 ? (
            <p className="mission__empty">No one yet.</p>
          ) : (
            agents.map((a) => (
              <div key={a.name} className="mission__agent">
                <MissionKey name={a.name} />
                <div className="mission__agent-text">
                  <div className="mission__agent-name">{a.name}</div>
                  <div className="mission__agent-engine">{ENGINE_NAME[a.engine]}</div>
                </div>
                <span className="mission__agent-status">{agentStatus(mission, a)}</span>
              </div>
            ))
          )}
          {mission.agents.length > AGENTS_SHOWN && (
            <p className="mission__more">+ {mission.agents.length - AGENTS_SHOWN} more agents</p>
          )}
          <p className="mission__stop">{bottomNote(mission)}</p>
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
        </aside>
      </div>
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
