import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react-native';
import { Markdown } from '../src/components/Markdown';

/** The two replies from Julian's blank-bubble report, verbatim (dev/fixtures). */
const fixture = (n: number) =>
  readFileSync(join(__dirname, `../dev/fixtures/md-tables-${n}.md`), 'utf8');

describe('long replies with bold, bullets and a 4-column table', () => {
  it.each([1, 2])('draws the words of reply %i', async (n) => {
    await render(<Markdown text={fixture(n)} />);
    // Text is there (not an empty bubble), and the table's header row is drawn.
    expect(screen.getByText(/dry run|coverage count/i)).toBeTruthy();
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0);
  });
});
