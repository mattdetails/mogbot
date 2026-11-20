/**
 * The Agents sidebar's row and folder states that need a pointer, the
 * keyboard or a held drag to reach: muted, hover against selected, keyboard
 * focus, a folded folder, a drag over a folder and over a row, the width at
 * the end of its drag range, and search with names and messages. Built on
 * the Agents team fixture (`./agents`) and the folders (`./agentsDesk`).
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, TEAM, messagesFor, overview, searchFor } from './agents';
import { folderCommands } from './agentsDesk';

const SIDEBAR = '.workspace-sidebar';
const team = { agents_overview: overview(), agents_messages: messagesFor };

export const agentsSidebarGateScenarios: Scenario[] = [
  {
    id: 'agents-sidebar-row-muted',
    title: 'Agents sidebar — a muted agent’s row',
    looksRightWhen:
      'Social Posts is muted: a small bell-off mark after its name, the name in the secondary ink (quieter than its neighbours’), and no blue unread dot at the right even though it has news; its time “2d” stays. Every other row as in the plain list.',
    openSelector: AGENTS_TAB,
    requires: '[data-agent-id="social"]',
    clipSelector: SIDEBAR,
    commands: {
      ...team,
      agents_overview: overview(TEAM.map((a) => (a.id === 'social' ? { ...a, unread: 2 } : a))),
    },
  },
  {
    id: 'agents-sidebar-row-hover',
    title: 'Agents sidebar — hover on one row while another is open',
    looksRightWhen:
      'The Chief of Staff is open (the solid selected fill). The pointer rests on Finance: its row takes a fainter fill than the Chief’s, on the same inset and radius, so hover always reads below selected. Finance’s time “40m” stays readable on it.',
    openSelector: AGENTS_TAB,
    requires: '[data-agent-id="finance"]',
    clipSelector: SIDEBAR,
    pointAt: '[data-agent-id="finance"]',
    commands: team,
  },
  {
    id: 'agents-sidebar-row-focus',
    title: 'Agents sidebar — a row with keyboard focus',
    looksRightWhen:
      'Native App has keyboard focus: a neutral ring inside its rounded row (grey, never the accent), and no fill of its own. The Chief keeps its selected fill.',
    openSelector: AGENTS_TAB,
    requires: '[data-agent-id="native"]',
    clipSelector: SIDEBAR,
    steps: [{ focus: '[data-agent-id="native"]' }],
    commands: team,
  },
  {
    id: 'agents-desk-folder-collapsed',
    title: 'Agents sidebar — a folder folded shut',
    looksRightWhen:
      '“SEO 1” is folded: its chevron points right and Social Posts is not shown under it; the header keeps its count. The folders above and below are open, and nothing else moves.',
    openSelector: AGENTS_TAB,
    requires: '.agents-list__group-toggle[aria-expanded="false"]',
    clipSelector: SIDEBAR,
    steps: [{ click: '.agents-list__group-toggle', text: 'SEO' }],
    commands: folderCommands('top'),
  },
  {
    id: 'agents-desk-folder-dragover',
    title: 'Agents sidebar — an agent held over an empty folder',
    looksRightWhen:
      'Finance is picked up (its row dimmed) and held over the empty “Mogbot 0” folder: the whole folder, header and its place, is ONE rounded card in the selected fill on the rows’ inset, never two separate fills; its place reads “Drop to move here” with a solid key outline. Nothing in the list moves.',
    openSelector: AGENTS_TAB,
    requires: '.agents-list__group-empty',
    clipSelector: SIDEBAR,
    steps: [{ drag: '[data-agent-id="finance"]', to: '.agents-list__group-empty' }],
    commands: folderCommands('top', [{ id: 'f-mogbot', name: 'Mogbot' }]),
  },
  {
    id: 'agents-sidebar-drag',
    title: 'Agents sidebar — an agent dragged to a new place in the list',
    looksRightWhen:
      'Finance is picked up (its row dimmed) and held over Native App: a thin line in the primary ink marks where it will land, just above or below Native App, between the rows, on the rows’ inset. No row moves until it’s dropped.',
    openSelector: AGENTS_TAB,
    requires: '[data-agent-id="native"]',
    clipSelector: SIDEBAR,
    steps: [{ drag: '[data-agent-id="finance"]', to: '[data-agent-id="native"]' }],
    commands: team,
  },
  {
    id: 'agents-sidebar-resize',
    title: 'Agents sidebar — at the narrow end of its drag range',
    looksRightWhen:
      'The sidebar dragged to its narrowest: rows keep their key, name and time; previews and long names end in an ellipsis, never wrap; the toggle, search and New agent fit; the foot keeps its bar (the usage words may go) and the gear. Nothing overlaps the chat.',
    openSelector: AGENTS_TAB,
    requires: '[aria-label="Resize Project Sidebar"]',
    viewport: { width: 1100, height: 720 },
    steps: [
      { focus: '[aria-label="Resize Project Sidebar"]' },
      ...Array.from({ length: 14 }, () => ({ key: 'ArrowLeft' })),
    ],
    commands: team,
  },
  {
    id: 'agents-search2',
    title: 'Agents sidebar — search finding names and messages',
    looksRightWhen:
      'The top field holds “lead”. The rows give way to results: agents whose name matches (Lead Gen, its name with “Lead” highlighted) and message hits grouped by agent, each with its key, the matching line with “lead” highlighted, who said it and a time. Esc would clear it.',
    openSelector: AGENTS_TAB,
    requires: '.agents-search__hit',
    clipSelector: SIDEBAR,
    steps: [{ fill: '.agents-top-search input', value: 'lead' }],
    commands: { ...team, agents_search: searchFor },
  },
];
