import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { useRef } from 'react';
import { Prose } from './AgentProse';
import { PATH_MISSING, PATH_MISSING_NOTE, ProseImages, useProsePaths } from './useProsePaths';

function Reply({ agentId, text }: { agentId: string; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const images = useProsePaths(agentId, ref, text);
  return (
    <>
      <div ref={ref} className="agent-markdown">
        <Prose text={text} />
      </div>
      <ProseImages agentId={agentId} images={images} />
    </>
  );
}

const KINDS: Record<string, string> = {
  '~/ShipStudio/acme/shot.png': 'image',
  '~/ShipStudio/acme/notes.md': 'file',
  '/Users/sam/Downloads/secret.pdf': 'outside',
  '~/ShipStudio/acme/gone.png': 'missing',
};

afterEach(() => {
  cleanup();
  clearMocks();
});

describe('useProsePaths', () => {
  it('draws images, keeps files as links, mutes missing ones and unlinks outside ones', async () => {
    const asked: string[][] = [];
    mockIPC((cmd, args) => {
      if (cmd !== 'agents_check_paths') return null;
      const paths = (args as { paths: string[] }).paths;
      asked.push(paths);
      return paths.map((path) => ({
        path,
        kind: KINDS[path] ?? 'outside',
        ...(KINDS[path] === 'image' ? { full: '/abs/shot.png' } : {}),
      }));
    });
    const text = `See ~/ShipStudio/acme/shot.png, ~/ShipStudio/acme/notes.md, /Users/sam/Downloads/secret.pdf and ~/ShipStudio/acme/gone.png.`;
    const { container } = render(<Reply agentId="a1" text={text} />);
    await waitFor(() => expect(container.querySelector('.agent-prose-images img')).not.toBeNull());
    const link = (kind: string) =>
      container.querySelector<HTMLAnchorElement>(`a[data-path="${kind}"]`);
    expect(link('image')?.getAttribute('href')).toBeTruthy();
    expect(link('file')?.getAttribute('href')).toBeTruthy();
    expect(link('outside')?.hasAttribute('href')).toBe(false);
    expect(link('missing')?.title).toBe(PATH_MISSING);
    expect(link('missing')?.nextElementSibling?.textContent).toBe(PATH_MISSING_NOTE);
    expect(container.querySelectorAll('.agent-path__note')).toHaveLength(1);
    expect(container.querySelectorAll('.agent-prose-images img')).toHaveLength(1);
    expect(asked).toHaveLength(1);
  });

  it('asks nothing when a reply names no paths', async () => {
    let asked = false;
    mockIPC((cmd) => {
      if (cmd === 'agents_check_paths') asked = true;
      return null;
    });
    const { container } = render(<Reply agentId="a2" text="All done, nothing to open." />);
    await new Promise((r) => setTimeout(r, 20));
    expect(asked).toBe(false);
    expect(container.querySelector('.agent-prose-images')).toBeNull();
  });
});
