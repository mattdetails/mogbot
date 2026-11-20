import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Whether this window is in macOS full screen, where the traffic lights are
 * gone and the space the sidebar's top row keeps for them stands empty.
 * Re-read on every resize (entering and leaving full screen both resize).
 * Outside the app (tests) it is always false.
 */
export function useWindowFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    const read = () => {
      void win
        .isFullscreen()
        .then((value) => {
          if (alive) setFullscreen(value);
        })
        .catch(() => undefined);
    };
    read();
    void win
      .onResized(read)
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return fullscreen;
}
