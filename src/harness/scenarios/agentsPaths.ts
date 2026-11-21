/**
 * File paths in an agent's reply (`useProsePaths`): the Mac checks each one
 * (`agents_check_paths`, the open allowlist) before anyone clicks. An image
 * in a project is drawn under the reply like an attached picture, a file stays
 * a link, one outside the agent's folder and your projects is a chip that
 * doesn't open, and
 * one that isn't there is the same chip struck through and muted, as on the
 * phone. Every path
 * is one look, a monospace chip. Fictional throughout.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, messagesFor, msg, overview } from './agents';

const VIEW = { width: 1280, height: 900 };

const IMAGE = '~/ShipStudio/acme/shots/hero-after.png';
const IMAGE_2 = '~/ShipStudio/acme/shots/hero-before.png';
const FILE = '~/ShipStudio/acme/notes/hero-review.md';
const OUTSIDE = '/Users/julian/Downloads/contract-signed.pdf';
const MISSING = '~/ShipStudio/acme/shots/footer-after.png';

/** The harness serves the demo folder over HTTP, so `full` is already a URL. */
const SERVED = '/harness/agents-demo/attachments/m-res1';
const CHECKS: Record<string, { kind: string; full?: string }> = {
  [IMAGE]: { kind: 'image', full: `${SERVED}/after.jpg` },
  [IMAGE_2]: { kind: 'image', full: `${SERVED}/before.jpg` },
  [FILE]: { kind: 'file' },
  [OUTSIDE]: { kind: 'outside' },
  [MISSING]: { kind: 'missing' },
};

const checkPaths = (args: Record<string, unknown>) =>
  (args.paths as string[]).map((path) => ({ path, ...(CHECKS[path] ?? { kind: 'outside' }) }));

const scenario = (
  id: string,
  title: string,
  looksRightWhen: string,
  text: string,
  requires: string
): Scenario => ({
  id: `agents-paths-${id}`,
  title: `Agents — paths in a reply: ${title}`,
  looksRightWhen,
  requires,
  openSelector: AGENTS_TAB,
  steps: [{ click: '[data-agent-id="chief"]' }, { wait: 600 }],
  viewport: VIEW,
  commands: {
    agents_overview: overview(),
    agents_messages: (args: Record<string, unknown>) =>
      args.agentId === 'chief'
        ? [msg('user', 'Show me the new hero next to the old one.', 6), msg('agent', text, 5)]
        : messagesFor(args),
    agents_check_paths: checkPaths,
    agents_open_path: 'open',
  },
});

export const agentsPathsScenarios: Scenario[] = [
  scenario(
    'mixed',
    'found, missing and outside in one reply',
    'One reply, three paths, one look: the review note’s path a chip that opens; the footer shot’s the same chip struck through and muted; the Downloads path the same chip with nothing to click. Matches the phone’s reply-paths shot.',
    `Updated ${FILE}. The old ${MISSING} is gone, and I left ${OUTSIDE} alone.`,
    '.agent-markdown a[data-path="missing"]'
  ),
  scenario(
    'image',
    'image paths drawn in the bubble',
    'The reply names two screenshots; both paths are chips in the text, and under the bubble the two pictures sit side by side like attached images (rounded, same size as attachments), the new hero first. Nothing is cut off; readable in both themes.',
    `Done. The new hero is at ${IMAGE}, and the old one is at ${IMAGE_2} if you want them side by side.`,
    '.agent-prose-images img'
  ),
  scenario(
    'file',
    'a file path stays a link',
    'The review note’s path is a monospace chip (the inline-code tint, no underline) that opens the file on click; no picture under the bubble.',
    `I wrote up what changed in \`${FILE}\`.`,
    '.agent-markdown a[data-path="file"]'
  ),
  scenario(
    'outside',
    'a path outside the allowlist is plain text',
    'The Downloads path is the same chip but not a link: a text cursor, nothing to click or tab to. The project path beside it is a chip that opens.',
    `I couldn’t use ${OUTSIDE}, so I used ${FILE} instead.`,
    '.agent-markdown a[data-path="outside"]:not([href])'
  ),
  scenario(
    'missing',
    'a path that isn’t there',
    'The footer screenshot’s path is the same chip, struck through and muted (as on the phone), with “Not found on this Mac” on hover; no word beside it, no picture for it, and the hero beside it still draws.',
    `The footer shot was at ${MISSING} but I cleaned it up; the hero is still at ${IMAGE}.`,
    '.agent-markdown a[data-path="missing"]'
  ),
];
