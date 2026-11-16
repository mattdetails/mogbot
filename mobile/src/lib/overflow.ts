/**
 * Whether a sideways-scrolling line still runs past the right edge: its
 * content is wider than the box it sits in, and it isn't scrolled to the end.
 * A point of slack, so rounding at the end never leaves a fade on nothing.
 */
export function moreToTheRight(content: number, view: number, x: number): boolean {
  if (!(content > 0) || !(view > 0)) return false;
  return content - view - Math.max(0, x) > 1;
}

/**
 * A table wider than the reply's column is read row by row instead: each
 * row's first cell as its title, then every other column's header beside its
 * value. On a phone a sideways scroll inside a chat that scrolls up and down
 * was easy to miss and hard to start (Julian, 2026-11-14: "I still can't
 * scroll sideways in these tables"), and a two-column table never needs it.
 */
export function stacksAt(widths: number[], available: number): boolean {
  return available > 0 && widths.length > 2 && widths.reduce((a, b) => a + b, 0) > available;
}
