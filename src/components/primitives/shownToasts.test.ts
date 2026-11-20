import { describe, expect, it } from 'vitest';
import { shownToasts } from './ToastList';
import type { Toast } from '../../hooks/useToasts';

const t = (id: number) => ({ id, message: `t${id}`, type: 'info' }) as Toast;
const ids = (list: { toast: Toast; leaving: boolean }[]) =>
  list.map((s) => `${s.toast.id}${s.leaving ? '…' : ''}`);

describe('shownToasts', () => {
  it('keeps a dismissed toast where it was while it fades', () => {
    const before = shownToasts([], [t(1), t(2), t(3)], true);
    expect(ids(shownToasts(before, [t(1), t(3)], true))).toEqual(['1', '2…', '3']);
  });

  it('drops it at once where exits cannot animate', () => {
    const before = shownToasts([], [t(1), t(2)], false);
    expect(ids(shownToasts(before, [t(2)], false))).toEqual(['2']);
  });

  it('adds new toasts in the list order', () => {
    const before = shownToasts([], [t(1)], true);
    expect(ids(shownToasts(before, [t(1), t(2)], true))).toEqual(['1', '2']);
  });
});
