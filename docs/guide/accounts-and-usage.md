---
title: Accounts and usage
order: 2
---

Your agents run on your own engine accounts: your Claude plan for Claude Code, your ChatGPT plan
for Codex, or whatever providers you set up in OpenCode. The app doesn't sell or meter usage.

## Seeing your usage

The row at the bottom of the Agents sidebar shows what you have **left** across your accounts,
one bar, and when it next refills (for example "72% left · 2 accounts · Refills in 2d 4h").
Click it for the full view, also in **Settings → Accounts & usage**.

- Figures are only what the engine reports. The app never estimates a reading. If an account
  hasn't been read yet, it says so and leaves it out of the total.
- A reading that's more than a few hours old says when it was taken.
- Each account has its own page with its limits (for example 5-hour and weekly), when each
  refills, which agents used it this week, and **Where it went**.
- On a Claude plan, costs are shown in tokens. A dollar figure only appears for an API-key login,
  and it's labelled as API prices.
- OpenCode doesn't report plan limits, so no limits are shown for it, only tokens.

Limits come back by themselves. The app calls that the **refill**. When an account runs out, the
chat shows a quiet line with when it refills and a **Retry** button.

## Adding more accounts

You can add more than one Claude Code or Codex account. Agents use them in the order you set, and
a turn moves on to the next account when one runs out.

- Add one from **Settings → Accounts & usage → Add an account**, or from the usage-limit line when
  an account runs out.
- A Claude account's sign-in opens in a new Chrome window where no one is signed in: sign in there
  with the account you want to add. Your own browser stays signed in as it was. (Without Chrome it
  opens in your browser, as a Codex sign-in does: that signs in as whoever is already logged in to
  claude.ai or chatgpt.com there, so use a private window to add a different account.) If you add
  one that's already there, the app tells you and offers to try again.
- A Claude Code account signs in with Claude Code's own sign-in, the same one you used the first
  time, into a folder of its own. Claude Code keeps that sign-in; the app never sees or saves it.
  Claude Code needs to be version 2.1.318 or newer for this; the app asks you to update it if not.
- An account added by an older version of the app still works, and its page says **Sign in
  again**. Signing in again moves it to its own sign-in and deletes the saved token the app kept
  for it.
- The account you signed in with on this computer is always first in the list. You can rename it and
  move it down, but not remove it.
- With two or more accounts, you can pick which one new work starts on, and pin an agent to one
  account.

OpenCode's providers are managed in OpenCode itself, so there are no accounts to add for it here.

## Terminal tabs in your projects

With two or more Claude Code accounts signed in, the agent tabs in your projects use them too.

- A new Claude Code or Codex tab starts on the first account in your order that has room, the same
  one an agent would use.
- When a Claude Code tab runs out, it moves to your next account and carries on the same
  conversation: the tab restarts, picks up where it stopped, and says which account it moved to.
- **Settings → Accounts & usage → When a terminal tab runs out** sets this: **Switch on its own**
  (the default), **Ask me** (a bar on the tab offers **Continue on** the next account), or **Off**
  (tabs use the account you signed in with on this computer, as before).
- A project in another workspace keeps that workspace's own login and is never switched.
- If every account is out, the tab says when the first one is back.
- A Codex tab starts on an account with room, but isn't moved partway through: Codex tabs don't
  keep a conversation to pick up. After `/clear` in a Claude Code tab, its next limit is left to
  Claude Code's own message.

## From the menu bar

Click the app's icon in your Mac's menu bar to see your accounts in your order, with how much
each has left, when one that's out comes back, and which one runs next. Pick an account and
choose **Use this one first** to move it to the front.

**Claude Code in your own Terminal.** The app can't restart a chat running in another app's
window, so it watches instead. When a chat in Terminal hits its limit, you get a notification,
and the account is marked out so your agents skip it too. Then open the menu bar icon, choose
**Continue a Terminal chat**, pick the chat and **Continue on** another account. A new Terminal
window opens with the same conversation on that account. Close the old one.

## When every account is out

If Claude Code and Codex are both set up, you choose what happens when every account on one engine
is out: **Ask first** (the default: a card asks whether to carry on with the other engine),
**Carry on** with the other engine, or **Wait for the refill**.

## How agents use your limits

Pick a mode in **Settings → Accounts & usage**, or ask the Chief (it confirms on a card):

- **Normal** (the default). Before something big, an agent says in one line roughly what it will
  use and which account, then goes ahead.
- **Save my limits.** Agents ask before heavy work and send light work to lighter models. Routines
  that come due while every account they could use is over 90% wait for the refill, then run once.
- **Use it all before the refill.** Room that's about to expire gets used. When an account is near
  its refill with a good share left, the Chief hands out work from your **Ideas for leftover
  usage** list. Approvals still apply: nothing sends, spends or pushes without the usual card.

You also get one warning per limit window when the account in use passes 90%.

## Your free Mogbot account (optional)

You don't need an account to use the app. Everything on your computer and your phone works without one.

A free Mogbot account does one thing today: it lets your paired phone reach your computer through our
hosted phone relay, from anywhere, without Tailscale. Nothing in the app checks the account or
unlocks anything else with it.

- **Sign in:** during setup, or later in **Settings → Account**. Your browser opens; sign in with
  Google or an email code, then click **Link my Mac**.
- **What we keep:** your email and an account id, linked to your computer's key. For the relay itself:
  which computer, when, the IP address and how many bytes. Never what's in them: your phone's traffic
  is end to end encrypted and the relay can't read it.
- **Sign out:** **Settings → Account → Sign out**. Your computer is unlinked from the relay. If you set
  up Tailscale, your phone keeps working over it.
- **Delete your account:** **Settings → Account → Delete my account**. Your email and account id
  are removed from the sign-in service and the relay, this computer is signed out at once, and any other
  computer signed in to the same account within a day. Nothing on your computer is deleted.
  Phone notifications aren't part of your account: they belong to this computer and keep working.
  To remove them from the push service too, turn off **Phone notifications** in **Settings → Phone**.

Your phone doesn't sign in. It uses the relay because the computer it's paired with is signed in.
