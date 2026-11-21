import {
  SWIPE_ARM,
  SWIPE_MAX,
  replyRefFor,
  SCROLL_QUIET_MS,
  SWIPE_START,
  swipeArmed,
  swipeDecision,
  swipeIsHorizontal,
  swipeOffset,
} from '../src/lib/reply';
import { messageActions } from '../src/lib/actions';

const msg = (over: object = {}) => ({
  id: 'm1',
  kind: 'agent' as const,
  text: 'Exported 24 icons.',
  ...over,
});

describe('swipe to reply', () => {
  it('follows the finger on a rubber band that never passes 72', () => {
    expect(swipeOffset(-20)).toBe(0);
    expect(swipeOffset(0)).toBe(0);
    expect(swipeOffset(30)).toBeGreaterThan(20);
    expect(swipeOffset(30)).toBeLessThan(swipeOffset(60));
    expect(swipeOffset(10_000)).toBeLessThanOrEqual(SWIPE_MAX);
  });

  it('arms at 48 and takes a longer pull to get there than 48', () => {
    expect(swipeArmed(SWIPE_ARM - 1)).toBe(false);
    expect(swipeArmed(SWIPE_ARM)).toBe(true);
    expect(swipeArmed(swipeOffset(40))).toBe(false);
    expect(swipeArmed(swipeOffset(90))).toBe(true);
  });

  it('counts only mostly sideways moves (under 25 degrees)', () => {
    expect(swipeIsHorizontal(60, 10)).toBe(true);
    expect(swipeIsHorizontal(60, 30)).toBe(false);
    expect(swipeIsHorizontal(0, 40)).toBe(false);
  });
});

describe('what a reply quotes', () => {
  it('is you for your own message, the agent otherwise', () => {
    expect(replyRefFor(msg({ kind: 'user' }), 'Designer')).toMatchObject({ name: 'you' });
    expect(replyRefFor(msg(), 'Designer')).toMatchObject({ name: 'Designer', kind: 'message' });
  });

  it('takes a card’s title, an attachment’s name, else the first words cut on a word', () => {
    expect(
      replyRefFor(msg({ approval: { title: 'Push release to origin' } }), 'Ops')
    ).toMatchObject({ kind: 'card', excerpt: 'Push release to origin' });
    expect(
      replyRefFor(
        msg({ text: '', attachments: [{ name: 'icons.png', mime: 'image/png' }] }),
        'Designer'
      )
    ).toMatchObject({ kind: 'attachment', excerpt: 'icons.png' });
    const long = replyRefFor(msg({ text: 'word '.repeat(80) }), 'Designer');
    expect(long?.excerpt.length).toBeLessThanOrEqual(201);
    expect(long?.excerpt.endsWith('…')).toBe(true);
  });

  it('has nothing to quote for a divider or an empty line', () => {
    expect(replyRefFor(msg({ kind: 'note' }), 'Designer')).toBeNull();
    expect(replyRefFor(msg({ text: '' }), 'Designer')).toBeNull();
  });
});

describe('Reply in the menu and the draft', () => {
  it('comes first when the Mac takes replies, and is absent otherwise', () => {
    expect(messageActions(msg(), false, false, true)[0].id).toBe('reply');
    expect(messageActions(msg())[0].id).toBe('copy');
  });
});

describe('a swipe is never a scroll (Julian, 20 Nov: scrolling kept starting replies)', () => {
  const calm = 10_000;
  it('never swipes while the chat scrolls or just after', () => {
    expect(swipeDecision(40, 0, 0)).toBe('fail');
    expect(swipeDecision(40, 0, SCROLL_QUIET_MS - 1)).toBe('fail');
    expect(swipeDecision(40, 0, SCROLL_QUIET_MS)).toBe('go');
  });
  it('waits until the finger is well to the right', () => {
    expect(swipeDecision(12, 0, calm)).toBe('wait');
    expect(swipeDecision(SWIPE_START - 1, 2, calm)).toBe('wait');
    expect(swipeDecision(SWIPE_START, 2, calm)).toBe('go');
  });
  it('hands a thumb arc to the list', () => {
    // A scroll that drifts 14 sideways while moving 11 down: the old 12/5.6 rule's case, now the list's.
    expect(swipeDecision(14, 11, calm)).toBe('fail');
    expect(swipeDecision(30, -11, calm)).toBe('fail');
    // Sideways enough but steeper than 20 degrees.
    expect(swipeDecision(26, 10, calm)).toBe('fail');
    expect(swipeDecision(-9, 0, calm)).toBe('fail');
  });
});
