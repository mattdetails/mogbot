import {
  forgetPreviews,
  keepPreview,
  keptPreview,
  previewAge,
  previewProblem,
} from '../src/lib/previewShots';

describe('the project preview kept on the phone', () => {
  it('keeps the last picture per project and device, until forgotten', () => {
    keepPreview('/p/site', 'phone', { uri: 'file:///a.png', mime: 'image/png', at: 1 });
    expect(keptPreview('/p/site', 'phone')?.uri).toBe('file:///a.png');
    expect(keptPreview('/p/site', 'desktop')).toBeUndefined();
    expect(keptPreview('/p/other', 'phone')).toBeUndefined();
    forgetPreviews();
    expect(keptPreview('/p/site', 'phone')).toBeUndefined();
  });

  it('says how old a picture is', () => {
    const t = 1_700_000_000_000;
    expect(previewAge(t, t + 10_000)).toBe('Just now');
    expect(previewAge(t, t + 3 * 60_000)).toBe('3 min ago');
    expect(previewAge(t, t + 2 * 3_600_000)).toBe('2 h ago');
    expect(previewAge(t, t + 48 * 3_600_000)).toBe('A day or more ago');
  });

  it('says what to do when the site isn’t running, and passes other sentences through', () => {
    expect(previewProblem("Open Preview on the Mac first — the site isn't running there.", 'your Mac')).toMatch(
      /isn’t running on your Mac/
    );
    expect(previewProblem('Timed out', 'your Mac')).toBe('Timed out');
    expect(previewProblem('', 'your Mac')).toMatch(/Couldn’t take the picture/);
  });
});
