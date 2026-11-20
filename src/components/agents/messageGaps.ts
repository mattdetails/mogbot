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
  const started = useRef(false);
  // After a render: every row once, then only the tail (a streaming reply, a card answered).
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const from = started.current ? Math.max(0, list.children.length - TAIL) : 0;
    started.current = list.children.length > 0;
    setGaps(list, from);
  });
  // A row added or removed (by a render or by a child's own state) changes the
  // gap of that row and the one after it, and nothing else: a microtask after
  // the change still runs before paint, and costs the same on a 4,000-row chat
  // as on ten.
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const watch = new MutationObserver((records) => {
      const touched = new Set<Element>();
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element) {
            touched.add(node);
            if (node.nextElementSibling) touched.add(node.nextElementSibling);
          }
        }
        if (record.removedNodes.length > 0) {
          let next: Node | null = record.nextSibling;
          while (next && !(next instanceof Element)) next = next.nextSibling;
          if (next) touched.add(next);
        }
      }
      for (const row of touched) {
        if (row.parentElement === list) setGap(row);
      }
    });
    watch.observe(list, { childList: true });
    return () => watch.disconnect();
  }, [ref]);
}

function setGap(row: Element): void {
  const next = gapTokens(row.previousElementSibling, row);
  if (next) {
    if (row.getAttribute('data-gap') !== next) row.setAttribute('data-gap', next);
  } else if (row.hasAttribute('data-gap')) {
    row.removeAttribute('data-gap');
  }
}

function setGaps(list: Element, from: number): void {
  const rows = list.children;
  for (let i = from; i < rows.length; i++) setGap(rows[i]);
}
