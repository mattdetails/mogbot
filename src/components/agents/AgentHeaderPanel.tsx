/**
 * The quiet header and its ⌄ panel (Julian's pick, 20 Nov;
 * designs/chat-header/spec-header-dropdown.md). The header holds only who
 * you're talking to: the key, the name, ⌄ and a hint dot, one button.
 * Everything about the agent right now lives behind the ⌄, in groups that
 * are left out when they have nothing to show: who it is, Now, Tasks, Needs
 * your OK, Conversations (the only conversation switcher), then Edit agent
 * and Instructions and memory.
 *
 * @module components/agents/AgentHeaderPanel
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  CheckIcon,
  ChevronIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from '@/components/icons';
import { Dropdown, DropdownItem } from '../primitives/Dropdown';
import { Button } from '../primitives/Button';
import { AgentKey } from './AgentKey';
import { AgentModelItems, modelChipWords } from './AgentModelMenu';
import {
  ENGINE_LABEL,
  agentKeyState,
  failedTurn,
  failurePill,
  hintDot,
  plainActivity,
  roleWithoutPath,
  usageLimited,
  type Agent,
  type AgentIndependence,
} from '../../lib/agents';
import { getTaskBoard, type AgentTask } from '../../lib/agentTasks';
import { conversationTitle, type ConversationView } from '../../lib/agentConversations';
import {
  openConversation,
  refreshConversations,
  startConversation,
  useAgentsSelector,
} from '../../lib/agentsStore';
import { formatAge } from '../../lib/formatAgo';
import { useNow } from '../../hooks/useNow';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { useOptionalToast } from '../../contexts/ToastContext';
import { INDEPENDENCE_LABEL } from '../../../packages/companion-protocol/src/independence';
import { workingRowLine } from '../../../packages/companion-protocol/src/work';
import { previewText } from '../../../packages/companion-protocol/src/preview';

/** Every word the panel says, once (spec "Copy"). */
export const HEADER_COPY = {
  now: 'Now',
  idle: 'Idle',
  waiting: 'Waiting for your OK',
  didntFinish: "Didn't finish",
  tryAgain: 'Try again',
  paused: 'Paused until the refill',
  tasks: 'Tasks',
  allTasks: 'All tasks',
  review: 'Review',
  conversations: 'Conversations',
  newConversation: 'New conversation',
  editAgent: 'Edit agent',
  instructions: 'Instructions and memory',
  nextTurn: 'Next turn',
  model: 'Model',
} as const;

/** "1 waits on you" / "2 wait on you". */
export const waitsWords = (n: number) => `${n} ${n === 1 ? 'waits' : 'wait'} on you`;
/** "1 request needs your OK" / "2 requests need your OK". */
export const requestWords = (n: number) =>
  `${n} ${n === 1 ? 'request needs' : 'requests need'} your OK`;

/** At most this many task lines and other conversations in the panel. */
const TASK_LINES = 3;
const OTHER_CONVERSATIONS = 3;

/** The top task lines: what it's doing, then what waits on you, then next. */
export function topTasks(open: AgentTask[]): AgentTask[] {
  const rank = (t: AgentTask) =>
    t.state === 'doing' ? 0 : t.state === 'waiting' ? 1 : t.state === 'next' ? 2 : 3;
  return open
    .filter((t) => rank(t) < 3)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, TASK_LINES);
}

/** The panel's conversations: the one on screen first, then the most recent others. */
export function panelConversations(
  items: ConversationView[] | undefined,
  viewing: string
): ConversationView[] {
  if (!items) return [];
  const current = items.find((c) => c.id === viewing);
  const others = items
    .filter((c) => c.id !== viewing)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .slice(0, OTHER_CONVERSATIONS);
  return current ? [current, ...others] : others;
}

const DOT_WORDS = {
  waits: 'Something waits on you',
  failed: "The last turn didn't finish",
  working: 'Working',
} as const;

export function AgentHeaderPanel({
  agent,
  viewing,
  teamIndependence,
  open,
  onOpenChange,
  onEdit,
  onEditMemory,
  onAllTasks,
  onRetry,
  onReview,
}: {
  agent: Agent;
  /** The conversation on screen. */
  viewing: string;
  teamIndependence?: AgentIndependence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onEditMemory: () => void;
  onAllTasks: () => void;
  /** Try again on a turn that didn't finish; absent when there's nothing to retry. */
  onRetry?: () => void;
  /** Scroll to the first request waiting for an answer. */
  onReview: () => void;
}) {
  const { showToast } = useOptionalToast();
  const conversations = useAgentsSelector((s) => s.conversations[agent.id]);
  const [tasks, setTasks] = useState<AgentTask[] | null>(null);
  // "Next turn: …" swaps the panel for the model menu, with a way back.
  const [modelView, setModelView] = useState(false);
  const engines = useAgentsSelector((s) => s.engines);
  const dot = hintDot(agent);
  const counts = agent.tasks;
  const hasTasks = Boolean(counts && (counts.doing || counts.toDo > 0 || counts.waits > 0));

  // What it has open is read when the panel opens, as the Tasks panel does.
  useEffect(() => {
    if (!open) return;
    void refreshConversations(agent.id);
    if (!hasTasks) return;
    let live = true;
    getTaskBoard()
      .then((board) => {
        if (live) setTasks(board.find((b) => b.agentId === agent.id)?.open ?? []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, agent.id, hasTasks]);

  const fail = useCallback(
    (e: unknown) => showToast(formatCommandError(asCommandError(e)), 'error'),
    [showToast]
  );
  const openChange = (next: boolean) => {
    if (!next) setModelView(false);
    onOpenChange(next);
  };
  const close = () => openChange(false);

  const level = agent.independence ?? teamIndependence ?? undefined;
  const runsOn = [ENGINE_LABEL[agent.engine], level ? INDEPENDENCE_LABEL[level] : null]
    .filter(Boolean)
    .join(' · ');
  const role = agent.role ? roleWithoutPath(agent.role) : '';
  const requests = agent.pendingApprovals ?? 0;
  const shownConversations = panelConversations(conversations?.items, viewing);
  const top = tasks ? topTasks(tasks) : [];

  return (
    <Dropdown
      align="left"
      portal
      presentation="popover"
      ariaLabel={`${agent.name}: what it's doing, its tasks and conversations`}
      open={open}
      onOpenChange={openChange}
      menuClassName="agent-header-panel"
      className="agent-chat__quiet-anchor"
      trigger={(p) => (
        <button
          {...p}
          type="button"
          tabIndex={0}
          className="agent-chat__name-button"
          aria-label={`${agent.name}${dot ? `, ${DOT_WORDS[dot].toLowerCase()}` : ''}`}
        >
          <AgentKey
            id={agent.id}
            name={agent.name}
            color={agent.color}
            state={agentKeyState(agent)}
            size="sm"
          />
          <h2 className="agent-chat__name">{agent.name}</h2>
          <ChevronIcon
            size={12}
            className={`agent-chat__name-chevron${p['aria-expanded'] ? ' chevron-flipped' : ''}`}
          />
          {dot && <span className="agent-chat__hint-dot" data-dot={dot} aria-hidden="true" />}
        </button>
      )}
    >
      {modelView ? (
        <div
          role="menu"
          aria-label={HEADER_COPY.model}
          className="agent-header-panel__model agent-model-menu"
        >
          <DropdownItem
            keepOpen
            icon={<ArrowLeftIcon size={12} />}
            onSelect={() => setModelView(false)}
          >
            <span className="agent-header-panel__row-label">{agent.name}</span>
          </DropdownItem>
          <AgentModelItems agent={agent} />
        </div>
      ) : (
        <>
          <div className="agent-header-panel__identity">
            <AgentKey
              id={agent.id}
              name={agent.name}
              color={agent.color}
              state={agentKeyState(agent)}
              size="md"
            />
            <div className="agent-header-panel__who">
              <p className="agent-header-panel__name">{agent.name}</p>
              {role && <p className="agent-header-panel__role">{role}</p>}
              <p className="agent-header-panel__runs">Runs on {runsOn}</p>
            </div>
          </div>

          <Group label={HEADER_COPY.now}>
            <NowRow agent={agent} onRetry={onRetry} onDone={close} />
            {/* What the next turn runs on (Julian, 20 Nov: out of the message
            box, into here); people change it seldom. */}
            <div role="menu" aria-label={HEADER_COPY.model}>
              <DropdownItem keepOpen onSelect={() => setModelView(true)}>
                <span className="agent-header-panel__row-label">
                  {HEADER_COPY.nextTurn}: {modelChipWords(agent, engines)}
                </span>
                <ChevronRightIcon size={12} className="agent-header-panel__chevron" />
              </DropdownItem>
            </div>
          </Group>

          {hasTasks && counts && (
            <Group
              label={HEADER_COPY.tasks}
              aside={
                <>
                  {`${counts.toDo} to do`}
                  {counts.waits > 0 && (
                    <>
                      {' · '}
                      <span className="agent-header-panel__waits">{waitsWords(counts.waits)}</span>
                    </>
                  )}
                </>
              }
            >
              {top.map((t) => (
                <div key={t.id} className="agent-header-panel__task" data-state={t.state}>
                  <span className="agent-header-panel__mark" aria-hidden="true" />
                  <span className="agent-header-panel__text">{t.title}</span>
                </div>
              ))}
              <div role="menu" aria-label={HEADER_COPY.tasks}>
                <DropdownItem
                  onSelect={() => {
                    close();
                    onAllTasks();
                  }}
                >
                  <span className="agent-header-panel__row-label">{HEADER_COPY.allTasks}</span>
                  <ChevronRightIcon size={12} className="agent-header-panel__chevron" />
                </DropdownItem>
              </div>
            </Group>
          )}

          {requests > 0 && (
            <Group>
              <div className="agent-header-panel__now" data-tone="waits">
                <span className="agent-header-panel__dot" aria-hidden="true" />
                <span className="agent-header-panel__row-label">{requestWords(requests)}</span>
                <Button
                  size="compact"
                  variant="default"
                  onClick={() => {
                    close();
                    onReview();
                  }}
                >
                  {HEADER_COPY.review}
                </Button>
              </div>
            </Group>
          )}

          <Group label={HEADER_COPY.conversations}>
            <div role="menu" aria-label={HEADER_COPY.conversations}>
              {shownConversations.map((c) => (
                <DropdownItem
                  key={c.id}
                  active={c.id === viewing}
                  icon={
                    <span className="agent-header-panel__tick">
                      {c.id === viewing && <CheckIcon size={12} aria-label="On screen" />}
                    </span>
                  }
                  onSelect={() => void openConversation(agent.id, c.id)}
                >
                  <span className="agent-header-panel__row-label">{conversationTitle(c)}</span>
                  {c.lastActivityAt > 0 && (
                    <span className="agent-header-panel__when">{formatAge(c.lastActivityAt)}</span>
                  )}
                </DropdownItem>
              ))}
              <DropdownItem
                icon={<PlusIcon size={12} />}
                onSelect={() => void startConversation(agent.id).catch(fail)}
              >
                <span className="agent-header-panel__row-label">{HEADER_COPY.newConversation}</span>
              </DropdownItem>
            </div>
          </Group>

          <div className="agent-header-panel__foot">
            <Button
              size="compact"
              variant="ghost"
              onClick={() => {
                close();
                onEdit();
              }}
            >
              {HEADER_COPY.editAgent}
            </Button>
            <Button
              size="compact"
              variant="ghost"
              onClick={() => {
                close();
                onEditMemory();
              }}
            >
              {HEADER_COPY.instructions}
            </Button>
          </div>
        </>
      )}
    </Dropdown>
  );
}

function Group({
  label,
  aside,
  children,
}: {
  label?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="agent-header-panel__group">
      {label && (
        <p className="agent-header-panel__label">
          <span>{label}</span>
          {aside && <span className="agent-header-panel__aside">{aside}</span>}
        </p>
      )}
      {children}
    </section>
  );
}

/** The one Now row: working, waiting for your OK, didn't finish, paused, or idle. */
function NowRow({
  agent,
  onRetry,
  onDone,
}: {
  agent: Agent;
  onRetry?: () => void;
  onDone: () => void;
}) {
  const working = agent.status.state === 'working' && !agent.takeover;
  const now = useNow(working, 5_000);
  const failure = failedTurn(agent);
  if (working) {
    const { text, elapsed } = workingRowLine(
      plainActivity(agent.status.activity),
      agent.status.work,
      agent.status.since,
      now
    );
    return (
      <div className="agent-header-panel__now" data-tone="working">
        <span className="agent-header-panel__dot" aria-hidden="true" />
        <span className="agent-header-panel__row-label">{text}</span>
        {elapsed && <span className="agent-header-panel__when">{elapsed}</span>}
      </div>
    );
  }
  if (agent.status.state === 'waiting' || (agent.pendingApprovals ?? 0) > 0) {
    return (
      <div className="agent-header-panel__now" data-tone="waits">
        <span className="agent-header-panel__dot" aria-hidden="true" />
        <span className="agent-header-panel__row-label">{HEADER_COPY.waiting}</span>
      </div>
    );
  }
  if (failure && usageLimited(agent)) {
    const left = failure.resetsAt ? untilWords(failure.resetsAt - Date.now()) : null;
    return (
      <div className="agent-header-panel__now" data-tone="paused">
        <span className="agent-header-panel__dot" aria-hidden="true" />
        <span className="agent-header-panel__row-label">
          {HEADER_COPY.paused}
          {left && ` · ${left}`}
        </span>
      </div>
    );
  }
  if (failure) {
    const reason = failurePill(failure, previewText(agent.preview) ?? null, agent.engine).rest;
    return (
      <div className="agent-header-panel__now" data-tone="failed">
        <span className="agent-header-panel__dot" aria-hidden="true" />
        <span className="agent-header-panel__row-label">
          {HEADER_COPY.didntFinish}
          {reason && `: ${reason}`}
        </span>
        {onRetry && (
          <Button
            size="compact"
            variant="default"
            onClick={() => {
              onDone();
              onRetry();
            }}
          >
            {HEADER_COPY.tryAgain}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="agent-header-panel__now" data-tone="idle">
      <span className="agent-header-panel__dot" aria-hidden="true" />
      <span className="agent-header-panel__row-label">{HEADER_COPY.idle}</span>
    </div>
  );
}

/** "1d 10h", "3h 5m", "12m": how long until the refill. */
export function untilWords(ms: number): string | null {
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
