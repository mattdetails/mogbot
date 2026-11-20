import type { AgentTasks } from '@shipstudio/companion-protocol';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useLinkLive } from './linkLive';
import { call } from './session';
import { useServed } from './store';

/**
 * One agent's task list (`agents.tasks`), read when it's wanted and again when
 * the agent's state moves or the app comes forward. `undefined` until the Mac
 * answers; the last list is kept while it can't be reached (`at` says from when).
 * A Mac that doesn't serve it never shows anything.
 */
export function useAgentTasks(
  agentId: string,
  /** Changes when the agent's work does (its status), so the list is read again. */
  refreshKey?: string | number
): { tasks: AgentTasks | undefined; at: number | null; failed: boolean; reload: () => void } {
  const canRead = useServed('agents.tasks');
  const connected = useLinkLive();
  const [tasks, setTasks] = useState<AgentTasks | undefined>(undefined);
  const [at, setAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(() => {
    if (!canRead || !connected) return;
    call('agents.tasks', { agentId }).then(
      (r) => {
        setTasks(r);
        setAt(Date.now());
        setFailed(false);
      },
      () => setFailed(true)
    );
  }, [canRead, connected, agentId]);

  useEffect(() => {
    read();
  }, [read, refreshKey]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && read());
    return () => sub.remove();
  }, [read]);

  return {
    tasks: canRead ? tasks : undefined,
    at,
    failed: failed || (canRead && !connected && tasks !== undefined),
    reload: read,
  };
}
