/**
 * The compact window's tab bar: a pill per agent or terminal tab, a × on the
 * pill under the pointer, then +.
 *
 * A tablist may own only tabs, so the × buttons and the + sit beside the
 * tablist, not in it. The bar is a one-row grid and each × takes its pill's
 * column, over the pill's right end, so it looks as it did when it was inside
 * the pill. The pill and its × share one hover (`data-hover`): the × isn't
 * inside the pill any more, so the pill's own `:hover` ends as the pointer
 * reaches it.
 *
 * @module components/workspace/CompactTabBar
 */

import { useState, type CSSProperties } from 'react';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { TabsList, TabsTab } from '../primitives/Tabs';
import { getAgentById } from '../../lib/agent';
import { kbd } from '../../lib/shortcuts';
import type { TerminalTab } from '../../hooks/useTerminalManagement';

/** A tab's value in the compact `Tabs`: its project and id. */
export function terminalTabValue(projectPath: string, tabId: number): string {
  return JSON.stringify([projectPath, tabId]);
}

/**
 * Label for an agent/terminal tab: use the registry title if present, else
 * `{Agent Name} {ordinal}` — matches the sidebar's own labelling in full mode
 * so the user sees the same names across window sizes.
 */
function buildTabLabel(
  tab: TerminalTab,
  tabs: ReadonlyArray<TerminalTab>,
  tabTitles: Map<number, string>
): string {
  const registryTitle = tabTitles.get(tab.id)?.trim();
  if (registryTitle && registryTitle.length > 0) return registryTitle;
  const agent = getAgentById(tab.agentId);
  // Count this tab's ordinal within the same agent id (e.g. "Claude Code 2").
  let ordinal = 0;
  for (const t of tabs) {
    if (t.agentId === tab.agentId) {
      ordinal += 1;
      if (t.id === tab.id) break;
    }
  }
  return `${agent.displayName} ${ordinal}`;
}

/** The grid column a pill and its × share. */
const column = (index: number): CSSProperties => ({ gridColumn: index + 1 });

export function CompactTabBar({
  projectPath,
  tabs,
  activeTab,
  tabTitles,
  attentionTabs,
  atMaxTabs,
  onAddTab,
  onCloseTab,
}: {
  projectPath: string;
  tabs: TerminalTab[];
  activeTab: number;
  tabTitles: Map<number, string>;
  attentionTabs: Set<number>;
  atMaxTabs: boolean;
  onAddTab: () => void;
  onCloseTab: (id: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const canClose = tabs.length > 1;
  const hover = (id: number) => ({
    onPointerEnter: () => setHovered(id),
    onPointerLeave: () => setHovered((current) => (current === id ? null : current)),
  });
  const labels = tabs.map((tab) => buildTabLabel(tab, tabs, tabTitles));

  return (
    <div className="tabs__list tabs__list--default tabs__list--appearance-segmented compact-tabs">
      <TabsList className="compact-tabs__list" aria-label="Agent and terminal tabs">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab;
          const hasAttention = attentionTabs.has(tab.id) && !isActive;
          return (
            <div
              key={tab.id}
              className={`compact-tab ${isActive ? 'is-active' : ''} ${
                hasAttention ? 'has-attention' : ''
              }`}
              style={column(index)}
              data-hover={hovered === tab.id || undefined}
              {...hover(tab.id)}
            >
              <TabsTab
                value={terminalTabValue(projectPath, tab.id)}
                className="compact-tab-select"
                title={labels[index]}
              >
                <span className="compact-tab-dot" aria-hidden="true" />
                <span className="compact-tab-label">{labels[index]}</span>
              </TabsTab>
            </div>
          );
        })}
      </TabsList>
      {canClose &&
        tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            className="compact-tab-close"
            style={column(index)}
            data-active={tab.id === activeTab || undefined}
            data-hover={hovered === tab.id || undefined}
            {...hover(tab.id)}
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            aria-label={`Close ${labels[index]}`}
            title="Close tab"
          >
            <CloseIcon size={12} />
          </button>
        ))}
      {!atMaxTabs && (
        <button
          type="button"
          className="compact-tab-add"
          style={column(tabs.length)}
          onClick={onAddTab}
          aria-label="New terminal tab"
          title={`New terminal tab (${kbd('mod', 'T')})`}
        >
          <PlusIcon size={12} />
        </button>
      )}
    </div>
  );
}
