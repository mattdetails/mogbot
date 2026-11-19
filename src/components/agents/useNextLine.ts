/**
 * Each line of a chat says what follows it: `data-next="card"` or
 * `"working"`, the two the line's margin depends on (agents-chat-history.css).
 *
 * That used to be `:has(+ .agent-chat__row--card)` in the stylesheet. The
 * browser answers a sibling `:has()` by restyling the lines around every
 * change, so a reply streaming into a 2,000-line chat restyled ~300
 * elements per draft (11% of the main thread); this writes the attribute
 * only when it differs, and a streamed word changes none.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';

const NEXT = [
  ['agent-chat__row--card', 'card'],
  ['agent-chat__row--working', 'working'],
] as const;

function nextOf(el: Element | null): string | null {
  if (!el) return null;
  for (const [cls, name] of NEXT) if (el.classList.contains(cls)) return name;
  return null;
}

/** How many of the newest lines are rechecked when no line came or went. */
const TAIL = 12;

/**
 * Sets `data-next` under `ref`; runs after each render, writing only changes.
 * Every line is read when the number of lines changed (a line arrived, older
 * ones paged in, a card appeared); otherwise only the newest few, where a
 * working line or a card answered comes and goes, so a streamed word doesn't
 * walk 2,000 lines.
 */
export function useNextLine(ref: RefObject<HTMLElement | null>) {
  const count = useRef(-1);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const lines = list.children;
    const from = lines.length === count.current ? Math.max(0, lines.length - TAIL) : 0;
    count.current = lines.length;
    for (let i = from; i < lines.length; i++) {
      const next = nextOf(lines[i + 1] ?? null);
      const now = lines[i].getAttribute('data-next');
      if (next !== now) {
        if (next) lines[i].setAttribute('data-next', next);
        else lines[i].removeAttribute('data-next');
      }
    }
  });
}
