/**
 * Which capturable window is ours (issue #27). Matching only on a title
 * holding the app's name missed project windows titled otherwise and, with
 * several windows open, could pick another of ours; that read as "Screen
 * Recording denied" when it was allowed. Ours is the one whose app is this
 * app and whose title is this window's own; then any of this app's; the
 * old title match last.
 */
export interface CapturableWindow {
  id: number;
  title?: string;
  appName?: string;
}

export function pickOurWindow<W extends CapturableWindow>(
  windows: W[],
  ours: { appName: string; title: string | null }
): W | undefined {
  const app = ours.appName.toLowerCase();
  const isOurs = (w: W) => (w.appName ?? '').toLowerCase() === app;
  const title = ours.title?.trim();
  return (
    (title ? windows.find((w) => isOurs(w) && w.title === title) : undefined) ??
    (title ? windows.find((w) => w.title === title) : undefined) ??
    windows.find(isOurs) ??
    windows.find(
      (w) =>
        (w.title ?? '').toLowerCase().includes(app) ||
        (w.title ?? '').toLowerCase().includes('tauri')
    )
  );
}
