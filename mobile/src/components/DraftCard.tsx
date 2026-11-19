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

import {
  DRAFT_NOTE,
  draftFrom,
  draftOf,
  draftTitle,
  editedNote,
  gmailUrl,
} from '@shipstudio/companion-protocol';
import type { Agent, AgentMessage } from '@shipstudio/companion-protocol';
import { useState, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Card, ACTION_PAIR } from './surfaces';
import { Button, T } from './ui';
import { useArmed } from './ApprovalCard';
import { useColors, makeStyles } from '../lib/appearance';
import { haptic } from '../lib/haptics';
import { useInFlight } from '../lib/once';
import { answerApproval, describeError } from '../lib/session';
import { useApp } from '../lib/store';
import { draft as metrics, radius, space, type } from '../lib/theme';

export function DraftCard({
  message,
  onError,
}: {
  message: AgentMessage;
  /** Whose card it is (the chat passes it; the title names who it goes to, not the agent). */
  agent?: Agent;
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

  const rows: { label: string; value?: string; input?: ReactNode }[] = [
    { label: isEmail ? 'To' : 'In', value: draft.to },
  ];
  if (isEmail && (editing || cc)) {
    rows.push({
      label: 'CC',
      value: cc,
      input: (
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
      ),
    });
  }
  if (isEmail && (editing || subject)) {
    rows.push({
      label: 'Subject',
      value: subject,
      input: (
        <TextInput
          value={subject}
          onChangeText={setSubject}
          accessibilityLabel="Subject"
          placeholderTextColor={colors.textMuted}
          style={styles.field}
        />
      ),
    });
  }

  return (
    <Card
      icon={isEmail ? 'square.and.pencil' : 'text.bubble'}
      title={draftTitle(draft, approval)}
      testID="draft-card"
      actions={
        <>
          <Button
            title="Discard"
            variant="ghost"
            disabled={off}
            focusable={armed}
            onPress={() => void answer(false)}
            style={ACTION_PAIR}
          />
          <Button
            title={editing ? 'Cancel edit' : 'Edit'}
            variant="outline"
            disabled={off}
            onPress={() => {
              if (editing) {
                setSubject(draft.subject);
                setCc(draft.cc);
                setBody(draft.body);
              }
              setEditing(!editing);
            }}
            style={ACTION_PAIR}
          />
          {isEmail && (
            <Button
              title="Draft in Gmail"
              variant="outline"
              disabled={off}
              onPress={() => void Linking.openURL(gmailUrl(now))}
              accessibilityHint="Opens it in Gmail to finish there. Nothing is sent."
              style={ACTION_PAIR}
            />
          )}
          <Button
            title={changed && !draft.direct ? 'Send my version' : 'Send'}
            variant="answer"
            disabled={off || !body.trim()}
            focusable={armed}
            onPress={() => void send()}
            style={ACTION_PAIR}
          />
        </>
      }
    >
      <View style={styles.block}>
        {rows.map((r) => (
          <View key={r.label} style={styles.row}>
            <T variant="small" color={colors.textMuted} style={styles.label}>
              {r.label}
            </T>
            <View style={styles.grow}>
              {editing && r.input ? r.input : <T color={colors.textBody}>{r.value}</T>}
            </View>
          </View>
        ))}
        {editing ? (
          <TextInput
            multiline
            value={body}
            onChangeText={setBody}
            accessibilityLabel="What it says"
            placeholderTextColor={colors.textMuted}
            maxLength={4000}
            style={[styles.field, styles.edit]}
          />
        ) : (
          <ScrollView style={styles.words} nestedScrollEnabled>
            <T color={colors.textBody}>{draft.body}</T>
          </ScrollView>
        )}
      </View>
      <T variant="small" color={colors.textMuted}>
        {`${draftFrom(draft, approval)}. ${DRAFT_NOTE}`}
      </T>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  block: {
    borderRadius: radius.control,
    backgroundColor: colors.surfaceApp,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: metrics.rowPad,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  label: { width: metrics.labelWidth, flexShrink: 0 },
  grow: { flex: 1 },
  words: {
    maxHeight: metrics.bodyMax,
    paddingVertical: metrics.rowPad,
    paddingHorizontal: space.lg,
  },
  field: {
    color: colors.textBody,
    fontSize: type.read,
    padding: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceControl,
  },
  edit: { minHeight: space['2xl'] * 3, margin: space.sm, textAlignVertical: 'top' },
}));
