/**
 * Side by side (lib/sideBySide): Agents on the left, the project side on the
 * right, with a divider between them that drags (double-click puts it back
 * in the middle, the arrow keys move it). Each half is a whole view in its
 * own box, so the two keep their own sidebars and scroll on their own.
 *
 * @module components/SideBySideLayout
 */

import { useCallback, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { AreaBoundary } from './primitives/AreaBoundary';
import { DEFAULT_SHARE, getSideBySide, setSideBySideShare, useSideBySide } from '../lib/sideBySide';

const KEY_STEP = 0.02;

export function SideBySideLayout({ left, right }: { left: ReactNode; right: ReactNode }) {
  const { share } = useSideBySide();
  const box = useRef<HTMLDivElement>(null);

  const shareAt = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return getSideBySide().share;
    return (clientX - rect.left) / rect.width;
  };

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('side-by-side--dragging');
    const move = (e: PointerEvent) => setSideBySideShare(shareAt(e.clientX), false);
    const up = (e: PointerEvent) => {
      setSideBySideShare(shareAt(e.clientX), true);
      document.body.classList.remove('side-by-side--dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') setSideBySideShare(share - KEY_STEP);
    else if (event.key === 'ArrowRight') setSideBySideShare(share + KEY_STEP);
    else if (event.key === 'Home' || event.key === 'Enter') setSideBySideShare(DEFAULT_SHARE);
    else return;
    event.preventDefault();
  };

  const percent = Math.round(share * 100);
  return (
    <div
      ref={box}
      className="side-by-side"
      style={{ '--side-by-side-share': `${share * 100}%` } as CSSProperties}
    >
      <div className="side-by-side__pane side-by-side__pane--agents">
        <AreaBoundary where="side-by-side:agents">{left}</AreaBoundary>
      </div>
      <div
        className="side-by-side__divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Agents and Projects"
        aria-valuemin={25}
        aria-valuemax={75}
        aria-valuenow={percent}
        tabIndex={0}
        title="Drag to resize. Double-click for half and half."
        onPointerDown={onPointerDown}
        onDoubleClick={() => setSideBySideShare(DEFAULT_SHARE)}
        onKeyDown={onKeyDown}
      />
      <div className="side-by-side__pane side-by-side__pane--projects">
        <AreaBoundary where="side-by-side:projects">{right}</AreaBoundary>
      </div>
    </div>
  );
}
