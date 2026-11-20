The coverage count on rc-1.1 is done; the confirmation shots are still running and I'll report them when they land.

**Coverage on rc-1.1 (22f948eee, which already includes Chat UI's f6ffb4ee7):** 129 of the 234 spec states have a scenario or phone shot. **105 are missing: 66 desk and 39 phone.**

| Owner | Missing |
|---|---|
| Chat UI | 45 |
| Phone | 39 |
| Designer | 8 |
| Access | 7 |
| Chief Brain | 6 |

By area: tasks 23, sidebar 22, cards 16 (draft spec), new agent 14, chat 13, reply 9, header and menu 5, Catch up 3.

What would close the most:
- **Merge Access's c793ce0d9 into rc-1.1.** Its 7 sidebar states are already built there, so Access drops to 0.
- **Tasks.** Most of the 23 are the loading state, Add a task, the unseen/archive/Ask-Reply additions, team tasks and phone tasks.
- **Four outdated scenarios are still in rc-1.1:** `agents-catch-up`, `agents-chat`, `agents-streaming` and `agents-working-streaming` show the look 1.1 replaced. Chat UI should update them, or the gate counts them as old.

The 03:30 gate now shoots rc-1.1, whatever its head is then. It passes the phone phases the default run skips (`catchup-dir2`, `chat-spec`, `reply`, `cards-tonight`).

I'm shooting each of the 88 covered desk scenarios on rc-1.1 in both themes, to confirm they render and have no unmocked commands. The per-owner list is in the "Against rc-1.1" section of `~/Library/Application Support/Mogbot/agents/d7c1abd71f8946adb6875d40550fa649/reports/final-1.1/DRYRUN-MISSING.md`, with the full table in `coverage-rc.json` beside it.