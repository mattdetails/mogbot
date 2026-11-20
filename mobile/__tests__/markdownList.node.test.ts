import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A list item's body must not use `flex: 1` (flex-basis 0): in React Native's
 * layout a bubble that shrinks to its content then gives the text zero width,
 * and a reply that is only a list shows numbers and bullets with no words
 * (Julian's iPhone, 19 Nov 2026). The two layouts were compared in Yoga 3.1:
 * `flex: 1` gave a 50 pt bubble and a 0 pt body; grow 1 / shrink 1 / basis auto
 * gave 300 and 250. Layout can't run in jest, so this holds the style.
 */
describe('a list item’s body', () => {
  it('has a natural width: grows and shrinks, never flex-basis 0', () => {
    const src = readFileSync(join(__dirname, '../src/components/Markdown.tsx'), 'utf8');
    const line = src.split('\n').find((l) => /^\s*itemBody:/.test(l)) ?? '';
    expect(line).toMatch(/flexGrow: 1/);
    expect(line).toMatch(/flexShrink: 1/);
    expect(line).not.toMatch(/flex: 1/);
  });
});
