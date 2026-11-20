/**
 * Catch up on the desk: the queue on the left, the open card on the right
 * (Designer's direction 2). The queue is the list (Needs you, then the
 * summary row; what you answered moves to Done); the selected row is the card:
 * who asked and when, what it is in a line, why in a few, and for a send the
 * exact words. Words and their order are shared with the phone
 * (`companion-protocol/catchUpWords`).
 * Allow is black and white, never an agent's colour. Keys A, D, O and L work
 * while the card has focus (never from anywhere else: a one-key yes on a card
 * not read is the reflex the guard exists to stop, `useCardGuard`); Esc closes.
 *
 * Rules and order: `lib/catchUpDesk.ts`.
 *
 * @module components/agents/AgentsCatchUp
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, ChevronIcon, HistoryIcon } from '@/components/icons';
import { Button } from '../primitives/Button';
import { TextButton } from '../primitives/TextButton';
import { AgentKey } from './AgentKey';
import { useCardGuard } from './useCardGuard';
import { approvalKey } from './approvalKeys';
import { useRecentLines } from './AgentsTeamView';
import { useOptionalToast } from '../../contexts/ToastContext';
import {
  agentKeyState,
  answerApproval,
  failedTurn,
  failurePill,
  summarizeTeam,
  type Agent,
  type AgentMessage,
} from '../../lib/agents';
import { useAgentsSelector } from '../../lib/agentsStore';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { formatAge, formatAgo } from '../../lib/formatAgo';
import { draftOf } from '../../lib/draftCard';
import {
  answersHere,
  catchItems,
  leftCount,
  withLater,
  type CatchItem,
} from '../../lib/catchUpDesk';
import { previewText } from '../../../packages/companion-protocol/src/preview';
import {
  allClearLine,
  CATCH_UP,
  eyebrow,
  groupLabel,
  headCount,
  moreLine,
  summaryHead,
  summaryLine,
  SUMMARY_MAX,
  type CatchUpHeadState,
} from '../../../packages/companion-protocol/src/catchUpWords';

interface Props {
  onOpenAgent: (id: string) => void;
  onOpenMessage: (agentId: string, messageId: string, conversation?: string) => void;
  onClose: () => void;
  /** The old overview, one click away. */
  onOpenInFlight: () => void;
}

/** What kind of ask it is, for the card's eyebrow. */
function kindOf(m: AgentMessage | undefined): string {
  const a = m?.approval;
  if (!a) return eyebrow('unfinished');
  return a.login || a.secret || a.prompt ? eyebrow('input') : eyebrow('ok');
}

/** The time now, for what is noticed during a render (kept out of the component body). */
const stamp = (): number => Date.now();

/** A clock time in the user's own format, lower-cased ("5:57 am"). */
const clock = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();

/** The card's headline: what it is, in a line. */
const headline = (i: CatchItem): string =>
  i.message?.approval?.title ?? failurePill(failedTurn(i.agent)!, '', i.agent.engine).label;

/** Why, in two lines: the agent's own summary, else the first of the detail. */
function why(i: CatchItem): string {
  const a = i.message?.approval;
  if (!a) return previewText(i.agent.preview) ?? '';
  const raw = a.summary?.trim() || a.detail?.trim() || '';
  const first = raw.split('\n')[0];
  // A raw tool call isn't a reason: its own words are one click away.
  return /^[{[]/.test(first) ? '' : first;
}

export function AgentsCatchUp({ onOpenAgent, onOpenMessage, onClose, onOpenInFlight }: Props) {
  const agents = useAgentsSelector((s) => s.agents);
  const messages = useAgentsSelector((s) => s.messages);
  const lines = useRecentLines(agents, messages);
  const team = useMemo(() => summarizeTeam(agents, lines), [agents, lines]);
  const all = useMemo(() => catchItems(team.needsYou), [team.needsYou]);
  const [later, setLater] = useState<string[]>([]);
  const items = useMemo(() => withLater(all, later), [all, later]);
  const left = leftCount(all, later);

  // What was in the queue when it was seen, so an answered row can move to Done.
  const [seen, setSeen] = useState<CatchItem[]>([]);
  const [doneAt, setDoneAt] = useState<Record<string, number>>({});
  const missing = seen.filter((s) => !all.some((i) => i.key === s.key) && !(s.key in doneAt));
  const unseen = all.filter((i) => !seen.some((s) => s.key === i.key));
  if (unseen.length > 0) setSeen([...seen, ...unseen]);
  // An answered row moves to Done, stamped when it was noticed gone.
  if (missing.length > 0) {
    const at = stamp();
    setDoneAt({ ...doneAt, ...Object.fromEntries(missing.map((m) => [m.key, at])) });
  }
  const done = useMemo(
    () => seen.filter((s) => s.key in doneAt).sort((a, b) => doneAt[a.key] - doneAt[b.key]),
    [seen, doneAt]
  );
  const lastDecision =
    done.length > 0 ? clock(Math.max(...done.map((d) => doneAt[d.key]))) : undefined;

  const [gotIt, setGotIt] = useState(false);
  const happened = useMemo(
    () =>
      gotIt
        ? []
        : agents.filter((a) => !a.hidden && a.unread > 0 && !all.some((i) => i.agent.id === a.id)),
    [agents, all, gotIt]
  );

  // What is open: a row the user picked, else the first of Needs you, else the summary.
  const [picked, setPicked] = useState<string | null>(null);
  const open: string | null =
    picked === 'summary' && happened.length > 0
      ? 'summary'
      : picked && items.some((i) => i.key === picked)
        ? picked
        : (items[0]?.key ?? (happened.length > 0 ? 'summary' : null));
  const item = open && open !== 'summary' ? items.find((i) => i.key === open) : undefined;
  const summaryOpen = open === 'summary';

  const head: CatchUpHeadState = summaryOpen
    ? { kind: 'summary' }
    : left > 0
      ? { kind: 'left', left }
      : items.length > 0
        ? { kind: 'later', later: items.length }
        : { kind: 'clear' };

  const move = useCallback(
    (by: number) => {
      const keys = [...items.map((i) => i.key), ...(happened.length > 0 ? ['summary'] : [])];
      if (keys.length === 0) return;
      const at = Math.max(0, keys.indexOf(open ?? ''));
      setPicked(keys[Math.min(keys.length - 1, Math.max(0, at + by))]);
    },
    [items, happened.length, open, setPicked]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') return onClose();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, move]);

  const [queueOpen, setQueueOpen] = useState(false);
  const queue = (
    <Queue
      items={items}
      later={later}
      done={done}
      happened={happened}
      open={open}
      onPick={(key) => {
        setPicked(key);
        setQueueOpen(false);
      }}
    />
  );

  return (
    <div className="agents-catchup">
      <header className="agents-catchup__head">
        <h2 className="agents-catchup__title">{CATCH_UP.title}</h2>
        <span className="agents-catchup__left" aria-live="polite">
          {headCount(head)}
        </span>
        <button
          type="button"
          tabIndex={0}
          className="agents-catchup__left agents-catchup__left-button"
          aria-expanded={queueOpen}
          onClick={() => setQueueOpen(!queueOpen)}
        >
          {headCount(head)}
          <ChevronIcon size={12} />
        </button>
        <span className="agents-catchup__grow" />
        <Button tabIndex={0} variant="ghost" size="compact" onClick={onOpenInFlight}>
          {CATCH_UP.inFlight}
        </Button>
        <Button
          tabIndex={0}
          variant="ghost"
          size="compact"
          onClick={onClose}
          aria-keyshortcuts="Escape"
        >
          {CATCH_UP.close} <kbd>esc</kbd>
        </Button>
        {queueOpen && <div className="agents-catchup__popover">{queue}</div>}
      </header>
      <div className="agents-catchup__body">
        <aside className="agents-catchup__queue" aria-label="Queue">
          {queue}
        </aside>
        <div className="agents-catchup__pane">
          {item ? (
            <Decision
              key={item.key}
              item={item}
              onOpenChat={() =>
                item.message
                  ? onOpenMessage(item.agent.id, item.message.id, item.message.conversation)
                  : onOpenAgent(item.agent.id)
              }
              onLater={() => {
                setLater((l) => [...l.filter((k) => k !== item.key), item.key]);
                setPicked(null);
              }}
            />
          ) : summaryOpen ? (
            <Summary
              happened={happened}
              onOpenAgent={onOpenAgent}
              onGotIt={() => {
                setGotIt(true);
                setPicked(null);
              }}
            />
          ) : (
            <AllClear lastDecision={lastDecision} onOpenInFlight={onOpenInFlight} />
          )}
        </div>
      </div>
    </div>
  );
}

/** One row of the queue: a key (or a tile), a title and who, the age at the right. */
function Row({
  lead,
  title,
  sub,
  right,
  selected,
  muted,
  onPick,
}: {
  lead: ReactNode;
  title: string;
  sub?: string;
  right?: ReactNode;
  selected?: boolean;
  muted?: boolean;
  onPick?: () => void;
}) {
  const inner = (
    <>
      {lead}
      <span className="agents-catchup__row-text">
        <span className="agents-catchup__row-title">{title}</span>
        {sub && <span className="agents-catchup__row-sub">{sub}</span>}
      </span>
      {right && <span className="agents-catchup__row-right">{right}</span>}
    </>
  );
  const cls = `agents-catchup__row${selected ? ' is-selected' : ''}${muted ? ' is-muted' : ''}`;
  return onPick ? (
    <button
      type="button"
      tabIndex={0}
      className={cls}
      aria-current={selected || undefined}
      onClick={onPick}
    >
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

const tile = (icon: ReactNode) => (
  <span className="agents-catchup__tile" aria-hidden="true">
    {icon}
  </span>
);

/** The queue is the list: Done, Needs you, Then. Nothing is "up next" in another style. */
function Queue({
  items,
  later,
  done,
  happened,
  open,
  onPick,
}: {
  items: CatchItem[];
  later: string[];
  done: CatchItem[];
  happened: Agent[];
  open: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <>
      {done.length > 0 && (
        <section className="agents-catchup__group">
          <h3>{groupLabel.done(done.length)}</h3>
          {done.map((i) => (
            <Row
              key={i.key}
              muted
              lead={
                <AgentKey id={i.agent.id} name={i.agent.name} color={i.agent.color} size="md" />
              }
              title={headline(i)}
              right={<CheckIcon size={14} />}
            />
          ))}
        </section>
      )}
      <section className="agents-catchup__group">
        <h3>{groupLabel.needsYou(items.length)}</h3>
        {items.length === 0 && (
          <Row muted lead={tile(<CheckIcon size={14} />)} title={CATCH_UP.nothingWaiting} />
        )}
        {items.map((i) => (
          <Row
            key={i.key}
            lead={<AgentKey id={i.agent.id} name={i.agent.name} color={i.agent.color} size="md" />}
            title={headline(i)}
            sub={i.agent.name}
            right={later.includes(i.key) ? CATCH_UP.laterTag : formatAge(i.ts)}
            selected={open === i.key}
            onPick={() => onPick(i.key)}
          />
        ))}
      </section>
      {happened.length > 0 && (
        <section className="agents-catchup__group">
          <h3>{groupLabel.then}</h3>
          <Row
            lead={tile(<HistoryIcon size={14} />)}
            title={CATCH_UP.summaryTitle}
            sub={summaryLine(happened.length)}
            selected={open === 'summary'}
            onPick={() => onPick('summary')}
          />
        </section>
      )}
    </>
  );
}

function Decision({
  item,
  onOpenChat,
  onLater,
}: {
  item: CatchItem;
  onOpenChat: () => void;
  onLater: () => void;
}) {
  const { agent, message } = item;
  const approval = message?.approval;
  const here = answersHere(message);
  const { armed, guard, keyProps } = useCardGuard(here);
  const { showToast } = useOptionalToast();
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const card = useRef<HTMLElement>(null);
  const draft = draftOf(approval);
  // The card has focus from the moment it lands, so its keys work at once.
  useEffect(() => card.current?.focus(), []);

  const answer = useCallback(
    async (allow: boolean) => {
      if (!approval || busy) return;
      setBusy(true);
      try {
        await answerApproval(agent.id, approval.requestId, allow);
      } catch (e) {
        showToast(formatCommandError(asCommandError(e)), 'error');
      } finally {
        setBusy(false);
      }
    },
    [agent.id, approval, busy, showToast]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = approvalKey(e.nativeEvent);
    if (here && k === 'deny') void answer(false);
    else if (here && k === 'allow' && armed) void answer(true);
    else if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea')) return;
      if (e.key.toLowerCase() === 'o') onOpenChat();
      else if (e.key.toLowerCase() === 'l') onLater();
    }
  };

  return (
    <article
      ref={card}
      tabIndex={-1}
      className="agents-catchup__card"
      aria-label={`${agent.name}: ${headline(item)}`}
      onKeyDown={onKeyDown}
    >
      <div className="agents-catchup__who">
        <AgentKey
          id={agent.id}
          name={agent.name}
          color={agent.color}
          state={agentKeyState(agent, false)}
          size="md"
        />
        <span className="agents-catchup__name">{agent.name}</span>
        <span className="agents-catchup__ago">{formatAgo(item.ts)}</span>
      </div>
      <p className="agents-catchup__eyebrow">
        <span className="agents-catchup__dot" aria-hidden="true" />
        {kindOf(message)}
      </p>
      <h3 className="agents-catchup__ask">{headline(item)}</h3>
      {why(item) && <p className="agents-catchup__why">{why(item)}</p>}
      {draft && (
        <div className="agents-catchup__words">
          <span className="agents-catchup__words-label">Sends as you, word for word</span>
          {draft.subject && <strong>{draft.subject}</strong>}
          <div>{draft.body}</div>
        </div>
      )}
      {all && approval && <pre className="agents-catchup__detail">{approval.detail}</pre>}
      <div className="agents-catchup__actions">
        {here ? (
          <>
            <Button
              tabIndex={0}
              variant="strong"
              width="fill"
              data-allow
              disabled={busy}
              {...keyProps}
              onClick={guard(() => void answer(true))}
              aria-keyshortcuts="A"
            >
              {CATCH_UP.allow} <kbd>A</kbd>
            </Button>
            <Button
              tabIndex={0}
              variant="secondary"
              disabled={busy}
              onClick={() => void answer(false)}
              aria-keyshortcuts="D"
            >
              {CATCH_UP.deny} <kbd>D</kbd>
            </Button>
            {approval && approval.detail.trim() && (
              <Button tabIndex={0} variant="ghost" aria-expanded={all} onClick={() => setAll(!all)}>
                {CATCH_UP.details}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              tabIndex={0}
              variant="strong"
              width="fill"
              onClick={onOpenChat}
              aria-keyshortcuts="O"
            >
              {CATCH_UP.openChat} <kbd>O</kbd>
            </Button>
            <Button tabIndex={0} variant="ghost" onClick={onLater} aria-keyshortcuts="L">
              {CATCH_UP.later} <kbd>L</kbd>
            </Button>
          </>
        )}
      </div>
      {here && (
        <div className="agents-catchup__quiet">
          <Button
            tabIndex={0}
            variant="ghost"
            size="compact"
            onClick={onOpenChat}
            aria-keyshortcuts="O"
          >
            {CATCH_UP.openChat} <kbd>O</kbd>
          </Button>
          <Button
            tabIndex={0}
            variant="ghost"
            size="compact"
            onClick={onLater}
            aria-keyshortcuts="L"
          >
            {CATCH_UP.later} <kbd>L</kbd>
          </Button>
        </div>
      )}
    </article>
  );
}

function Summary({
  happened,
  onOpenAgent,
  onGotIt,
}: {
  happened: Agent[];
  onOpenAgent: (id: string) => void;
  onGotIt: () => void;
}) {
  const shown = happened.slice(0, SUMMARY_MAX);
  const rest = happened.length - shown.length;
  const gotIt = useRef<HTMLButtonElement>(null);
  useEffect(() => gotIt.current?.focus(), []);
  return (
    <section className="agents-catchup__card agents-catchup__summary" tabIndex={-1}>
      <div className="agents-catchup__who">
        {tile(<HistoryIcon size={14} />)}
        <span className="agents-catchup__name">{CATCH_UP.summaryTitle}</span>
        <span className="agents-catchup__ago">{summaryHead(happened.length)}</span>
      </div>
      <div className="agents-catchup__sum-rows">
        {shown.map((a) => (
          <button
            key={a.id}
            type="button"
            tabIndex={0}
            className="agents-catchup__sum-row"
            onClick={() => onOpenAgent(a.id)}
          >
            <AgentKey id={a.id} name={a.name} color={a.color} size="md" />
            <span className="agents-catchup__sum-text">
              {previewText(a.preview) || 'Something new'}
            </span>
            <span className="agents-catchup__row-right">{clock(a.lastActivityAt)}</span>
          </button>
        ))}
      </div>
      {rest > 0 && (
        <TextButton tabIndex={0} onClick={() => onOpenAgent(happened[SUMMARY_MAX].id)}>
          {moreLine(rest)}
        </TextButton>
      )}
      <div className="agents-catchup__actions">
        <Button ref={gotIt} tabIndex={0} variant="strong" width="fill" onClick={onGotIt}>
          {CATCH_UP.gotIt}
        </Button>
      </div>
    </section>
  );
}

function AllClear({
  lastDecision,
  onOpenInFlight,
}: {
  lastDecision?: string;
  onOpenInFlight: () => void;
}) {
  return (
    <section className="agents-catchup__clear" tabIndex={-1}>
      <span className="agents-catchup__ring" aria-hidden="true">
        <CheckIcon size={22} />
      </span>
      <h3>{CATCH_UP.allClear}</h3>
      <p>{allClearLine(lastDecision)}</p>
      <Button tabIndex={0} variant="secondary" onClick={onOpenInFlight}>
        {CATCH_UP.inFlight}
      </Button>
    </section>
  );
}
