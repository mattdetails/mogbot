/**
 * The routines cap, on an agent's Usage tab: "pause its routines once it has
 * used 2M tokens this week", so unattended work can't quietly eat the week's
 * limit. In tokens as the engines report them (never a percent of a limit or
 * a dollar figure: no engine reports either per agent). Applies at once, as
 * the Chief's `update_agent` `routine_cap` does; off by default.
 *
 * @module components/agents/AgentRoutineCap
 */

import { useState } from 'react';
import { Group, Row } from './AgentSettingsRows';
import { MenuRow } from './AgentEditorParts';
import { getAgentUsage, updateAgent, type Agent, type RoutineCapStatus } from '../../lib/agents';
import { refreshAgents } from '../../lib/agentsStore';
import { ROUTINE_CAP_NOTE, routineCapChoices, routineCapLine } from '../../lib/routineCap';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { useOptionalToast } from '../../contexts/ToastContext';

export function AgentRoutineCap({
  agent,
  status: initial,
}: {
  agent: Agent;
  /** Where it stands this week, from `agents_usage`. */
  status?: RoutineCapStatus;
}) {
  const { showToast } = useOptionalToast();
  const [cap, setCap] = useState<number>(agent.routineCap?.tokens ?? 0);
  const [status, setStatus] = useState<RoutineCapStatus | undefined>(initial);
  const choices = routineCapChoices(cap || undefined);
  const pick = async (value: string) => {
    const next = Number(value);
    if (next === cap) return;
    const before = cap;
    setCap(next);
    try {
      await updateAgent(agent.id, { routineCap: next });
      const usage = await getAgentUsage(agent.id).catch(() => null);
      setStatus(usage?.routineCap);
      await refreshAgents();
    } catch (error) {
      setCap(before);
      showToast(formatCommandError(asCommandError(error)), 'error');
    }
  };
  const shown = cap > 0 ? status : undefined;
  return (
    <Group id="agent-routine-cap" title="Routines cap" footnote={ROUTINE_CAP_NOTE}>
      <MenuRow
        label="Pause its routines after"
        value={String(cap)}
        choices={choices}
        onChange={(v) => void pick(v)}
      />
      {shown && (
        <Row label="This week">
          <span className="agent-sheet__value agent-sheet__value--wrap">
            {routineCapLine(shown)}
          </span>
        </Row>
      )}
    </Group>
  );
}
