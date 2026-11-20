/**
 * The user's bubble in an agent's chat takes that agent's key colour, and its
 * text takes whichever of white and near-black reads better on it. One
 * function for desk and phone, so the two never disagree.
 */

export const BUBBLE_INK_LIGHT = '#ffffff';
export const BUBBLE_INK_DARK = '#151413';
/** WCAG AA for body text. */
export const BUBBLE_MIN_CONTRAST = 4.5;

function rgbOf(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const f = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = parseInt(f.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const hexOf = (c: [number, number, number]) =>
  '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function mix(hex: string, toward: string, t: number): string {
  const a = rgbOf(hex);
  const b = rgbOf(toward);
  return hexOf([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as [number, number, number]);
}

/**
 * The fill and text of the user's bubble for an agent's key colour. The text
 * is the higher-contrast of white and near-black against the fill. A colour
 * where neither reaches 4.5:1 (a mid tone) is moved toward the winning ink's
 * opposite until one does, so the fill stays the key's own hue.
 */
export function bubbleColors(face: string): { fill: string; ink: string; ratio: number } {
  let fill = face;
  const best = (f: string) => {
    const w = contrastRatio(f, BUBBLE_INK_LIGHT);
    const d = contrastRatio(f, BUBBLE_INK_DARK);
    return w >= d ? { ink: BUBBLE_INK_LIGHT, ratio: w } : { ink: BUBBLE_INK_DARK, ratio: d };
  };
  let pick = best(fill);
  if (pick.ratio < BUBBLE_MIN_CONTRAST) {
    const toward = pick.ink === BUBBLE_INK_LIGHT ? '#000000' : '#ffffff';
    for (let t = 0.04; t <= 1 && pick.ratio < BUBBLE_MIN_CONTRAST; t += 0.04) {
      fill = mix(face, toward, t);
      pick = best(fill);
    }
  }
  return { fill, ink: pick.ink, ratio: pick.ratio };
}
