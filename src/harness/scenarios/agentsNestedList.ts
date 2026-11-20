/**
 * A reply that is only a nested list, as it looks on the desk. The phone's
 * twin (`cd mobile && pnpm qa:web --phases nested-list`) must look the same:
 * on an iPhone a reply like this once showed empty circles with no words
 * (the list item's body had no natural width; mobile/src/components/Markdown.tsx).
 */

import type { Scenario } from '../types';
import { baseCommands, chiefGreeting } from './base';
import { MIN, now } from './agents';

const BASE_OVERVIEW = baseCommands.agents_overview as Record<string, unknown>;

const LIST = [
  '1. Fix the release path',
  '   - Tag the commit that went green',
  '   - Publish only after CI passes on it',
  '   - Keep the generated files in step',
  '2. Make the checks boring',
  '   - One list of checks for CI and pre-push',
  '   - Split the accessibility run in four',
  '   - Pin Windows to a fixed image',
].join('\n');

export const agentsNestedListScenarios: Scenario[] = [
  {
    id: 'agents-nested-list',
    title: 'Agents — a reply that is only a nested list',
    looksRightWhen:
      'One agent bubble holding “1. Fix the release path” with three bullets under it and “2. Make the checks boring” with three more: every bullet has its words, the numbers line up, nothing is empty or squeezed.',
    command: 'agents.open',
    requires: '.agent-chat',
    commands: {
      agents_overview: BASE_OVERVIEW,
      agents_messages: (args: Record<string, unknown>) =>
        args.agentId === 'chief'
          ? [
              chiefGreeting('chief', now - 99 * MIN),
              { id: 'nested-list', agentId: 'chief', ts: now - 98 * MIN, kind: 'agent' as const, text: LIST },
            ]
          : [],
    },
  },
];
