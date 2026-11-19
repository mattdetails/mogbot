/**
 * A message the agent wants to send as you, drawn as a draft (`lib/draftCard`):
 * who it goes to, the exact words, and what you can do with them. Edit changes
 * the words (and an email's subject and CC) before they go; Discard stops it;
 * Send is the OK; "Draft in Gmail" opens your own Gmail with the draft filled
 * in and sends nothing. Send is neutral, never the agent's colour.
 *
 * A Slack reply posts your edit itself. For anything else an edit goes back to
 * the agent as a declined draft with your words, so what you approve is always
 * what is sent (`editedNote`).
 *
 * @module components/agents/AgentDraftCard
 */

import { memo, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '../primitives/Button';
import { TextButton } from '../primitives/TextButton';
import { TextArea, TextField } from '../primitives/TextField';
import { AgentCard } from './AgentCard';
import { PencilIcon, SlackIcon } from '@/components/icons';
import { draftOf, editedNote, gmailUrl, type Draft } from '../../lib/draftCard';
import type { AgentMessage } from '../../lib/agents';

interface DraftCardProps {
  message: AgentMessage;
  agentName: string;
  onAnswer: (requestId: string, allow: boolean, always?: boolean, note?: string) => Promise<void>;
  arrived?: boolean;
}

const TITLE: Record<Draft['kind'], string> = {
  email: 'Send this email?',
  slack: 'Reply in Slack?',
  post: 'Post this?',
};

export const AgentDraftCard = memo(function AgentDraftCard({
  message,
  agentName,
  onAnswer,
  arrived,
}: DraftCardProps) {
  const approval = message.approval;
  const draft = draftOf(approval);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [cc, setCc] = useState(draft?.cc ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [openedPending] = useState(approval?.status === 'pending');
  if (!approval || !draft) return null;
  const pending = approval.status === 'pending';
  const isEmail = draft.kind === 'email';
  const now = { ...draft, subject, cc, body };
  const changed = subject !== draft.subject || cc !== draft.cc || body !== draft.body;
  const empty = !body.trim();

  const answer = async (allow: boolean, note?: string) => {
    setBusy(true);
    try {
      await onAnswer(approval.requestId, allow, false, note);
    } finally {
      setBusy(false);
    }
  };
  const send = () => {
    if (empty) return;
    if (!changed) return void answer(true);
    // A Slack reply posts the edit; anything else asks again with the new words.
    return draft.direct ? answer(true, body) : answer(false, editedNote(now));
  };

  return (
    <div
      className="agent-chat__row agent-chat__row--agent agent-chat__row--card"
      data-arrived={arrived || undefined}
      data-message-ids={message.id}
    >
      <AgentCard
        className="agent-approval agent-draft"
        data={{ status: approval.status }}
        icon={draft.kind === 'email' ? <PencilIcon size={14} /> : <SlackIcon size={14} />}
        title={TITLE[draft.kind]}
        meta={`from ${agentName}, sends as you`}
        actions={
          pending ? (
            <>
              <Button
                tabIndex={0}
                variant="secondary"
                disabled={busy}
                onClick={() => void answer(false)}
              >
                Discard
              </Button>
              {isEmail && (
                <TextButton
                  tabIndex={0}
                  disabled={busy}
                  onClick={() => void openUrl(gmailUrl(now))}
                  title="Opens it in your Gmail to finish there. Nothing is sent."
                >
                  Draft in Gmail
                </TextButton>
              )}
              <TextButton
                tabIndex={0}
                disabled={busy}
                onClick={() => {
                  if (editing) {
                    setSubject(draft.subject);
                    setCc(draft.cc);
                    setBody(draft.body);
                  }
                  setEditing(!editing);
                }}
              >
                {editing ? 'Cancel edit' : 'Edit'}
              </TextButton>
              <Button
                tabIndex={0}
                variant="strong"
                data-allow
                disabled={busy || empty}
                onClick={() => void send()}
              >
                {changed && !draft.direct ? 'Send my version' : 'Send'}
              </Button>
            </>
          ) : undefined
        }
        outcome={
          pending
            ? undefined
            : approval.status === 'allowed'
              ? isEmail
                ? `Sent · ${agentName} is carrying on`
                : 'Sent'
              : approval.status === 'denied'
                ? approval.note?.startsWith('I edited it')
                  ? 'Edited · sent back for your OK'
                  : `Discarded · ${agentName} was told`
                : 'Not answered'
        }
        outcomeTone={approval.status === 'allowed' ? 'done' : undefined}
        resolved={openedPending && !pending}
      >
        <dl className="agent-draft__head">
          <dt>{isEmail ? 'To' : 'In'}</dt>
          <dd>{draft.to}</dd>
          {isEmail && (editing || cc) && (
            <>
              <dt>CC</dt>
              <dd>
                {editing ? (
                  <TextField
                    aria-label="CC"
                    value={cc}
                    disabled={busy}
                    placeholder="Add addresses, separated by commas"
                    onChange={(e) => setCc(e.target.value)}
                  />
                ) : (
                  cc
                )}
              </dd>
            </>
          )}
          {isEmail && (editing || subject) && (
            <>
              <dt>Subject</dt>
              <dd>
                {editing ? (
                  <TextField
                    aria-label="Subject"
                    value={subject}
                    disabled={busy}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                ) : (
                  subject
                )}
              </dd>
            </>
          )}
        </dl>
        {editing && pending ? (
          <TextArea
            aria-label="What it says"
            className="agent-draft__edit"
            rows={Math.min(14, Math.max(4, body.split('\n').length + 1))}
            value={body}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
          />
        ) : (
          <div className="agent-draft__body">{draft.body}</div>
        )}
        {pending && (
          <p className="agent-card__note">
            These exact words go out under your name.
            {isEmail && ' Edit changes them first; Draft in Gmail lets you finish it there.'}
          </p>
        )}
      </AgentCard>
    </div>
  );
});
