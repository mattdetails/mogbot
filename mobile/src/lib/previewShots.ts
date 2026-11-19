/**
 * The project preview on the phone: the last picture taken of a project's
 * site, kept for the session so coming back to the Projects tab shows it at
 * once, and re-taken only when asked. Pure apart from the clock.
 */

export type PreviewDevice = 'phone' | 'desktop';

export interface PreviewShot {
  uri: string;
  mime: string;
  /** When the Mac took it. */
  at: number;
}

const kept = new Map<string, PreviewShot>();
const keyOf = (project: string, device: PreviewDevice) => `${project}\n${device}`;

export const keptPreview = (project: string, device: PreviewDevice): PreviewShot | undefined =>
  kept.get(keyOf(project, device));

export function keepPreview(project: string, device: PreviewDevice, shot: PreviewShot) {
  kept.set(keyOf(project, device), shot);
}

/** Nothing kept: another Mac, or the phone was unpaired. */
export const forgetPreviews = () => kept.clear();

/**
 * What the picture's age says: "Just now", "3 min ago", then the hour. A
 * picture is of the site as it was; saying how old it is keeps it honest.
 */
export function previewAge(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'Just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : 'A day or more ago';
}

/**
 * The words for a preview that couldn't be taken, in the phone's terms: the
 * Mac's own sentence when it has one about the site, else what to do.
 */
export function previewProblem(message: string, computer: string): string {
  const m = message.trim();
  if (/isn.t running|not running|no dev server|no preview/i.test(m))
    return `The site isn’t running on ${computer}. Open the project there and start its preview, then try again.`;
  return m || `Couldn’t take the picture. Check ${computer} is awake with the app open, then try again.`;
}
