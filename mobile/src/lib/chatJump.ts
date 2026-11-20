/**
 * The header sheet's Review: the sheet closes and the chat under it scrolls
 * to the first card waiting on you. The chat is still mounted under the
 * sheet, so a listener per open chat is all it takes.
 */

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

/** The chat for `agentId` scrolls to its first waiting card, if it's open. */
export function jumpToFirstCard(agentId: string): void {
  for (const l of listeners.get(agentId) ?? []) l();
}

/** An open chat listens; returns the unsubscribe. */
export function onJumpToFirstCard(agentId: string, l: Listener): () => void {
  const set = listeners.get(agentId) ?? new Set<Listener>();
  set.add(l);
  listeners.set(agentId, set);
  return () => {
    set.delete(l);
    if (set.size === 0) listeners.delete(agentId);
  };
}
