import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Markdown } from '../src/components/Markdown';
import { stacksAt } from '../src/lib/overflow';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

const reply = `Here’s the plan:

1. **Read** the project
2. Make the change
   - on a branch

| Check | Status |
| --- | --- |
| Links | 0 broken |

\`\`\`bash
pnpm build
\`\`\``;

describe('Markdown', () => {
  it('renders lists, tables and code, and copies the code', async () => {
    await render(<Markdown text={reply} />);
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getByText('◦')).toBeTruthy(); // nested bullet
    expect(screen.getByText('0 broken')).toBeTruthy();
    expect(screen.getByText('pnpm build')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Copy code'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('pnpm build');
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('fades a code line or a table that runs past the edge, until scrolled to the end', async () => {
    const hidden = { includeHiddenElements: true };
    await render(<Markdown text={reply} />);
    for (const id of ['code-scroll', 'table-scroll']) {
      const scroll = screen.getByTestId(id);
      await fireEvent(scroll, 'layout', { nativeEvent: { layout: { width: 320, height: 60 } } });
      await fireEvent(scroll, 'contentSizeChange', 300, 60);
      expect(screen.queryByTestId(`${id}-more`, hidden)).toBeNull();
      await fireEvent(scroll, 'contentSizeChange', 700, 60);
      expect(screen.getByTestId(`${id}-more`, hidden)).toBeTruthy();
      await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 380, y: 0 } } });
      expect(screen.queryByTestId(`${id}-more`, hidden)).toBeNull();
    }
  });

  it('shows entities as characters', async () => {
    await render(<Markdown text={'Use `a < b && c > d`'} />);
    expect(screen.getByText('a < b && c > d')).toBeTruthy();
  });
});

describe('a table wider than the reply', () => {
  const wide = `| Item | Today | My pick | Size |
|---|---|---|---|
| Always allow | One tool at a time | Every read of that app | Small |
| Bold default | Steady | Bold plus one screen | Medium |`;

  it('reads row by row once measured too narrow, never sideways', async () => {
    await render(<Markdown text={wide} />);
    expect(screen.queryByTestId('table-stacked')).toBeNull();
    await fireEvent(screen.getByTestId('table-frame'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 60 } },
    });
    expect(screen.getByTestId('table-stacked')).toBeTruthy();
    expect(screen.queryByTestId('table-scroll')).toBeNull();
    expect(screen.getByText('Bold plus one screen')).toBeTruthy();
    expect(screen.getAllByText('My pick')).toHaveLength(2);
  });

  it('stacks only past the width, and never two columns', () => {
    expect(stacksAt([120, 120, 120], 400)).toBe(false);
    expect(stacksAt([200, 200, 200], 400)).toBe(true);
    expect(stacksAt([300, 300], 400)).toBe(false);
    expect(stacksAt([200, 200, 200], 0)).toBe(false);
  });
});
