import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Julian's blank grey bubble (19 Nov): an agent reply with a 4-column table drew
 * as a screen-tall empty bubble. The bubble was capped in points only
 * (`maxWidth: 560`), so on a phone nothing bound it; the table inside grew it past the
 * screen, measured its own bubble as the room it had, and never stacked. The cap
 * must be a percentage of the column (a tablet's pixel cap is applied only when the
 * screen is wider). Yoga does this on the phone and not in a jest render, so the
 * style is what's held. The two layouts were compared in Yoga 3.1 (a 402pt screen, 16pt
 * margins, a 620pt table inside): `maxWidth: 560` gave a 560pt bubble, 190pt past the 370pt
 * column; `maxWidth: 100%` gave 370.
 */
describe('an agent’s bubble is bound by its column', () => {
  const src = readFileSync(join(__dirname, '../src/components/chat.tsx'), 'utf8');
  const block = src.slice(src.indexOf('agentBubble: {'), src.indexOf('agentBubble: {') + 600);

  it('caps at 100% of the column, not at a pixel width alone', () => {
    expect(block).toContain("maxWidth: '100%'");
    expect(block).not.toMatch(/maxWidth:\s*composer\.replyMax/);
  });

  it('applies the 560 cap only on a screen wider than it', () => {
    expect(src).toMatch(/wide && \{ maxWidth: composer\.replyMax \}/);
    expect(src).toMatch(/useWindowDimensions\(\)\.width > composer\.replyMax/);
  });
});
