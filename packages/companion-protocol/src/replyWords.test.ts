import { describe, expect, it } from 'vitest';
import { replyExcerptLine, replyPillText } from './replyWords';

const ref = (over: object = {}) => ({
  id: 'm1',
  name: 'you',
  excerpt: 'Export the new icon set',
  kind: 'message' as const,
  ...over,
});

describe('reply words', () => {
  it('words an attachment, file and link', () => {
    expect(replyExcerptLine('attachment', 'intros.pdf')).toBe('Attachment · intros.pdf');
    expect(replyExcerptLine('file', 'a.csv')).toBe('File · a.csv');
    expect(replyExcerptLine('link', 'example.com')).toBe('Link · example.com');
    expect(replyExcerptLine('card', 'Push release')).toBe('Push release');
  });

  it('names the quoted one only in a room or for a third party', () => {
    const parties = ['you', 'Lead Gen'];
    expect(replyPillText(ref(), { parties })).toBe('Export the new icon set');
    expect(replyPillText(ref({ name: 'Lead Gen' }), { parties })).toBe('Export the new icon set');
    expect(replyPillText(ref({ name: 'Mail', excerpt: 'Reply to Globex' }), { parties })).toBe(
      'Mail: Reply to Globex'
    );
    expect(replyPillText(ref(), { parties, room: true })).toBe('you: Export the new icon set');
  });
});
