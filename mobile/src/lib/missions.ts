/**
 * Missions on the phone: the Mac's records (`agents.missions`), read every
 * half minute while the screen is in front, and the user's own calls on one
 * (`agents.missions.act`). The page's rules are the shared ones in the
 * protocol package, so the phone says what the desk says.
 */

import type { Mission } from '@shipstudio/companion-protocol';
import { useCallback, useState } from 'react';
import { call, canCall, describeError, lastRead } from './session';
import { usePolling } from './usePolling';

/** Whether this Mac serves missions at all (newer Macs only). */
export const servesMissions = () => canCall('agents.missions');

export function useMissions(): { missions: Mission[] | null; read: () => Promise<void> } {
  const [missions, setMissions] = useState<Mission[] | null>(
    () => (servesMissions() && lastRead('agents.missions', {})) || null
  );
  const read = useCallback(async () => {
    if (!servesMissions()) return;
    try {
      setMissions(await call('agents.missions', {}));
    } catch {
      // Unanswered: keep what was last read.
    }
  }, []);
  usePolling(read, 30_000);
  return { missions, read };
}

export type MissionCall = 'pause' | 'resume' | 'stop' | 'add_more' | 'accept';

/** The user's call; the error is their words, never the wire's. */
export async function missionCall(
  id: string,
  action: MissionCall,
  engine?: Mission['shares'][number]['engine']
): Promise<string | null> {
  try {
    await call('agents.missions.act', {
      id,
      action,
      engine,
      points: action === 'add_more' ? 10 : undefined,
    });
    return null;
  } catch (e) {
    return describeError(e);
  }
}
