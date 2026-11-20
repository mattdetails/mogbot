/**
 * The spacing rhythm between the chat's rows, decided once in script.
 *
 * It used to be adjacent-sibling CSS (`a + b`), which made the browser restyle
 * every row after one that was removed or inserted: on a long chat, letting go
 * of old rows from the top cost ~290ms a step. Now each row carries
 * `data-gap`, a list of the named situations it is in ("a user row after a
 * user row"), and the stylesheet's rules for them select that attribute on the
 * row itself, at the same specificity and in the same place as the sibling
 * rules they replaced, so the cascade settles exactly as before. Writing an
 * attribute only restyles the row it is on.
 *
 * @module components/agents/messageGaps
 */

import { useLayoutEffect, useRef, type RefObject } from 'react';

const is = (el: Element, ...classes: string[]) => classes.some((c) => el.classList.contains(c));
const quiet = (el: Element) => is(el, 'agent-note', 'agent-peer', 'agent-checkin');

/** The situations `el` is in, given the row just before it ("" for the first row). */
export function gapTokens(prev: Element | null, el: Element): string {
  if (!prev) return '';
  const t = ['any'];
  const pUser = is(prev, 'agent-chat__row--user');
  const pAgent = is(prev, 'agent-chat__row--agent');
  const eUser = is(el, 'agent-chat__row--user');
  const eAgent = is(el, 'agent-chat__row--agent');
  if (pUser && eUser) t.push('uu');
  if (pAgent && eAgent) t.push('aa');
  const pQuiet = quiet(prev);
  const eQuiet = quiet(el);
  if (pQuiet || eQuiet) t.push('quiet');
  if (pQuiet && eQuiet) t.push('quiet-run');
  const pNote = is(prev, 'agent-note');
  const eNote = is(el, 'agent-note');
  const pSpeaker = is(prev, 'agent-room__speaker');
  const eSpeaker = is(el, 'agent-room__speaker');
  if ((pNote && eSpeaker) || (pSpeaker && eNote)) t.push('note-speaker');
  if (is(prev, 'agent-chat__row--connector') && eAgent) t.push('c-a');
  if (pAgent && is(el, 'agent-chat__row--connector')) t.push('a-c');
  const pCard = is(prev, 'agent-chat__row--card');
  const pActions = prev.hasAttribute('data-actions');
  if (
    pAgent &&
    !pCard &&
    pActions &&
    ((eAgent && !is(el, 'agent-chat__row--working')) || is(el, 'agent-chat__starters'))
  ) {
    t.push('after-actions');
  }
  if (pCard && prev.hasAttribute('data-failed') && pActions) t.push('after-failed');
  return t.join(' ');
}

/** Rows re-checked at the tail when the list's length hasn't changed (a streaming reply, a card answered). */
const TAIL = 8;

/**
 * Sets `data-gap` on every row of the message list, writing only what changed.
 * Same shape as `useNextLine`: a whole pass when the row count changed, only
 * the tail otherwise.
 */
export function useMessageGaps(ref: RefObject<HTMLElement | null>) {
  const count = useRef(-1);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const rows = list.children;
    const from = rows.length === count.current ? Math.max(0, rows.length - TAIL) : 0;
    count.current = rows.length;
    setGaps(list, from);
  });
  // A row that mounts on its own state (a notice, a card) arrives without this
  // component rendering; a microtask after the insert still runs before paint.
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const watch = new MutationObserver(() => {
      count.current = list.children.length;
      setGaps(list, 0);
    });
    watch.observe(list, { childList: true });
    return () => watch.disconnect();
  }, [ref]);
}

function setGaps(list: Element, from: number): void {
  const rows = list.children;
  for (let i = from; i < rows.length; i++) {
    const next = gapTokens(rows[i - 1] ?? null, rows[i]);
    if (next) {
      if (rows[i].getAttribute('data-gap') !== next) rows[i].setAttribute('data-gap', next);
    } else if (rows[i].hasAttribute('data-gap')) {
      rows[i].removeAttribute('data-gap');
    }
  }
}
