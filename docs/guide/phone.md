---
title: Your phone
order: 7
---

The phone app is a full way in to your agents when you're away from your desk: chats, approvals,
result cards, routines, starting new agents, voice messages and more. Your agents still run on your
computer (your Mac or PC), so it needs to be awake with the app open.

## Get the app

The iPhone app is free on the [App Store](https://apps.apple.com/app/mogbot/id6833062484). The desktop
app links it too, and shows a code you can scan with your iPhone's camera.

There's no Android app to download yet.

## How your phone reaches your computer

There are two ways. You can use either, or both.

- **Our phone relay (when your computer is signed in).** Sign in to a free Mogbot account on the computer
  (see [Accounts and usage](accounts-and-usage.md)) and your phone reaches your computer from anywhere,
  with nothing else to set up. Everything between them is end to end encrypted with your computer's
  key; the relay can't read it or pretend to be your computer.
- **Your own Tailscale.** Free, and no Mogbot account needed. Install Tailscale on the computer and on
  the phone, and **sign in to both with the same Tailscale account** before you pair. That's the one
  thing that makes pairing fail without a clear reason.

If both are set up, the phone tries the relay first and falls back to Tailscale. When one is slow to
answer (Tailscale waking up on the phone, say), the phone tries the other at the same time after a
few seconds and keeps whichever answers first.

A picture that can't be fetched says "Image not available"; tap it to try again. Opened full
screen, a picture starts from the thumbnail you tapped, shows a spinner while the full one comes,
and if it doesn't load says so and keeps trying while it's on screen.

## Pair your phone

1. **On your computer:** click **Pair your phone** at the bottom of the sidebar (or open
   **Settings → Phone**). The app walks you through each step, including turning on phone access
   and, if you're not signed in, Tailscale on both devices. Then it shows a code.
2. **On your phone:** open the app and tap **Scan the code**. It asks "Pair with *your computer's name*?"
   first; tap **Pair**.
3. **On your computer:** click **Allow**. Both sides say **Paired**.

Your phone checks that it's really talking to your computer before it sends anything. If you scan a code
from a different computer than the one you paired with, it says it isn't
yours and stops.

A short drop is silent: the phone reconnects in the background, keeps showing what it had, and holds what you send until your computer answers. Only after about three minutes without a connection does it say so. Then it shows a short checklist of what to look at: the computer awake
with the app open, Tailscale on with the same account (when you use Tailscale), and the phone
paired.

Agents work on your computer, not on the phone: closing the app never stops them. A turn that
runs past half a minute says so under its working line ("Keeps running on your Mac, even with
this app closed"). Tables too wide for the screen read row by row, each column named beside its
value.

Chrome asks for its own Allow, in a window on your computer, the first time an agent uses a site
in your Chrome. The phone can't show or answer that window, so a step in your Chrome that sits for
20 seconds says "Chrome may be waiting for you to click Allow on your Mac", and the agent's row in
the list says "Allow in Chrome?". While your Mac's screen is locked Chrome can't show that window at
all, so the step says your Mac is locked instead and the row says "Unlock your Mac to go on".
The same lines show on the desk. Two ways to stop this happening: add Mogbot for Chrome (Settings →
Agents → Let agents use your Chrome), which never shows that window, or turn on **Keep the screen
on while agents work** (Settings → Agents, off by default), which keeps the screen from sleeping
and locking while an agent is busy and lets it lock as usual once they're idle. It can't stop a
lock you ask for, like closing the lid.

## What the phone can't do

Pushing to git, deleting agents, and a few room settings are done on the computer.

## Notifications

On a Mac, you get macOS notifications and a Dock badge when an agent needs you, finishes, or a
routine posts. Change them in **Settings → Notifications**.

While the phone app is connected to your computer, it gets the same alerts: approvals and anything that
needs you right away, plus replies. The badge on the app icon matches the Mac's Dock badge, and an
alert goes away once you've handled it on either device.

Approvals always come through, even during quiet hours. Other alerts are held during quiet hours
and summed up in one when they end.

If the app on your computer is too old to wake the phone, the phone's Settings says **Update your
Mac** (or computer): until you do, notifications arrive only while the phone app is open.

While you dictate on the phone, its screen stays on, so it can't lock mid-sentence and lose your
words. It locks as usual once you stop.

## A project's site on the phone

On the Projects tab each project has a **Preview** row. Tap **Show the site** and your computer takes a picture of the site it is running; the picture sits right on the project's card, at Phone or Desktop width, with when it was taken. Tap the circular arrow for a new one, or the picture to open it full size. It needs the site running on your computer; if it isn't, the card says so.

Settings on the phone also lists your **Dictation words**, the names and terms dictation should always get right. They are kept on your computer (Settings → Agents → Dictation there). The phone shows them read-only, with what each was heard as, and lets you remove one; adding stays on the computer.
