/**
 * The chat's bubbles, Grok's way (chat-spec-vs-grok.md, option A): yours takes
 * the agent's key colour with an ink chosen for contrast, the agent's is a faint
 * tint of the reading text (4% dark, 6% light), 18px corners, 7x12 padding,
 * 15/20 type. One scenario per key colour, so the ink picked for gold and green
 * (near-black) and for the deep colours (near-white) can be read side by side.
 * Capture each with `--theme light` and `--theme dark`.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, agent, msg, overview } from './agents';

const COLORS = [
  'white',
  'brown',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;

const NAMES: Record<string, string> = { amber: 'Gold' };

const LONG =
  'Also, while you’re in there, check that the footer links on the pricing page and the careers page point at the new URLs, and tell me which of the two still has the old Twitter icon so I can decide whether it is worth a separate fix before Thursday’s release.';

function lines(id: string) {
  return [
    msg('user', 'Where are we on the pricing fix?', 9, { agentId: id }),
    msg(
      'agent',
      'The cards now stack below 640px. I checked it at 390, 768 and 1280, and the footer links point at the right pages.\n\n- `/careers` goes to the new jobs page\n- the old Twitter link is the X profile',
      8,
      { agentId: id }
    ),
    msg('user', 'Great. Ship it to staging.', 6, { agentId: id }),
    msg('user', LONG, 5, { agentId: id }),
    msg('agent', 'On it. Staging redeploys in a minute.', 4, { agentId: id }),
  ];
}

export const agentsBubbleScenarios: Scenario[] = COLORS.map(
  (color): Scenario => ({
    id: `agents-bubbles-${color}`,
    title: `Agents — bubbles: a ${NAMES[color] ?? color} agent`,
    looksRightWhen:
      'Your bubbles are this agent’s key colour with an ink that reads on it (near-black on the light colours, near-white on the deep ones, at least 4.5:1); the agent’s are a faint tint of the text colour with no fill of the key colour. Both have 18px corners (6px toward the speaker), 7px by 12px padding and 15/20 type; your long message wraps inside 560px.',
    requires: '.agent-bubble--user',
    openSelector: AGENTS_TAB,
    steps: [{ click: `[data-agent-id="bubbles-${color}"]` }],
    viewport: { width: 1280, height: 900 },
    commands: {
      agents_overview: overview([
        agent(
          `bubbles-${color}`,
          `${NAMES[color] ?? color[0].toUpperCase() + color.slice(1)} agent`,
          {
            color,
            role: 'Drafts and sends the intro emails.',
            minutesAgo: 4,
            preview: 'On it. Staging redeploys in a minute.',
          }
        ),
      ]),
      agents_messages: (args: Record<string, unknown>) => lines(String(args.agentId)),
    },
  })
);

/** A wide window: the chat is one 720px column, centred; the header's content sits at its edges, the header has no border. */
export const agentsWideScenario: Scenario = {
  ...agentsBubbleScenarios[4],
  id: 'agents-wide',
  title: 'Agents — a wide window (1700px)',
  looksRightWhen:
    'The messages and the box share one 720px column, centred beside the sidebar. The header has no border or fill; its key (36px), name and the muted one-line description sit at the column’s left edge and the ⋯ at its right edge. Nothing runs to the window’s edges.',
  viewport: { width: 1700, height: 900 },
};
