/**
 * Paths an agent wrote in a reply, checked on this Mac before anyone clicks
 * (`checkPaths`, the same allowlist a click is judged by): an image (png, jpg,
 * gif, webp) is drawn under the reply like an attached picture, a file or
 * folder stays a link, one that isn't there is muted ("Not found"), and one
 * outside the agent's folder and your projects becomes plain text.
 *
 * The links are the markdown renderer's (`agent-path` and local markdown
 * links); this only marks them (`data-path`) and takes the `href` off an
 * outside one, never adds or removes nodes, so `ProseRun` keeps its DOM.
 *
 * @module components/agents/useProsePaths
 */

import { useEffect, useState, type RefObject } from 'react';
import {
  checkPaths,
  localFileUrl,
  localPathFromHref,
  openLocalPath,
  type PathCheck,
} from '../../lib/agents';
import { useOptionalToast } from '../../contexts/ToastContext';
import { asCommandError, formatCommandError } from '../../lib/errors';

/** What a path that isn't there says on hover. */
export const PATH_MISSING = 'Not found on this Mac';

/** Checks this session, per agent and path, for a minute (a file may appear). */
const cache = new Map<string, { at: number; check: PathCheck }>();
const FRESH_MS = 60_000;
const key = (agentId: string, path: string) => `${agentId}\n${path}`;

/** The local path each link in `root` points at. */
function pathLinks(root: HTMLElement): { anchor: HTMLAnchorElement; path: string }[] {
  const out: { anchor: HTMLAnchorElement; path: string }[] = [];
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href], a[data-path]')) {
    const href = anchor.getAttribute('href') ?? anchor.dataset.pathHref ?? '';
    if (anchor.classList.contains('md-image-link')) continue;
    const path = anchor.classList.contains('agent-path')
      ? (anchor.getAttribute('title') ?? localPathFromHref(href))
      : localPathFromHref(href);
    if (path) out.push({ anchor, path });
  }
  return out;
}

function mark(anchor: HTMLAnchorElement, check: PathCheck) {
  anchor.dataset.path = check.kind;
  if (check.kind === 'outside') {
    // Plain text: not a link, not focusable, nothing to click.
    const href = anchor.getAttribute('href');
    if (href) anchor.dataset.pathHref = href;
    anchor.removeAttribute('href');
  } else if (check.kind === 'missing') {
    anchor.title = PATH_MISSING;
  }
}

/**
 * Marks the path links in `ref` for `text`, and returns the images to draw
 * under it, in the order the reply names them.
 */
export function useProsePaths(
  agentId: string,
  ref: RefObject<HTMLElement | null>,
  text: string
): PathCheck[] {
  const [images, setImages] = useState<PathCheck[]>([]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const links = pathLinks(root);
    let gone = false;
    const now = Date.now();
    const unknown = [
      ...new Set(
        links
          .map((l) => l.path)
          .filter((p) => {
            const hit = cache.get(key(agentId, p));
            return !hit || now - hit.at > FRESH_MS;
          })
      ),
    ];
    const apply = () => {
      if (gone) return;
      const found: PathCheck[] = [];
      for (const { anchor, path } of links) {
        const check = cache.get(key(agentId, path))?.check;
        if (!check) continue;
        mark(anchor, check);
        if (check.kind === 'image' && !found.some((c) => c.path === path)) found.push(check);
      }
      setImages(found);
    };
    // Drawn once the checks are in (from this session's, or the Mac's).
    const checked =
      unknown.length === 0
        ? Promise.resolve()
        : checkPaths(agentId, unknown).then((checks) => {
            for (const check of checks) cache.set(key(agentId, check.path), { at: now, check });
          });
    // An older Mac, or the check failed: the links stay as they were.
    checked.then(apply, () => {});
    return () => {
      gone = true;
    };
  }, [agentId, ref, text]);
  return images;
}

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

/** The images a reply names, drawn like attached pictures; a click opens one. */
export function ProseImages({ agentId, images }: { agentId: string; images: PathCheck[] }) {
  const { showToast } = useOptionalToast();
  if (images.length === 0) return null;
  return (
    <div className="agent-attachments agent-prose-images" data-side="agent">
      <div className="agent-attachments__images" data-count={Math.min(images.length, 3)}>
        {images.map((image) => (
          <span key={image.path} className="agent-attachments__item">
            <button
              type="button"
              className="agent-attachments__image"
              onClick={(event) =>
                void openLocalPath(agentId, image.path, event.metaKey).catch((error: unknown) =>
                  showToast(formatCommandError(asCommandError(error)), 'error')
                )
              }
              aria-label={`Open ${fileName(image.path)}`}
              title={image.path}
            >
              <img
                src={localFileUrl(image.full ?? image.path)}
                alt={fileName(image.path)}
                decoding="async"
              />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
