/**
 * The draft card (`AgentDraftCard`): one message to send as you, in one
 * recessed block (To, CC, Subject, the words), with Discard, Edit, Draft in
 * Gmail and Send as real buttons. Every state Designer diffs: the standard
 * email, no CC, five CCs, a 3,000-character body, no subject, a reply, a
 * 390px-wide window, a Slack reply, and an email whose account the app doesn't
 * know. Fictional throughout. Capture each with `--theme light` too.
 */

import type { Scenario } from '../types';
import { AGENTS_TAB, messagesFor, msg, overview } from './agents';

const VIEW = { width: 1280, height: 1200 };
const NARROW = { width: 390, height: 1100 };

const BODY =
  'Hi Aurelie,\n\nAgents are the team, projects are where the work lives. An agent can be tied to a project and works in its own copy, so your folder stays yours.\n\nJulian';

const LONG = Array.from(
  { length: 24 },
  (_, i) =>
    `${i + 1}. Agents are the team and projects are where the work lives, so an agent tied to a project works in its own copy and your folder stays yours.`
).join('\n\n');

const emailCard = (
  action: {
    target: string;
    text: string;
    summary?: string;
  },
  sendFrom?: string,
  status: 'pending' | 'allowed' = 'pending'
) =>
  msg('approval', '', 3, {
    approval: {
      requestId: 'mail1',
      title: 'Do these under your name?',
      detail: '',
      status,
      ...(sendFrom ? { sendFrom } : {}),
      plan: {
        actions: [
          { kind: 'send', summary: action.summary ?? 'Email Aurelie about the beta', ...action },
        ],
      },
    },
  });

const slackCard = (accountName?: string) =>
  msg('approval', '', 3, {
    approval: {
      requestId: 'slack1',
      title: 'Reply in Slack?',
      detail: 'Agents are the team, projects are where the work lives.',
      status: 'pending',
      slackReply: {
        channel: 'C0BETA',
        threadTs: '1700000004.000100',
        place: '#mogbot-beta-squad',
        text: 'Agents are the team, projects are where the work lives. An agent can be tied to a project and works in its own copy, so your folder stays yours.',
        ...(accountName ? { accountName } : {}),
      },
    },
  });

const scenario = (
  id: string,
  title: string,
  looksRightWhen: string,
  card: ReturnType<typeof msg>,
  viewport = VIEW,
  more: Partial<Scenario> = {}
): Scenario => ({
  id,
  title: `Agents — draft card: ${title}`,
  looksRightWhen,
  requires: '.agent-draft',
  openSelector: AGENTS_TAB,
  steps: [{ click: '[data-agent-id="chief"]' }],
  viewport,
  commands: {
    agents_overview: overview(),
    agents_messages: (args: Record<string, unknown>) =>
      args.agentId === 'chief'
        ? [msg('user', 'Reply to Aurelie about the beta, cc Sam.', 6), card]
        : messagesFor(args),
  },
  ...more,
});

const COMMON =
  'In the card: the title names who and where; one recessed block holds the rows (a 72px label column, 11px above and below each row, a hairline between them) and the words below it with the same padding; “From … · goes out as you” under it, then only “These exact words go out under your name.”; the buttons are one height and right-aligned with 8px between: Discard (ghost), Edit and Draft in Gmail (secondary), Send (neutral, never accent). No underlined links; 14px from the title to the first field.';

const ADDRESS = 'Aurelie Martin <aurelie@example.com>';

// Built once: a card re-read with a new id would remount and lose its state.
const FAILED_CARD = emailCard(
  { target: ADDRESS, text: `Subject: Beta squad\nCC: sam@example.com\n\n${BODY}` },
  'julian@example.com'
);
const FAILED_CHAT = [msg('user', 'Reply to Aurelie about the beta, cc Sam.', 6), FAILED_CARD];

export const agentsDraftScenarios: Scenario[] = [
  scenario(
    'agents-email-draft',
    'the standard email',
    `Title “Email to Aurelie Martin · Gmail”; To, CC, Subject rows; “From julian@example.com · goes out as you”. ${COMMON}`,
    emailCard(
      {
        target: ADDRESS,
        text: `Subject: Beta squad\nCC: sam@example.com\n\n${BODY}`,
      },
      'julian@example.com'
    )
  ),
  scenario(
    'agents-email-draft-no-cc',
    'no CC',
    `No CC row; the To row carries a “+ Cc” button at its right. ${COMMON}`,
    emailCard({ target: ADDRESS, text: `Subject: Beta squad\n\n${BODY}` }, 'julian@example.com')
  ),
  scenario(
    'agents-email-draft-many-cc',
    'five CCs',
    `The CC row wraps its five addresses inside its column without widening the block. ${COMMON}`,
    emailCard(
      {
        target: ADDRESS,
        text: `Subject: Beta squad\nCC: sam@example.com, priya@example.com, luke@example.com, cade@example.com, bradford@example.com\n\n${BODY}`,
      },
      'julian@example.com'
    )
  ),
  scenario(
    'agents-email-draft-long-body',
    'a 3,000-character body',
    `The words scroll inside the block at about 320px; the card does not grow past it. ${COMMON}`,
    emailCard(
      { target: ADDRESS, text: `Subject: The long one\nCC: sam@example.com\n\n${LONG}` },
      'julian@example.com'
    )
  ),
  scenario(
    'agents-email-draft-no-subject',
    'no subject',
    `No Subject row; the hairline under the last row still separates the words. ${COMMON}`,
    emailCard({ target: ADDRESS, text: `CC: sam@example.com\n\n${BODY}` }, 'julian@example.com')
  ),
  scenario(
    'agents-email-draft-reply',
    'a reply',
    `Title “Reply to Aurelie Martin” (the subject starts “Re:”). ${COMMON}`,
    emailCard({
      target: ADDRESS,
      summary: 'Reply to Aurelie about the beta',
      text: `Subject: Re: Beta squad\nCC: sam@example.com\n\n${BODY}`,
    })
  ),
  scenario(
    'agents-email-draft-unknown-account',
    'an account the app doesn’t know',
    `Title “Email to Aurelie Martin” (no “· Gmail”) and the line under the block says only “goes out as you”: no account is guessed. ${COMMON}`,
    emailCard({ target: ADDRESS, text: `Subject: Beta squad\n\n${BODY}` })
  ),
  scenario(
    'agents-email-draft-narrow',
    'a 390px-wide window',
    `At 390px the buttons wrap onto a second row, right-aligned, and none is clipped. ${COMMON}`,
    emailCard(
      { target: ADDRESS, text: `Subject: Beta squad\nCC: sam@example.com\n\n${BODY}` },
      'julian@example.com'
    ),
    NARROW
  ),
  scenario(
    'agents-email-draft-slack',
    'a Slack reply',
    `Title “Reply in #mogbot-beta-squad · Slack”; one “In” row and the words; “From robin · Acme · goes out as you”; Discard, Edit, Send. ${COMMON}`,
    slackCard('robin · Acme')
  ),
  scenario(
    'agents-email-draft-slack-unknown-account',
    'a Slack reply, account unknown',
    `As the Slack reply, with “goes out as you” alone under the block. ${COMMON}`,
    slackCard()
  ),
  scenario(
    'agents-email-draft-failed-send',
    'a send the Mac refused',
    `After pressing Send the card stays pending with every word kept, and under the block a warning line “Couldn’t send. Your words are kept.”; the buttons are live again. ${COMMON}`,
    FAILED_CARD,
    VIEW,
    {
      requires: '.agent-draft__failed',
      steps: [{ click: '[data-agent-id="chief"]' }, { click: '.agent-draft [data-allow]' }],
      commands: {
        agents_overview: overview(),
        agents_messages: (args: Record<string, unknown>) =>
          args.agentId === 'chief' ? FAILED_CHAT : messagesFor(args),
        agents_answer_approval: () => {
          throw new Error('Your Mac didn’t answer.');
        },
      },
    }
  ),
  scenario(
    'agents-email-draft-sent',
    'sent',
    'The card has collapsed to its outcome line: the title and “Sent to Aurelie Martin · <agent> is carrying on”, with the request one click away. There is no Undo: a sent email can’t be taken back from here, and no time is shown because the app records none for the send.',
    emailCard(
      { target: ADDRESS, text: `Subject: Beta squad\nCC: sam@example.com\n\n${BODY}` },
      'julian@example.com',
      'allowed'
    )
  ),
];
