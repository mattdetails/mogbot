/**
 * What a project's Session panel shows when no agent works there yet: "Who
 * should work on <project>?" Picking an agent opens its chat here, working
 * on this project (an agent can work on several, a conversation per
 * project). "Use a terminal" asks which one (Claude Code, Codex, OpenCode or
 * a plain terminal), with "Open <project> this way next time".
 *
 * @module components/workspace/ProjectAgentPicker
 */

import { useState, type ReactNode } from 'react';
import { AgentKey } from '../agents/AgentKey';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { TextButton } from '../primitives/TextButton';
import {
  ArrowLeftIcon,
  ClaudeIcon,
  CodexIcon,
  OpencodeIcon,
  PlusIcon,
  TerminalIcon,
  ChevronRightIcon,
} from '@/components/icons';
import { useAgentsList } from '../../lib/agentsStore';
import { agentProjects, worksIn } from '../../lib/projectOpens';
import type { Agent } from '../../lib/agents';

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** The terminals offered, in order. Ids are `lib/agent`'s tab ids. */
const TERMINALS: { id: string; name: string; line: string; icon: ReactNode }[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    line: 'Anthropic’s coding agent',
    icon: <ClaudeIcon size={16} />,
  },
  { id: 'codex', name: 'Codex', line: 'OpenAI’s coding agent', icon: <CodexIcon size={16} /> },
  {
    id: 'opencode',
    name: 'OpenCode',
    line: 'Open source, any model',
    icon: <OpencodeIcon size={16} />,
  },
  {
    id: 'terminal',
    name: 'Plain terminal',
    line: 'Just a shell',
    icon: <TerminalIcon size={16} />,
  },
];

/** "Works here", "Also on acme-site", or its role. */
function whereLine(agent: Agent, projectPath: string): string {
  if (worksIn(agent, projectPath)) return 'Works here';
  const others = agentProjects(agent);
  if (others.length === 1) return `Also on ${folderName(others[0])}`;
  if (others.length > 1) return `Also on ${others.length} projects`;
  return agent.role;
}

export function ProjectAgentPicker({
  projectPath,
  projectName,
  onPickAgent,
  onPickTerminal,
  onNewAgent,
}: {
  projectPath: string;
  projectName?: string;
  onPickAgent: (agentId: string) => void;
  /** A terminal, and whether to open the project this way next time. */
  onPickTerminal: (engine: string, remember: boolean) => void;
  /** Make a new agent (in Agents); absent, not offered. */
  onNewAgent?: () => void;
}) {
  const agents = useAgentsList();
  const [step, setStep] = useState<'agent' | 'terminal'>('agent');
  const [remember, setRemember] = useState(false);
  const name = projectName || folderName(projectPath);
  const team = agents
    .filter((a) => !a.isMain && !a.hidden)
    .sort((a, b) => Number(worksIn(b, projectPath)) - Number(worksIn(a, projectPath)));

  if (step === 'terminal') {
    return (
      <div className="project-pick" data-testid="project-pick-terminal">
        <div className="project-pick__bar" data-dockable-drag-handle>
          <TextButton onClick={() => setStep('agent')} aria-label="Back">
            <ArrowLeftIcon size={12} /> Back
          </TextButton>
        </div>
        <div className="project-pick__body">
          <h2 className="project-pick__title">Which terminal?</h2>
          <p className="project-pick__line">It opens in {name}, where you type the commands.</p>
          <div className="project-pick__list" role="list">
            {TERMINALS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="listitem"
                className="project-pick__row"
                onClick={() => onPickTerminal(t.id, remember)}
              >
                <span className="project-pick__tile" aria-hidden>
                  {t.icon}
                </span>
                <span className="project-pick__text">
                  <span className="project-pick__name">{t.name}</span>
                  <span className="project-pick__meta">{t.line}</span>
                </span>
                <ChevronRightIcon size={12} className="project-pick__chevron" />
              </button>
            ))}
          </div>
          <label className="project-pick__remember">
            <Checkbox
              checked={remember}
              onChange={setRemember}
              label={`Open ${name} this way next time`}
            />
            <span>Open {name} this way next time</span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="project-pick" data-testid="project-pick-agent">
      <div className="project-pick__bar" data-dockable-drag-handle />
      <div className="project-pick__body">
        <h2 className="project-pick__title">Who should work on {name}?</h2>
        <p className="project-pick__line">
          Chat with an agent here. It works in its own copy of {name}, and an agent can work on
          several projects.
        </p>
        <div className="project-pick__list" role="list">
          {team.map((a) => (
            <button
              key={a.id}
              type="button"
              role="listitem"
              className="project-pick__row"
              onClick={() => onPickAgent(a.id)}
            >
              <AgentKey id={a.id} name={a.name} role={a.role} color={a.color} size="sm" />
              <span className="project-pick__text">
                <span className="project-pick__name">{a.name}</span>
                <span className="project-pick__meta">{whereLine(a, projectPath)}</span>
              </span>
              <ChevronRightIcon size={12} className="project-pick__chevron" />
            </button>
          ))}
          {onNewAgent && (
            <button
              type="button"
              role="listitem"
              className="project-pick__row project-pick__row--new"
              onClick={onNewAgent}
            >
              <span className="project-pick__tile" aria-hidden>
                <PlusIcon size={14} />
              </span>
              <span className="project-pick__text">
                <span className="project-pick__name">New agent for this project</span>
              </span>
            </button>
          )}
        </div>
        <div className="project-pick__foot">
          <span>Rather type commands yourself?</span>
          <Button variant="secondary" size="compact" onClick={() => setStep('terminal')}>
            Use a terminal
          </Button>
        </div>
      </div>
    </div>
  );
}
