---
title: Independence
order: 4
---

**Independence** is how much your agents do without asking you. It's one slider with four stops,
from "Asks a lot" to "Just does it".

| Stop | What it does on its own |
| --- | --- |
| **Careful** | Reads and looks around; asks before bigger changes. |
| **Steady** | Reads and edits; asks before running changes or anything leaving your computer. |
| **Bold** (where a new install starts) | Does local work on your computer; asks before anything leaves it. |
| **Unleashed** | Does anything you ask; stops before money, keys, deleting for good and production. |

## Setting it

- For the whole team: **Settings → Independence**, or on the phone in Settings.
- For one agent: the same slider in that agent's editor. "Same as team" puts it back. An agent set
  differently from the team shows a small label in the sidebar.
- From chat: "Make Finance careful" or "Put Social Posts on Unleashed". Raising a level asks you on
  a card first. Lowering it applies straight away, with a line in the chat.

If you sound tired of being asked, or unhappy that something went ahead, the Chief may offer a
change once, in one line. You can ignore it.

## Turning on Unleashed

Moving to Unleashed (on the slider, on the phone, or by asking the Chief) first shows a warning:
Unleashed sends and posts as you, pushes your branches and changes files without a card; it still
asks before spending money, using your passwords or keys, deleting for good, pushing to production or
`main`, and changing how your Mac starts up. You confirm with **Turn on Unleashed**, or keep
the level as it was. Lowering a level never asks.

At Bold and Unleashed, opening something in your browser (a LinkedIn post, a Slack message, a GitHub
issue, a tab) never asks, even when its name has a word like "Post" or "Merge" in it. Only the
button that does the send asks, and only at Bold.

## What always asks

At every stop, agents ask before:

- spending money,
- using your passwords or other credentials,
- deleting something for good.

Even at Unleashed they also ask before pushing to production or a protected branch (like `main`),
publishing a release or package, changing settings that affect what others see (domains, DNS,
repository visibility), and anything that would keep running on your computer by itself (like a launch
agent or a change to your shell profile).

At Bold, a picture, video or PDF the agent made in its own folder, or a picture or video in your
projects folder (where agents make and render work), goes onto a page (a post's image or video)
without a card: you already OK'd the post's words. Uploading any of your other files, or a PDF from
a project, still asks.

## Trust per repository

You can trust one GitHub repository differently from the rest: "in the Mogbot repo you can open issues
and merge without asking, in WorkSpan never." Tell the Chief or the agent in chat. **Trusted**: issues
and pull requests in that repo (create, comment, review, merge) stop asking, at every level. **Never**:
changes and pushes in that repo always ask, even at Unleashed. A repo's settings, releases, deleting
and pushes aren't covered by trusting it. Work answering outside text never gets a trusted repo's
shortcut.

## Text from outside

When an agent is working on something that came from outside (a web page, an email, a message from
someone else, a GitHub comment), it never runs above Steady for that work, whatever its own level.
After reading outside content, sending data to another site or installing a new package asks you
for the rest of that conversation.

## Approval cards

When an agent needs your OK, a card appears in its chat showing exactly what it wants to do: the
command, the file, the site or the message. The agent's row says "Needs your OK" while it waits,
and opening its chat takes you to the card, in whichever of its conversations it was asked, however
far back it is. **Review** on the "needs your OK" bar does the same.

- **Allow** or **Deny**. Some cards also offer **Always allow** for that kind of thing (for
  example, web searches). When an agent reads one of your apps (searching your Gmail, say), it
  offers **Always allow reading your Gmail**: every read of that app stops asking, while sending,
  changing or deleting anything there still asks each time. On the phone it sits on its own line
  under Allow.
- A card for one of your apps lists what it will send as plain lines (To, Subject, then the
  text), each value exactly as it goes, never as code.
- Answer from the computer, the phone, or by typing "yes" or "approve it" in the chat when there's
  exactly one card open.
- A card can be answered once. If you answer on the phone and the computer at the same moment, only the
  first answer counts and the other says "Already answered".
- A card waits for you, even after the agent's turn ends or the app restarts. Allow it later and
  the agent picks that exact step back up on its own, with a line saying so. Pressing Stop withdraws
  an agent's open cards; one left unanswered for three days closes by itself.
- To stop accidental clicks, Allow is inactive for a moment after a card appears, and typing in the
  message box never answers a card.

**One yes for a whole plan.** When an agent has several outward steps ahead (say, a redeploy, an
issue and two comments), it can list them on one card, "Do these under your name?". One Allow
covers exactly those steps for an hour. It never covers money, credentials, deleting or force
pushes.

Every action taken without a card leaves a line in **What it did**, under the agent's reply. At
Unleashed, the turn also ends with one line listing what was sent or pushed without asking.

## Passwords and keys

Agents never ask for a password in the chat. When one needs a key or token, it shows a masked card,
and what you type goes into your Mac's Keychain, not the chat. To connect a service, you get a
sign-in card: connect the app, use your own browser, or paste an API key.

## Pictures in your Chrome

Through Mogbot for Chrome an agent can attach a picture to a post or message, the way pasting it
would: a PNG, JPEG, GIF or WebP from its own folder or a project. It counts as an upload, so below
Unleashed it asks you first on a card. The picture goes on the clipboard for a moment, and the
text that was there comes back after.
