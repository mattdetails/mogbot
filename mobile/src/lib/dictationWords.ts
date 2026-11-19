import type { DictationWord } from '@shipstudio/companion-protocol';

/** What a word's row says under it: where it came from. */
export function wordDetail(w: DictationWord, comp: string): string {
  if (!w.learned) return `Added on ${comp}`;
  return w.heardAs.length
    ? `Learned from your fixes · heard as “${w.heardAs.slice(0, 2).join('”, “')}”`
    : 'Learned from your fixes';
}
