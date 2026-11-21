/**
 * Paths in an agent's reply (Chat UI's file-paths shape, the phone half):
 * found in code, links and plain words, spaces allowed from `/` or `~/`;
 * each drawn as the Mac said it is.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import {
  Markdown,
  PathContext,
  PathKinds,
  PATH_MISSING,
  looksLikePath,
  pathsIn,
} from '../src/components/Markdown';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

const HOME = '~/Library/Application Support/Mogbot/agents/a1';

describe('finding paths', () => {
  it('takes the agents’ own folders, spaces and all, from / or ~/', () => {
    expect(looksLikePath(`${HOME}/shots/after-dark.png`)).toBe(true);
    expect(looksLikePath('/Users/sam/Desktop/Projects/site/Hero copy.tsx')).toBe(true);
    // Not from a root: still no spaces, still not a command or a URL.
    expect(looksLikePath('a b.md')).toBe(false);
    expect(looksLikePath('/bin/ls -la')).toBe(false);
    expect(looksLikePath('https://x.y/a.png')).toBe(false);
  });

  it('lists every path a reply names: in code, in links and in plain words', () => {
    const text = [
      `The shot is \`${HOME}/shots/after.png\`.`,
      'Notes in [the brief](~/notes/brief.md), log at ~/Library/Logs/x.log.',
      'Run `npm run build` and see https://example.com/a.png.',
    ].join('\n\n');
    expect(pathsIn(text).sort()).toEqual(
      [`${HOME}/shots/after.png`, '~/notes/brief.md', '~/Library/Logs/x.log'].sort()
    );
  });
});

describe('drawing them', () => {
  const opened: string[] = [];
  const wrap = (kinds: Map<string, 'image' | 'file' | 'folder' | 'missing' | 'outside'>) =>
    function Wrap({ children }: { children: ReactNode }) {
      return (
        <PathContext.Provider value={(p) => opened.push(p)}>
          <PathKinds.Provider value={kinds}>{children}</PathKinds.Provider>
        </PathContext.Provider>
      );
    };

  it('every path is one chip: a file is a link; a missing one is the chip, muted, with no suffix; outside is the chip, not a link', async () => {
    const kinds = new Map([
      ['~/a/report.pdf', 'file' as const],
      ['~/a/gone.pdf', 'missing' as const],
      ['/etc/secret.txt', 'outside' as const],
    ]);
    await render(
      <Markdown text={'Open `~/a/report.pdf`, `~/a/gone.pdf` and `/etc/secret.txt`.'} />,
      { wrapper: wrap(kinds) }
    );
    // Only the file opens.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: '~/a/report.pdf' })).toBeTruthy();
    // The missing one says so in its label, and has no "(Not found…)" text beside it.
    expect(screen.getByLabelText(`~/a/gone.pdf, ${PATH_MISSING.toLowerCase()}`)).toBeTruthy();
    expect(screen.queryByText(` (${PATH_MISSING})`)).toBeNull();
    expect(screen.queryByText(PATH_MISSING)).toBeNull();
    // Outside is still shown, as text.
    expect(screen.getByText('/etc/secret.txt')).toBeTruthy();
  });

  it('with no answer from the Mac (an older one), every path is a link, as before', async () => {
    await render(<Markdown text={'See `~/a/report.pdf` and `~/a/gone.pdf`.'} />, {
      wrapper: wrap(new Map()),
    });
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
