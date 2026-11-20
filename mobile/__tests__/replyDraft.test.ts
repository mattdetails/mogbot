import { clearComposer, putDraft } from '../src/lib/drafts';
import { getApp, setApp } from '../src/lib/store';

describe('a reply in the draft', () => {
  it('keeps a draft that only holds a reply, and drops it once cleared', () => {
    const ref = { id: 'm1', name: 'you', excerpt: 'Hi', kind: 'message' as const };
    const drafts = putDraft({}, 'a1', { replying: ref });
    expect(drafts.a1?.replying).toEqual(ref);
    expect(putDraft(drafts, 'a1', { replying: undefined }).a1).toBeUndefined();
  });

  it('is cleared with the rest of the draft when it is sent', () => {
    const ref = { id: 'm1', name: 'you', excerpt: 'Hi', kind: 'message' as const };
    setApp({ composer: putDraft({}, 'a1', { text: 'hello', replying: ref }) });
    clearComposer('a1');
    expect(getApp().composer.a1).toBeUndefined();
  });
});
