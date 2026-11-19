import { cardTitle } from '@shipstudio/companion-protocol';

describe('a card’s title on the phone', () => {
  const cp = 'cp -r export/icons ~/ShipStudio/acme-site/public/assets/brand/icons/2026-11';
  it('names where a copy goes, even under the Mac’s general title', () => {
    expect(
      cardTitle({
        title: 'Write files outside its folder',
        tool: 'Bash',
        detail: cp,
        input: { command: cp },
      })
    ).toBe(`Copy export/icons to acme-site/…/2026-11`);
  });
  it('names a delete, and keeps the Mac’s title for what it doesn’t name', () => {
    expect(
      cardTitle({ title: 'Run a command', tool: 'Bash', detail: 'rm -r ~/Exports/2024', input: {} })
    ).toBe('Delete ~/Exports/2024');
    expect(cardTitle({ title: 'Allow Gmail', tool: 'mcp__gmail', detail: 'x', input: {} })).toBe(
      'Allow Gmail'
    );
  });
});
