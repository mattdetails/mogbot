import { wordDetail } from '../src/lib/dictationWords';

describe('a dictation word’s line', () => {
  it('says where a word came from', () => {
    expect(wordDetail({ word: 'Mogbot', learned: false, heardAs: [] }, 'your Mac')).toBe(
      'Added on your Mac'
    );
    expect(
      wordDetail({ word: 'Tailscale', learned: true, heardAs: ['tail scale', 'tailscales', 'x'] }, 'your Mac')
    ).toBe('Learned from your fixes · heard as “tail scale”, “tailscales”');
    expect(wordDetail({ word: 'Bradford', learned: true, heardAs: [] }, 'your Mac')).toBe(
      'Learned from your fixes'
    );
  });
});
