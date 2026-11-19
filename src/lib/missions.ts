/**
 * Missions on the desk: the record and every rule that turns it into the page
 * live in the shared protocol package (the phone draws the same page from the
 * same rules); this adds the desk's own commands.
 *
 * @module lib/missions
 */

import { invoke } from '@tauri-apps/api/core';
import type { EngineId, Mission } from '../../packages/companion-protocol/src/missions';

export * from '../../packages/companion-protocol/src/missions';

export const MISSION_PREFIX = 'mission:';
export const missionKey = (id: string) => `${MISSION_PREFIX}${id}`;
export const missionIdOf = (key: string | null | undefined): string | null =>
  key?.startsWith(MISSION_PREFIX) ? key.slice(MISSION_PREFIX.length) : null;
export const MISSIONS_EVENT = 'agents-missions-changed';

export const getMissions = () => invoke<Mission[]>('agents_missions');
export const missionAct = (id: string, action: string, engine?: EngineId, points?: number) =>
  invoke<string>('agents_mission_act', { id, action, engine, points });
