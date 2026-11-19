/**
 * A message the agent wants to send as you, on the phone (the desk's
 * `AgentDraftCard`, same rules, `draftCard.ts` in the protocol): who it goes
 * to, the exact words, then Discard · Edit · Send, the neutral Send last. Edit
 * changes the words (and an email's CC and subject); "Draft in Gmail" opens
 * your Gmail with the draft filled in and sends nothing. A Slack reply posts
 * your edit itself; anything else goes back to the agent as a declined draft
 * with your words, so what you approve is always what is sent. Pending only:
 * once answered, the card is the plain request's receipt.
 */

import { draftOf, editedNote, gmailUrl } from '@shipstudio/companion-protocol';
import type { Agent, AgentMessage } from '@shipstudio/companion-protocol';
import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { Card, CardActions, ACTION } from './surfaces';
import { Button, T } from './ui';
import { useArmed } from './ApprovalCard';
import { useColors, makeStyles } from '../lib/appearance';
import { haptic } from '../lib/haptics';
import { useInFlight } from '../lib/once';
import { answerApproval, describeError } from '../lib/session';
import { useApp } from '../lib/store';
import { radius, space, type } from '../lib/theme';

export function DraftCard({
  message,
  agent,
  onError,
}: {
  message: AgentMessage;
  agent: Agent;
  onError: (text: string) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const approval = message.approval;
  const draft = draftOf(approval);
  const connected = useApp((s) => s.link.kind === 'connected');
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [cc, setCc] = useState(draft?.cc ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [busy, setBusy] = useState(false);
  const pending = approval?.status === 'pending';
  const armed = useArmed(pending);
  const once = useInFlight();
  if (!approval || !draft) return null;
  const isEmail = draft.kind === 'email';
  const changed = subject !== draft.subject || cc !== draft.cc || body !== draft.body;
  const now = { ...draft, subject, cc, body };
  const off = busy || !connected;

  const answer = (allow: boolean, note?: string) =>
    once(async () => {
      if (!armed) return;
      setBusy(true);
      try {
        await answerApproval(message.agentId, approval.requestId, allow, false, note);
        if (allow) haptic.success();
        else haptic.warning();
      } catch (e) {
        haptic.error();
        onError(describeError(e));
      } finally {
        setBusy(false);
      }
    });
  const send = () => {
    if (!body.trim()) return;
    if (!changed) return answer(true);
    return draft.direct ? answer(true, body) : answer(false, editedNote(now));
  };

  return (
    <Card
      icon={isEmail ? 'square.and.pencil' : 'text.bubble'}
      title={
        draft.kind === 'email'
          ? 'Send this email?'
          : draft.kind === 'slack'
            ? 'Reply in Slack?'
            : 'Post this?'
      }
      source={`${agent.name} · sends as you`}
      note="These exact words go out under your name."
      testID="draft-card"
      actions={
        <CardActions>
          <Button
            title="Discard"
            variant="outline"
            disabled={off}
            focusable={armed}
            onPress={() => void answer(false)}
            style={ACTION}
          />
          <Button
            title={editing ? 'Cancel edit' : 'Edit'}
            variant="ghost"
            disabled={off}
            onPress={() => {
              if (editing) {
                setSubject(draft.subject);
                setCc(draft.cc);
                setBody(draft.body);
              }
              setEditing(!editing);
            }}
            style={ACTION}
          />
          <Button
            title={changed && !draft.direct ? 'Send my version' : 'Send'}
            variant="answer"
            disabled={off || !body.trim()}
            focusable={armed}
            onPress={() => void send()}
            style={ACTION}
          />
        </CardActions>
      }
    >
      <View style={styles.head}>
        <Row label={isEmail ? 'To' : 'In'} value={draft.to} />
        {isEmail && (editing || !!cc) && (
          <Row label="CC">
            {editing ? (
              <TextInput
                value={cc}
                onChangeText={setCc}
                accessibilityLabel="CC"
                placeholder="Add addresses"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.field}
              />
            ) : (
              <T color={colors.textBody}>{cc}</T>
            )}
          </Row>
        )}
        {isEmail && (editing || !!subject) && (
          <Row label="Subject">
            {editing ? (
              <TextInput
                value={subject}
                onChangeText={setSubject}
                accessibilityLabel="Subject"
                placeholderTextColor={colors.textMuted}
                style={styles.field}
              />
            ) : (
              <T color={colors.textBody}>{subject}</T>
            )}
          </Row>
        )}
      </View>
      {editing ? (
        <TextInput
          multiline
          value={body}
          onChangeText={setBody}
          accessibilityLabel="What it says"
          placeholderTextColor={colors.textMuted}
          maxLength={4000}
          style={[styles.field, styles.body]}
        />
      ) : (
        <View style={styles.words}>
          <T color={colors.textBody}>{draft.body}</T>
        </View>
      )}
      {isEmail && (
        <Button
          title="Draft in Gmail"
          variant="ghost"
          size="compact"
          disabled={off}
          onPress={() => void Linking.openURL(gmailUrl(now))}
          accessibilityHint="Opens it in Gmail to finish there. Nothing is sent."
        />
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <T variant="small" color={colors.textSecondary} style={styles.label}>
        {label}
      </T>
      <View style={styles.grow}>{children ?? <T color={colors.textBody}>{value}</T>}</View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  label: { width: space['2xl'] * 2 + space.sm, flexShrink: 0 },
  grow: { flex: 1 },
  words: {
    padding: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceControl,
  },
  field: {
    color: colors.textBody,
    fontSize: type.read,
    padding: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceControl,
  },
  body: { minHeight: space['2xl'] * 3, textAlignVertical: 'top' },
}));
