---
title: Making an agent
order: 3
---

## Your Chief of Staff

The app opens on a chat with your Chief of Staff. It's there from the first launch, and it runs
the rest of your team: it creates agents, briefs them, hands them work, keeps track of what
they're doing, and deletes them when you say so. You can talk only to the Chief and let it run
everything else.

Each agent runs on Claude Code, Codex or OpenCode on your computer, on your own accounts. You choose which
one per agent once you have more than one set up.

In full screen, the app's little mascot sits at the top of the sidebar, where the window buttons
usually are. Its eyes follow your pointer. It blinks and looks around while things are quiet,
watches side to side while your agents work, and looks toward the bell and hops when one needs
you. Leave it alone with nothing going on and it falls asleep; move the pointer to wake it. Point
at it and it smiles, press it and it squishes, click it and it jumps, and click it a few times
fast and it gets dizzy.

## Make the agent's key, then say what it does

Click **New agent** (or press ⌘N). The first screen is the agent itself: a live preview of its key, a name, a colour (one row of the colours) and a **Faces | Icons** switch, with Faces first (34 faces drawn on the colour you picked; Icons has a search over about 2,000). **Create** works as soon as it has a name and opens a blank agent's chat.

Under the key, an optional box asks **What should it do?** Write a sentence and **Create** becomes **Drafting…** while the Chief drafts:

- a one-line role,
- a briefing (its instructions),
- up to four routines, each shown the way the app read it ("Every Friday at 16:00"),
- the apps it will need,

and the agent is made with them, ready for you to change in its editor. A routine the app couldn't read as a time is left out, never guessed. If the draft fails you can **Create blank** or **Try again**, and nothing you typed is lost. **More options…** opens the full editor (ready-made agents to start from, engine, model, project).

You can also ask the Chief in chat: "Make me an agent that…". It replies with the draft and asks
"Make it?" first.

There are also ready-made agents to start from (Research assistant, Inbox triage, Weekly review).

## The briefing

An agent's briefing is what it's told to do and how. Change it in the agent's editor (**Edit
agent**), or tell the Chief what to change. A new agent opens with a short welcome in its
own voice and three things you can tap to start.

## Edit agent

**Edit agent** is one sheet, laid out like Settings. At the top is the agent's key (click it to
change its colour, its face or icon, and its shortcut key), its name, and what it runs on. Under
Colour, **Face** or **Icon** picks which it wears: one of 34 faces, or any of over 2,000 icons. Three tabs sit under
it: **Agent**, **Memory** and **Usage**.

On **Agent**, the rows are grouped:

- **What it does**: its name and its one line.
- **What it should know**: its briefing.
- **How it runs**: Claude Code, Codex or OpenCode (a choice once two are set up), the model, and
  the project it works in. Change the model or effort from **Model** in the agent's **⋯** menu; it applies from its next
  message. The message box is one bar with a **+** to attach files, your words, the microphone and Send.
- **On its own**: its independence, what it may always do beyond its level, and the Admin switch. An admin (the Chief by default) answers its team's requests that aren't sends: local work, and web or app reads. Sending, posting, spending, pushing, deleting, logins and the browser stay yours.
- **What it can use**: its apps and access, and its skills.

A row with a › opens its own page in place; **‹ Edit agent** comes back. Independence, Admin,
apps and skills change the moment you change them. The name, line, briefing, model and project
save when you press **Done**; **Cancel** leaves them as they were. **Delete agent** is the red row
at the bottom.

The phone's agent sheet uses the same groups and words.

## Memory

Each agent keeps its own memory: things it learns about you and the work. Memory is shared across
all of that agent's conversations.

- See and edit it in the agent's editor, under **Memory**. Add, change or delete entries; there's
  an Undo.
- Hover a message and choose **Remember this** to add it as one line, which you can edit before
  it's saved.

## Conversations

Each agent can have several conversations, each its own thread, all sharing one memory. Switch or
start one from the agent's **⋯** menu.

On your own messages you can:

- **Edit and resend.**
- **Fork from here**, to try a different direction in a new conversation.
- **Rewind to here.** What comes after folds away; it isn't deleted. Work the agent already did
  outside the chat (files, sends) isn't undone.

When an agent works in its own copy of a project, Rewind to here and Edit and resend can also put
the code back: tick **Also undo the code changes since then** (it starts unticked). The line under
it says what goes back. What's undone is kept in git, not deleted, and anything the agent sent
stays sent. You only see the option when the app knows exactly where the copy stood before that
message, and when no other conversation has worked in the copy since. It isn't on the phone or on
Fork from here.

They're in the **…** beside your message (or a right-click on it). While the agent is working,
Edit and resend and Rewind to here wait, and the menu says so; Fork from here always works.

An agent works on one thing at a time. Messages sent while it's busy wait their turn.

## Dictation

Click the microphone in the message box (or press ⌘⇧D, or hold ⌥Space) and talk. No words show
while you talk: the box becomes one row, with how long it's been and your voice moving as a wave
where the words would be. Until your voice reaches it, the row says **Listening…** quietly. If the mic hears nothing for eight seconds once it is running, the row says **Can't hear you · check the mic** and names
the microphone it's using, so you never talk for minutes into a dead mic; if it hears sound but no
words for ten seconds (a muted or wrong input), it says that instead. **Enter** (or Send) stops and
sends; **Esc** cancels. The phone works the same way.

When you stop, your computer writes what you said out with Whisper, a speech model that runs on your
computer, primed with your agents' and projects' names. Then a quick pass by Claude (Haiku, with no
tools) fixes only misheard names and punctuation, using the conversation you're in. The row says
**Tidying…** for a few seconds, then the words appear in the box. Long dictations are written out as
you go, a piece at a time, so stopping after five minutes only waits for the last bit. Send while it's
still listening or tidying, on the Mac or the phone, and the message moves up into the chat at once,
dimmed, with a little wave in it and **Tidying…** under it; it goes by itself once the words are in,
and the box is free for your next message. If Claude Code isn't set up, you get Whisper's words alone.
If the words can't be written out, the recording stays on your computer and the box says **Couldn't
write that out · Try again**.

**Your words.** Settings → Agents → Dictation keeps the names and terms dictation should always get
right. Add one there, or just fix it: when you change the same dictated word twice before sending
("mog about" to "Mogbot"), it's added on its own, with Undo. Whisper and the names pass get your
words and the fixes you've made, on the desk and for the phone's dictation. Remove a word and it isn't
learned again unless you add it back.

The speech model is a one-time 574 MB download, fetched the first time you dictate. It loads when you start talking (or open a chat on your phone) and stays loaded for 10 minutes after your last dictation, so the better words come quickly. On Windows and
Linux dictation waits for it ("Getting dictation ready"); on a Mac you get the Mac's own recognition
meanwhile.
Your recording never leaves your computer. Only the written words go to the names pass, on your own
Claude account.

From the phone, the same happens on your computer: the phone sends the recording, and the better
words come back.

If your default microphone is a Bluetooth headset
(AirPods and the like), dictation listens through your computer's built-in microphone instead, so your
headphones keep playing music at full quality rather than switching to call mode.

## Folders

Once you have a few agents, you can put them in folders, for example Website, SEO, Design and
Outreach. Folders are optional; until you make one, your agents stay in one list.

- Right-click an agent and choose **New folder…** to make a folder with that agent in it. You
  can also ask the Chief ("put Lead Gen and Social Posts in an Outreach folder").
- Drag an agent onto a folder, or use **Move to …** in its menu. **Remove from folder** takes it
  out.
- Right-click a folder's name to rename or remove it. Removing a folder keeps its agents.
- **Pinned agents** sit above your folders, or first inside their own folder. To switch, use a
  folder's menu or ⌘K.
- Your Chief of Staff always stays at the top, outside any folder.

Folders are kept on your computer, so your phone and the Chief see the same ones. ⌘K → **Show
agents in one list** hides them in that window, and **Group agents by project** groups by
project instead.

## Share an agent as a recipe

A recipe is an agent's definition without anything it knows: its role, briefing, routines (as
words), the apps it uses by name, its look, and a suggested independence level.

- Choose **Share as a recipe…** from the agent's menu, or ask the Chief.
- The sheet shows exactly what's in the file, and counts what was removed (emails, phone numbers,
  file paths, anything that looks like a key).
- **Never in a recipe:** memory, conversations, logins, keys, or which accounts it uses.
- **Save file…** or **Copy as text**.

To use a recipe, drop the file on the Agents window, or paste it into the Chief's chat. You review
it on one card before anything is made. Its routines arrive paused, and its suggested independence
is only applied if it's stricter than your team's.
