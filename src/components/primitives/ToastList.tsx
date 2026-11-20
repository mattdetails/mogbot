/**
 * Shared toast list — the single rendering of the app's toast notifications,
 * drawn once per window (`AppGlobalModals`).
 *
 * A toast is a Bar: one line saying what happened, its icon telling success,
 * information and failure apart without relying on hue, and at most one
 * action. Error toasts persist until dismissed (see useToasts) and carry a
 * Copy button so the full error text can be pasted into Slack or a bug
 * report instead of screenshotted. Pointing at a toast holds it.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { canAnimateExit } from '../../lib/motion';
import {
  MOTION_DURATION,
  MOTION_SPRING,
  springEasing,
} from '../../../packages/companion-protocol/src/motion';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { SuccessIcon, InfoIcon, ErrorIcon, CloseIcon, CopyIcon } from '@/components/icons';
import type { Toast } from '../../hooks/useToasts';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { MODAL_INERT_EXEMPT_ATTR } from './ModalFrame';

interface ToastListProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  /** Hold a toast's clock while the pointer is on it (`useToasts().holdToast`). */
  onHold?: (id: number, held: boolean) => void;
}

const ICON = { success: SuccessIcon, info: InfoIcon, error: ErrorIcon } as const;

function ToastItem({
  toast,
  onDismiss,
  onHold,
  leaving = false,
  onLeft,
  itemRef,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
  onHold?: (id: number, held: boolean) => void;
  /** Gone from the list: fading out before it unmounts (docs/MOTION.md). */
  leaving?: boolean;
  onLeft?: (id: number) => void;
  itemRef?: (el: HTMLDivElement | null) => void;
}) {
  // Per-toast hook so each error toast gets its own "Copied" flag.
  const { copy, isCopied } = useCopyToClipboard();
  const Icon = ICON[toast.type];
  const count = toast.count ?? 1;

  return (
    <div
      ref={itemRef}
      className={`toast toast-${toast.type}`}
      data-state={leaving ? 'closed' : 'open'}
      inert={leaving || undefined}
      aria-hidden={leaving || undefined}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) onLeft?.(toast.id);
      }}
      // A failure interrupts; anything else waits its turn.
      role={leaving ? undefined : toast.type === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => onHold?.(toast.id, true)}
      onPointerLeave={() => onHold?.(toast.id, false)}
    >
      <span className="toast-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="toast-message">
        {toast.message}
        {count > 1 && (
          <span className="toast-count" aria-label={`, ${count} times`}>
            ×{count}
          </span>
        )}
      </span>
      {toast.action && (
        <Button
          variant="ghost"
          size="compact"
          className="toast-action"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </Button>
      )}
      {toast.type === 'error' && (
        <Button
          variant="ghost"
          size="compact"
          onClick={() => void copy(toast.message)}
          title="Copy the full error text"
          leftIcon={<CopyIcon size={12} />}
        >
          {isCopied ? 'Copied' : 'Copy'}
        </Button>
      )}
      <IconButton
        variant="ghost"
        size="compact"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        icon={<CloseIcon size={14} />}
      />
    </div>
  );
}

/**
 * Toasts render into a body-level host instead of inline, because ModalFrame
 * marks every other body child `inert` while a dialog is open — inline toasts
 * would be aria-hidden and their Copy/Dismiss buttons unclickable. The host
 * opts out of that sweep; the container is `position: fixed` either way, so
 * nothing moves visually.
 */
function ensureToastRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.querySelector<HTMLElement>('[data-toast-root]');
  if (existing?.isConnected) return existing;

  const host = document.createElement('div');
  host.dataset.toastRoot = 'true';
  host.setAttribute(MODAL_INERT_EXEMPT_ATTR, '');
  document.body.appendChild(host);
  return host;
}

type Shown = { toast: Toast; leaving: boolean };

/**
 * The toasts on screen: the current ones, plus any just dismissed while they
 * fade out, each kept where it was so nothing jumps under the pointer.
 */
export function shownToasts(previous: Shown[], toasts: Toast[], animate: boolean): Shown[] {
  const next: Shown[] = toasts.map((toast) => ({ toast, leaving: false }));
  if (!animate) return next;
  const current = new Set(toasts.map((t) => t.id));
  previous.forEach((item, index) => {
    if (current.has(item.toast.id)) return;
    next.splice(Math.min(index, next.length), 0, { toast: item.toast, leaving: true });
  });
  return next;
}

export function ToastList({ toasts, onDismiss, onHold }: ToastListProps) {
  const [shown, setShown] = useState<Shown[]>(() => shownToasts([], toasts, false));
  // Before paint, so a dismissed toast never misses a frame.
  useLayoutEffect(() => {
    setShown((previous) => shownToasts(previous, toasts, canAnimateExit()));
  }, [toasts]);

  // A toast that has faded out goes; the backstop covers a missed animationend.
  const leavingIds = shown.filter((s) => s.leaving).map((s) => s.toast.id).join(' ');
  useLayoutEffect(() => {
    if (!leavingIds) return;
    const t = window.setTimeout(
      () => setShown((list) => list.filter((s) => !s.leaving)),
      MOTION_DURATION.exitQuick + 100
    );
    return () => window.clearTimeout(t);
  }, [leavingIds]);
  const left = (id: number) => setShown((list) => list.filter((s) => s.toast.id !== id));

  // The rest settle into their new places (FLIP, spring.standard), rather
  // than jumping when one above them goes.
  const els = useRef(new Map<number, HTMLDivElement>());
  const tops = useRef(new Map<number, number>());
  useLayoutEffect(() => {
    const next = new Map<number, number>();
    for (const [id, el] of els.current) next.set(id, el.getBoundingClientRect().top);
    if (canAnimateExit()) {
      for (const [id, top] of next) {
        const before = tops.current.get(id);
        const el = els.current.get(id);
        if (before === undefined || !el || Math.abs(before - top) < 1) continue;
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
          duration: MOTION_SPRING.standard.duration,
          easing: CSS.supports('transition-timing-function', 'linear(0, 1)')
            ? springEasing('standard')
            : 'cubic-bezier(0.2, 0, 0, 1)', // css-ok: --ease-move, for WAAPI
          composite: 'add',
        });
      }
    }
    tops.current = next;
  }, [shown]);

  if (shown.length === 0) return null;
  const host = ensureToastRoot();
  if (!host) return null;

  return createPortal(
    <section className="toast-container" aria-label="Notifications">
      {shown.map(({ toast, leaving }) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onHold={onHold}
          leaving={leaving}
          onLeft={left}
          itemRef={(el) => {
            if (el) els.current.set(toast.id, el);
            else els.current.delete(toast.id);
          }}
        />
      ))}
    </section>,
    host
  );
}
