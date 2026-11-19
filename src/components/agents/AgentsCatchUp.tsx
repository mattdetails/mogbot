/**
 * Catch up on the desk: what waits on you, one decision at a time, as on the
 * phone. One card in the middle (who asked and when, what it is in a line, why
 * in two, and for a send the exact words), Deny and Allow under it, Open chat
 * and Later quieter. "Up next" shows what is coming so it never feels endless.
 * Allow is black and white, never an agent's colour. Keys A, D, O and L work
 * while the card has focus (never from anywhere else: a one-key yes on a card
 * not read is the reflex the guard exists to stop, `useCardGuard`); Esc closes.
 *
 * Rules and order: `lib/catchUpDesk.ts`.
 *
 * @module components/agents/AgentsCatchUp
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { formatAgo } from '../../lib/formatAgo';
import { draftOf } from '../../lib/draftCard';
import {
  answersHere,
  catchItems,
  leftCount,
  withLater,
  type CatchItem,
} from '../../lib/catchUpDesk';
import { previewText } from '../../../packages/companion-protocol/src/preview';

interface Props {
  onOpenAgent: (id: string) => void;
  onOpenMessage: (agentId: string, messageId: string, conversation?: string) => void;
  onClose: () => void;
  /** The old overview, one click away. */
  onOpenInFlight: () => void;
}

/** What the request is, in two words, for the tag and the Up next line. */
function kindOf(m: AgentMessage | undefined): string {
  const a = m?.approval;
  if (!a) return 'Didn’t finish';
  const d = draftOf(a);
  if (d?.kind === 'slack') return 'Send in Slack';
  if (d?.kind === 'email') return 'Send an email';
  if (a.login) return 'Sign in';
  if (a.secret) return 'A key';
  if (a.prompt) return 'Question';
  if (a.plan) return 'Under your name';
  return 'Request';
}

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
  const item = left > 0 ? items[0] : undefined;
  // How many there were when you came in, for the bar.
  const [total, setTotal] = useState(left);
  if (left > total) setTotal(left);

  const happened = useMemo(
    () =>
      agents
        .filter((a) => !a.hidden && a.unread > 0 && !all.some((i) => i.agent.id === a.id))
        .slice(0, 6),
    [agents, all]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="agents-catchup">
      <header className="agents-catchup__head">
        <h2 className="agents-catchup__title">Catch up</h2>
        <span className="agents-catchup__left" aria-live="polite">
          {left > 0 ? `${left} left` : 'All clear'}
        </span>
        <span className="agents-catchup__bar" aria-hidden>
          <span
            style={{
              width: `${total ? ((total - left) / total) * 100 : 100}%`,
            }}
          />
        </span>
        <TextButton tabIndex={0} onClick={onOpenInFlight}>
          What’s in flight
        </TextButton>
        <TextButton tabIndex={0} onClick={onClose} aria-keyshortcuts="Escape">
          Close <kbd>esc</kbd>
        </TextButton>
      </header>
      <div className="agents-catchup__body">
        {item ? (
          <Decision
            key={item.key}
            item={item}
            onOpenChat={() =>
              item.message
                ? onOpenMessage(item.agent.id, item.message.id, item.message.conversation)
                : onOpenAgent(item.agent.id)
            }
            onLater={() => setLater((l) => [...l.filter((k) => k !== item.key), item.key])}
          />
        ) : (
          <CaughtUp
            happened={happened}
            saved={all.length}
            onOpenAgent={onOpenAgent}
            onReview={() => setLater([])}
            onClose={onClose}
          />
        )}
        <aside className="agents-catchup__next" aria-label="Up next">
          <h3>Up next</h3>
          {items
            .filter((i) => i.key !== item?.key && !later.includes(i.key))
            .slice(0, 5)
            .map((i) => (
              <div key={i.key} className="agents-catchup__next-row">
                <AgentKey id={i.agent.id} name={i.agent.name} color={i.agent.color} size="sm" />
                <span>
                  <span className="agents-catchup__next-title">{headline(i)}</span>
                  <span className="agents-catchup__next-sub">
                    {i.agent.name} · {kindOf(i.message)}
                  </span>
                </span>
              </div>
            ))}
          {happened.length > 0 && (
            <p className="agents-catchup__then">
              Then: {happened.length} {happened.length === 1 ? 'thing' : 'things'} that happened
              while you were away. One card, no decisions.
            </p>
          )}
        </aside>
      </div>
    </div>
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
          size="sm"
        />
        <span className="agents-catchup__name">{agent.name}</span>
        <span className="agents-catchup__ago">{formatAgo(item.ts)}</span>
        <span className="agents-catchup__tag">{kindOf(message)}</span>
      </div>
      <h3 className="agents-catchup__ask">{headline(item)}</h3>
      {why(item) && <p className="agents-catchup__why">{why(item)}</p>}
      {draft && (
        <div className="agents-catchup__words">
          <span className="agents-catchup__words-label">Sends as you, word for word</span>
          {draft.subject && <strong>{draft.subject}</strong>}
          <div>{draft.body}</div>
        </div>
      )}
      {approval && approval.detail.trim() && (
        <div className="agents-catchup__more">
          <TextButton tabIndex={0} onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? 'Hide' : 'Show everything it said'}
          </TextButton>
          {all && <pre>{approval.detail}</pre>}
        </div>
      )}
      <div className="agents-catchup__actions">
        {here ? (
          <>
            <Button
              tabIndex={0}
              variant="secondary"
              width="fill"
              disabled={busy}
              onClick={() => void answer(false)}
              aria-keyshortcuts="D"
            >
              Deny <kbd>D</kbd>
            </Button>
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
              Allow <kbd>A</kbd>
            </Button>
          </>
        ) : (
          <Button tabIndex={0} variant="strong" width="fill" onClick={onOpenChat}>
            Open chat <kbd>O</kbd>
          </Button>
        )}
      </div>
      <div className="agents-catchup__quiet">
        {here && (
          <TextButton tabIndex={0} onClick={onOpenChat} aria-keyshortcuts="O">
            Open chat <kbd>O</kbd>
          </TextButton>
        )}
        <TextButton tabIndex={0} onClick={onLater} aria-keyshortcuts="L">
          Later <kbd>L</kbd>
        </TextButton>
      </div>
    </article>
  );
}

function CaughtUp({
  happened,
  saved,
  onOpenAgent,
  onReview,
  onClose,
}: {
  happened: Agent[];
  /** Put off with Later: still waiting. */
  saved: number;
  onOpenAgent: (id: string) => void;
  onReview: () => void;
  onClose: () => void;
}) {
  return (
    <section className="agents-catchup__card agents-catchup__done" tabIndex={-1}>
      <h3 className="agents-catchup__ask">You’re caught up</h3>
      <p className="agents-catchup__why">
        {saved > 0
          ? `${saved} ${saved === 1 ? 'is' : 'are'} saved for Later and still waiting.`
          : happened.length
            ? 'While you were away'
            : 'Nothing else is waiting on you.'}
      </p>
      {happened.map((a) => (
        <button
          key={a.id}
          type="button"
          tabIndex={0}
          className="agents-catchup__happened"
          onClick={() => onOpenAgent(a.id)}
        >
          <AgentKey id={a.id} name={a.name} color={a.color} size="sm" />
          <span>
            <span className="agents-catchup__next-title">
              {previewText(a.preview) || 'Something new'}
            </span>
            <span className="agents-catchup__next-sub">{a.name}</span>
          </span>
        </button>
      ))}
      <div className="agents-catchup__actions">
        {saved > 0 && (
          <Button tabIndex={0} variant="secondary" width="fill" onClick={onReview}>
            Go through them
          </Button>
        )}
        <Button tabIndex={0} variant="strong" width="fill" onClick={onClose}>
          Done
        </Button>
      </div>
    </section>
  );
}
