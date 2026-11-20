/**
 * Settings → Notifications, "End-of-day check-in" (`agents::eod`): on by
 * default, one switch and a time. Once a day the Chief posts what the team
 * closed, what is still open, and asks what to hand off or chase tomorrow.
 * The Chief changes the same setting from chat; read again when it does.
 *
 * @module components/agents/AgentEndOfDaySetting
 */
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Row, Toggle } from './AgentSettingsRows';
import { TextField } from '../primitives/TextField';
import { useInvoke } from '../../hooks/useInvoke';
import { useOptionalToast } from '../../contexts/ToastContext';
import { asCommandError, formatCommandError } from '../../lib/errors';
import { clockLabel, parseClock } from '../../lib/settingsFromChat';
import { sendAgentMessage, setEndOfDayOnMac } from '../../lib/agents';
import { useAgentsSelector } from '../../lib/agentsStore';
import { TextButton } from '../primitives/TextButton';

export interface EndOfDay {
  on: boolean;
  /** Minutes after local midnight. */
  at: number;
}

export const END_OF_DAY_EVENT = 'agents-end-of-day-changed';
export const END_OF_DAY_TITLE = 'End-of-day check-in';
export const END_OF_DAY_DETAIL =
  'Once a day your Chief of Staff shows what got done and asks what missed the mark and how it can help more.';

export const setEndOfDay = (s: EndOfDay) => setEndOfDayOnMac(s.on, s.at);

export function AgentEndOfDaySetting() {
  const { showToast } = useOptionalToast();
  const { data, execute } = useInvoke<EndOfDay>('agents_end_of_day', { immediate: true });
  const [chosen, setChosen] = useState<EndOfDay | undefined>(undefined);
  useEffect(() => {
    let off: (() => void) | undefined;
    void listen(END_OF_DAY_EVENT, () => {
      setChosen(undefined);
      void execute().catch(() => {});
    })
      .then((u) => (off = u))
      .catch(() => {});
    return () => off?.();
  }, [execute]);

  const chiefId = useAgentsSelector((st) => st.agents.find((a) => a.isMain)?.id);
  const value = chosen ?? data;
  if (!value) return null;

  const save = (next: EndOfDay) => {
    const before = value;
    setChosen(next);
    setEndOfDay(next)
      .then((saved) => setChosen(saved))
      .catch((e: unknown) => {
        setChosen(before);
        showToast(formatCommandError(asCommandError(e)), 'error');
      });
  };

  return (
    <>
      <Row label={END_OF_DAY_TITLE} description={END_OF_DAY_DETAIL}>
        <div className="agents-brief">
          {value.on && (
            <TextField
              type="time"
              className="agents-brief__time"
              aria-label="End-of-day check-in time"
              value={clockLabel(value.at)}
              onChange={(e) => {
                const at = parseClock(e.target.value);
                if (at !== null && at !== value.at) save({ ...value, at });
              }}
            />
          )}
          <Toggle
            on={value.on}
            label={END_OF_DAY_TITLE}
            onChange={(on) => save({ ...value, on })}
          />
        </div>
      </Row>
      {chiefId && (
        <Row
          label="Get to know me"
          description="A few short questions, by text or voice, so your Chief of Staff knows your work."
        >
          <TextButton
            onClick={() =>
              void sendAgentMessage(
                chiefId,
                'Get to know me: ask one short question at a time about my work.'
              ).catch(() => {})
            }
          >
            Start again
          </TextButton>
        </Row>
      )}
    </>
  );
}
