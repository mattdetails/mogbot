/**
 * An agent's conversation inside a project's Session panel, where a terminal
 * would be (`lib/sessionAgentChat`). The same chat as in Agents: its
 * messages, cards, composer and "What it did", read from the one agents
 * store, so a reply here is a reply there. What only Agents can open (its
 * editor, sign-ins, the import, engine setup) goes to Agents with this
 * agent's chat open.
 *
 * @module components/workspace/SessionAgentChat
 */

import { useCallback, useEffect, useMemo } from 'react';
import { AgentChat } from '../agents/AgentChat';
import { PaneBoundary } from '../agents/AgentsErrorBoundary';
import { Spinner } from '../primitives/Spinner';
import { focusAgent, markAgentUnread, updateAgent, type Agent } from '../../lib/agents';
import { agentIn, readChat, startConversation, useAgentsList } from '../../lib/agentsStore';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { conversationForProject } from '../../lib/agentConversations';
import { useOptionalToast } from '../../contexts/ToastContext';
import { requestAgentsIntent } from '../../commands/useAgentsCommands';

export function SessionAgentChat({
  agentId,
  projectPath,
  onGoAgents,
  onGone,
}: {
  agentId: string;
  /** The project whose Session panel it's in: its conversation there opens (`conversationForProject`). */
  projectPath?: string;
  /** Leave for Agents (the intent says which chat opens there). */
  onGoAgents?: () => void;
  /** The agent no longer exists: go back to the terminals. */
  onGone: () => void;
}) {
  const { showToast } = useOptionalToast();
  const agents = useAgentsList();
  const agent = agentIn(agents, agentId);
  const loaded = agents.length > 0;

  useEffect(() => {
    readChat(agentId);
    // On screen now, so its replies are read as they land; leaving, they count as unread again.
    void focusAgent(agentId).catch(() => undefined);
    return () => void focusAgent(null).catch(() => undefined);
  }, [agentId]);

  useEffect(() => {
    if (loaded && !agent) onGone();
  }, [loaded, agent, onGone]);

  // Its conversation in this project (bound here now, or a new one for an
  // agent that works on another project too). The Chief stays the team's.
  const isMain = agent?.isMain ?? true;
  useEffect(() => {
    if (!projectPath || !loaded || isMain) return;
    void conversationForProject(agentId, projectPath).catch((e: unknown) =>
      showToast(formatCommandError(asCommandError(e)), 'error')
    );
  }, [agentId, projectPath, loaded, isMain, showToast]);

  const inAgents = useCallback(
    (id: string = agentId) => {
      requestAgentsIntent({ kind: 'open', agentId: id });
      onGoAgents?.();
    },
    [agentId, onGoAgents]
  );
  const run = useCallback(
    (f: () => Promise<unknown>) =>
      void f().catch((e: unknown) => showToast(formatCommandError(asCommandError(e)), 'error')),
    [showToast]
  );
  const actions = useMemo(
    () => ({
      onTogglePin: (a: Agent) => run(() => updateAgent(a.id, { pinned: !a.pinned })),
      onToggleHidden: (a: Agent) => run(() => updateAgent(a.id, { hidden: !a.hidden })),
      onToggleMuted: (a: Agent) => run(() => updateAgent(a.id, { muted: !a.muted })),
      onMarkUnread: (a: Agent) => run(() => markAgentUnread(a.id)),
      onEdit: (a: Agent) => inAgents(a.id),
      onDelete: (a: Agent) => inAgents(a.id),
      onStartFresh: (a: Agent) => run(() => startConversation(a.id)),
    }),
    [run, inAgents]
  );

  if (!agent) {
    return (
      <div className="session-agent-chat session-agent-chat--loading">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="session-agent-chat" data-testid="session-agent-chat">
      <PaneBoundary resetKey={agent.id}>
        <AgentChat
          key={agent.id}
          agent={agent}
          onOpenAgent={(id) => inAgents(id)}
          onSetUpEngine={() => inAgents()}
          onSignIn={() => inAgents()}
          onInstallEngine={() => inAgents()}
          onImport={() => inAgents()}
          {...actions}
        />
      </PaneBoundary>
    </div>
  );
}
