/**
 * New agent, the simple first screen (Designer's G-5): make the agent's key
 * first (name, colour, a face or an icon), then an optional sentence about what
 * it does. Create works without the sentence and opens a blank agent's chat;
 * with one, the Chief drafts its instructions, routines and apps and the agent
 * is created with them (`agents_draft` then `agents_create`, no new Rust). "More
 * options" opens the full editor (templates, engine, model, project).
 *
 * @module components/agents/NewAgentDialog
 */

import { useMemo, useRef, useState } from 'react';
import { ModalFrame } from '../primitives/ModalFrame';
import { Button } from '../primitives/Button';
import { TextButton } from '../primitives/TextButton';
import { TextArea, TextField } from '../primitives/TextField';
import { Spinner } from '../primitives/Spinner';
import { ErrorIcon } from '@/components/icons';
import { AgentKey } from './AgentKey';
import { AgentKeyPicker } from './AgentKeyPicker';
import {
  freshColorway,
  iconFor,
  KEY_FACE_IDS,
  keyLookFor,
  legacyColorFor,
} from '../../../packages/companion-protocol/src/agentKeys';
import {
  createAgent,
  draftAgent,
  keptRoutines,
  openingOf,
  type AgentDraft,
} from '../../lib/agents';
import { getAgentsSnapshot } from '../../lib/agentsStore';
import { asCommandError, formatCommandError } from '../../lib/errors';

/** The name's longest, and where the counter shows. */
const NAME_MAX = 32;
const NAME_COUNTER_AT = 28;

export const NEW_AGENT_COPY = {
  title: 'New agent',
  namePlaceholder: 'Name your agent',
  describeLabel: 'What should it do? (optional)',
  describePlaceholder:
    'Describe it in a sentence. The Chief drafts its instructions, routines and apps for you.',
  cancel: 'Cancel',
  create: 'Create',
  drafting: 'Drafting…',
  tryAgain: 'Try again',
  createBlank: 'Create blank',
  moreOptions: 'More options…',
  failed: 'Couldn’t draft this one just now. Create it blank, or try again.',
} as const;

export function NewAgentDialog({
  isOpen,
  onClose,
  onCreated,
  onMoreOptions,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** The new agent's id: its chat opens. */
  onCreated: (id: string) => void;
  /** The full editor (templates, engine, model, project). */
  onMoreOptions?: () => void;
}) {
  const others = useMemo(() => getAgentsSnapshot().agents, []);
  const [name, setName] = useState('');
  const [colorway, setColorway] = useState<string>(() =>
    freshColorway(others.map((a) => keyLookFor(a).colorway))
  );
  const [icon, setIcon] = useState<string>(
    // The first face is the Chief's own mark: a new agent starts on the next.
    () => KEY_FACE_IDS[1] ?? KEY_FACE_IDS[0] ?? iconFor('', '')
  );
  const [sentence, setSentence] = useState('');
  const [busy, setBusy] = useState<null | 'drafting' | 'creating'>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && busy === null;

  const make = async (draft: AgentDraft | null) => {
    setBusy('creating');
    try {
      const created = await createAgent({
        name: trimmed,
        color: legacyColorFor(colorway),
        colorway,
        icon,
        ...(draft
          ? {
              role: draft.role,
              instructions: draft.instructions,
              routines: keptRoutines(
                draft,
                draft.routines.map((r) => !r.problem)
              ),
              ...openingOf(draft),
            }
          : {}),
      });
      onCreated(created.id);
      onClose();
    } catch (err) {
      setFailed(formatCommandError(asCommandError(err)));
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!canCreate) return;
    setFailed(null);
    const asked = sentence.trim();
    if (!asked) return void make(null);
    setBusy('drafting');
    try {
      const draft = await draftAgent(asked);
      await make(draft);
    } catch {
      setBusy(null);
      setFailed(NEW_AGENT_COPY.failed);
    }
  };

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={NEW_AGENT_COPY.title}
      showCloseButton
      className="new-agent"
      initialFocusRef={nameRef}
    >
      <form
        className="new-agent__body"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="new-agent__scroll">
          <div className="new-agent__preview">
            <AgentKey name={trimmed || 'Agent'} colorway={colorway} icon={icon} size="xl" />
          </div>
          <div className="new-agent__name">
            <TextField
              ref={nameRef}
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder={NEW_AGENT_COPY.namePlaceholder}
              aria-label="Name"
              autoComplete="off"
            />
            {name.length >= NAME_COUNTER_AT && (
              <span className="new-agent__counter">
                {name.length}/{NAME_MAX}
              </span>
            )}
          </div>
          <AgentKeyPicker
            name={trimmed || 'Agent'}
            colorway={colorway}
            icon={icon}
            boundKey={null}
            level={null}
            taken={[]}
            onColorwayChange={setColorway}
            onIconChange={setIcon}
            onBoundKeyChange={() => {}}
            defaultWears="face"
            showBind={false}
            showPreview={false}
          />
          <label className="new-agent__label" htmlFor="new-agent-sentence">
            {NEW_AGENT_COPY.describeLabel}
          </label>
          <TextArea
            id="new-agent-sentence"
            className="new-agent__sentence"
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            placeholder={NEW_AGENT_COPY.describePlaceholder}
            rows={3}
          />
        </div>
        {failed && (
          <p className="new-agent__failed" role="alert">
            <ErrorIcon size={14} /> {failed}
            {failed === NEW_AGENT_COPY.failed && (
              <span className="new-agent__failed-actions">
                <TextButton tabIndex={0} onClick={() => void make(null)}>
                  {NEW_AGENT_COPY.createBlank}
                </TextButton>
                <TextButton tabIndex={0} onClick={() => void create()}>
                  {NEW_AGENT_COPY.tryAgain}
                </TextButton>
              </span>
            )}
          </p>
        )}
        <div className="new-agent__footer">
          {onMoreOptions && (
            <TextButton tabIndex={0} onClick={onMoreOptions} className="new-agent__more">
              {NEW_AGENT_COPY.moreOptions}
            </TextButton>
          )}
          <Button tabIndex={0} variant="secondary" onClick={onClose}>
            {NEW_AGENT_COPY.cancel}
          </Button>
          <Button tabIndex={0} type="submit" variant="strong" disabled={!canCreate}>
            {busy === 'drafting' ? (
              <>
                <Spinner size="sm" /> {NEW_AGENT_COPY.drafting}
              </>
            ) : (
              NEW_AGENT_COPY.create
            )}
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}
