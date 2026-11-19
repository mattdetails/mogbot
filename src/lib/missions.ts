/**
 * Missions on the desk: the record and every rule that turns it into the page
 * live in the shared protocol package (the phone draws the same page from the
 * same rules); this adds the desk's own commands.
 *
 * @module lib/missions
 */

import { invoke } from '@tauri-apps/api/core';
import type { EngineId, Mission, MissionDraft } from '../../packages/companion-protocol/src/missions';

export * from '../../packages/companion-protocol/src/missions';

export const MISSION_PREFIX = 'mission:';
export const missionKey = (id: string) => `${MISSION_PREFIX}${id}`;
export const missionIdOf = (key: string | null | undefined): string | null =>
  key?.startsWith(MISSION_PREFIX) ? key.slice(MISSION_PREFIX.length) : null;
export const MISSIONS_EVENT = 'agents-missions-changed';

export const getMissions = () => invoke<Mission[]>('agents_missions');
export const missionAct = (id: string, action: string, engine?: EngineId, points?: number) =>
  invoke<string>('agents_mission_act', { id, action, engine, points });

/**
 * "Start a mission…" (⌘K): the set-up screen lives on What's in flight, which
 * may not be mounted yet, so the request waits here until it takes it.
 */
let setupRequested = false;
const SETUP_EVENT = 'agents-mission-setup-request';
export function requestMissionSetup(): void {
  setupRequested = true;
  window.dispatchEvent(new Event(SETUP_EVENT));
}
export function takeMissionSetupRequest(): boolean {
  const was = setupRequested;
  setupRequested = false;
  return was;
}
export const MISSION_SETUP_EVENT = SETUP_EVENT;

/** The set-up screen's save or start (`agents_mission_setup`): the mission's id. */
export const missionSetup = (action: 'save' | 'start', draft: MissionDraft) =>
  invoke<string>('agents_mission_setup', { action, draft });
