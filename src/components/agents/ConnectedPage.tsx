/**
 * Settings → Connected: the one place that says what's connected and where
 * to set each thing up. One row per way in, each read from the app's own
 * checks (never a guess), with a button to its page:
 *
 * - Mogbot for Chrome: the only way agents reach your signed-in sites
 * - Your AI: the engines that are installed and signed in
 * - Apps: what agents have been given a login to
 * - Your phone: paired phones
 * - Other assistants: Remote Access, when an assistant has connected
 *
 * A row whose check couldn't run says "Couldn't check", never "Connected".
 *
 * @module components/agents/ConnectedPage
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '../primitives/Button';
import { Group, Row } from './AgentSettingsRows';
import { usePolling } from '../../hooks/usePolling';
import { listConnections, type Connection } from '../../lib/agentLogins';
import { getPhoneStatus } from '../../lib/companion';
import { getRemoteAccessStatus } from '../../lib/remoteAccess';
import { getFullSetupStatus } from '../../lib/setup';
import { chromeNeedsAttention, getUserChromeStatus, USER_CHROME_TITLE } from '../../lib/userChrome';
import type { SettingsPage } from '../../lib/settingsPages';

type Reading<T> = { state: 'loading' } | { state: 'failed' } | { state: 'ok'; value: T };

function useReading<T>(read: () => Promise<T>): Reading<T> {
  const [r, setR] = useState<Reading<T>>({ state: 'loading' });
  const load = useCallback(async () => {
    try {
      setR({ state: 'ok', value: await read() });
    } catch {
      setR({ state: 'failed' });
    }
  }, [read]);
  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, { intervalMs: 5000, enabled: true });
  return r;
}

const ENGINE_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
};

interface Line {
  /** Connected, or what's missing. */
  on: boolean | null;
  text: string;
  /** The page that sets it up. */
  to: SettingsPage;
  action: string;
}

function lineFor<T>(r: Reading<T>, f: (v: T) => Omit<Line, 'to'>, to: SettingsPage): Line {
  if (r.state === 'loading') return { on: null, text: 'Checking…', to, action: 'Open' };
  if (r.state === 'failed') return { on: null, text: 'Couldn’t check.', to, action: 'Open' };
  return { ...f(r.value), to };
}

export function ConnectedPage({ onGo }: { onGo: (page: SettingsPage) => void }) {
  const chrome = useReading(getUserChromeStatus);
  const setup = useReading(getFullSetupStatus);
  const apps = useReading<Connection[]>(listConnections);
  const phone = useReading(getPhoneStatus);
  const remote = useReading(getRemoteAccessStatus);

  const rows: { id: string; label: string; line: Line }[] = [
    {
      id: 'chrome',
      label: USER_CHROME_TITLE,
      line: lineFor(
        chrome,
        (s) => {
          if (!s.supported) return { on: null, text: 'Not available here.', action: 'Open' };
          if (!chromeNeedsAttention(s)) {
            const n = s.browsers.length;
            return {
              on: true,
              text: `Connected: ${n === 1 ? 'one Chrome profile' : `${n} Chrome profiles`}. The only way agents reach your signed-in sites.`,
              action: 'Open',
            };
          }
          return {
            on: false,
            text: s.enabled
              ? 'Not connected. Agents can’t use your signed-in sites until it is.'
              : 'Not set up. Agents can’t use your signed-in sites until it is.',
            action: s.enabled ? 'Finish setting it up' : 'Install it',
          };
        },
        'chrome'
      ),
    },
    {
      id: 'engines',
      label: 'Your AI',
      line: lineFor(
        setup,
        (s) => {
          const names = s.detectedAgents.map((a) => ENGINE_NAMES[a] ?? a);
          return names.length
            ? { on: true, text: `${names.join(', ')}, installed and signed in.`, action: 'Open' }
            : {
                on: false,
                text: 'Not set up: no engine is installed and signed in yet.',
                action: 'Set up',
              };
        },
        'agents'
      ),
    },
    {
      id: 'apps',
      label: 'Apps',
      line: lineFor(
        apps,
        (list) =>
          list.length
            ? {
                on: true,
                text: `${list
                  .map((c) => c.title)
                  .slice(0, 4)
                  .join(', ')}${list.length > 4 ? ` and ${list.length - 4} more` : ''}.`,
                action: 'Open',
              }
            : {
                on: false,
                text: 'None yet: an agent asks for one on a card when it needs it.',
                action: 'Open',
              },
        'apps'
      ),
    },
    {
      id: 'phone',
      label: 'Your phone',
      line: lineFor(
        phone,
        (p) =>
          p.devices.length
            ? {
                on: true,
                text:
                  p.devices.length === 1
                    ? 'One phone paired.'
                    : `${p.devices.length} phones paired.`,
                action: 'Open',
              }
            : { on: false, text: 'Not set up: no phone paired.', action: 'Set up' },
        'phone'
      ),
    },
    {
      id: 'assistants',
      label: 'Other assistants',
      line: lineFor(
        remote,
        (s) =>
          s.supported && s.enabled && s.everConnected
            ? { on: true, text: 'An assistant has connected over Remote Access.', action: 'Open' }
            : { on: false, text: 'Not set up: none connected.', action: 'Set up' },
        'phone'
      ),
    },
  ];

  return (
    <div className="agents-settings" data-testid="connected-page">
      <Group
        id="connected"
        title="What’s connected"
        footnote="Each row is read from this Mac now. Press a button to go to where it’s set up."
      >
        {rows.map(({ id, label, line }) => (
          <Row
            key={id}
            label={label}
            description={`${line.on === true ? 'Connected. ' : ''}${line.text}`}
          >
            <Button
              variant={line.on === false ? 'default' : 'secondary'}
              onClick={() => onGo(line.to)}
              data-connected-row={id}
            >
              {line.action}
            </Button>
          </Row>
        ))}
      </Group>
    </div>
  );
}
