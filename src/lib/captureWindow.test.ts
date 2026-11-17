import { describe, expect, it } from 'vitest';
import { pickOurWindow } from './captureWindow';

const w = (id: number, title: string, appName: string) => ({ id, title, appName });

describe('pickOurWindow (#27)', () => {
  it('finds a project window whose title has no app name, by its app', () => {
    const list = [w(1, 'Inbox', 'Mail'), w(2, 'acme-site', 'Mogbot')];
    expect(pickOurWindow(list, { appName: 'Mogbot', title: 'acme-site' })?.id).toBe(2);
  });

  it('picks this window among several of ours, not the first', () => {
    const list = [w(1, 'Mogbot', 'Mogbot'), w(2, 'acme-site', 'Mogbot')];
    expect(pickOurWindow(list, { appName: 'Mogbot', title: 'acme-site' })?.id).toBe(2);
  });

  it('falls back to any of ours, then the old title match, then nothing', () => {
    expect(pickOurWindow([w(3, 'x', 'Mogbot')], { appName: 'Mogbot', title: null })?.id).toBe(3);
    expect(pickOurWindow([w(4, 'Mogbot dev', '')], { appName: 'Mogbot', title: null })?.id).toBe(4);
    expect(
      pickOurWindow([w(5, 'Inbox', 'Mail')], { appName: 'Mogbot', title: 'a' })
    ).toBeUndefined();
  });
});
