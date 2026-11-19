/**
 * Where a long path or command may wrap, and how a long path is shortened in a
 * title. A command broke anywhere, so "2026-11/final-export" came apart inside
 * its own date ("2026-1 / 1/final-export"). Now a line may break only after a
 * "/" or a "-", and never inside a number (a "-" between two digits holds).
 * Titles shorten a long path in the middle and keep both ends, which are the
 * parts a yes depends on. Shared by the desk and the phone.
 *
 * @module softBreaks
 */

const ZWSP = '​';

/** `text` with a break opportunity after each "/" and after each "-" that isn't between digits. */
export function softBreaks(text: string): string {
  return text.replace(/[/-]/g, (ch, at: number, all: string) => {
    if (ch === '-' && /\d/.test(all[at - 1] ?? '') && /\d/.test(all[at + 1] ?? '')) return ch;
    // No break at the very end, and none between two slashes ("https://").
    if (at === all.length - 1 || all[at + 1] === '/') return ch;
    return ch + ZWSP;
  });
}

/** The last `n` segments of a path: "~/ShipStudio/acme/export/icons" → "export/icons". */
export function tailSegments(path: string, n: number): string {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.slice(-n).join('/') || path;
}

/**
 * A long path with its middle left out: "~/ShipStudio/acme-site/…/final-export".
 * Short paths, and ones with too few segments to cut, are returned as they are.
 */
export function shortMiddle(path: string, max = 32): string {
  if (path.length <= max) return path;
  const parts = path.replace(/\/+$/, '').split('/');
  if (parts.length < 5) return path;
  return `${parts.slice(0, 3).join('/')}/…/${parts[parts.length - 1]}`;
}
