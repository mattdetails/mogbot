The dry run on next-1.0.23 at b47a80518 is done. Of 234 spec states, 95 have a capture on the release branch and 139 are missing. 23 of those already have scenarios on unmerged branches and only need the merge; 116 need a scenario or the build itself. Everything is in `~/Library/Application Support/Mogbot/agents/d7c1abd71f8946adb6875d40550fa649/reports/final-1.1/DRYRUN-MISSING.md`, with the full table in `coverage.json` beside it.

**Biggest gap:** Chat UI's `catchup-dir2` (head `f6ffb4ee7`) and Designer's sidebar (`8983931d4`) aren't in next-1.0.23. If they don't land by 03:30, desk Catch up, the reply pill, the composer, the 720/960 columns, New agent and the sidebar foot and drawer will show as old or missing. Phone's work, task tools and Motion are in.

**Missing, by owner:**

| Owner | Missing | Need merge | Need scenario or build |
|---|---|---|---|
| Chat UI | 75 | 20 | 55 |
| Phone | 39 | 0 | 39 |
| Designer | 11 | 3 | 8 |
| Access | 7 | 0 | 7 |
| Chief Brain | 7 | 0 | 7 |

Chat UI, Phone, Designer and Access have their lists. Chief Brain's didn't go (one reply can only hand work to four agents). Its 7 states all need task fixture data: the tasks list, plus the sidebar row's "5 to do", "Idle" and "14 to do · Busy" with Busy in amber. They're under "### Chief Brain" in the file. Please pass them on, or I'll send them on my next turn.

**Before 03:30:**
- **Tasks aren't built** on desk or phone, so 29 states can't be shot whatever happens.
- **Old-look scenarios.** Eight scenarios still show the look 1.1 replaced: Catch up, chat, composer, header, New agent, search and the two streaming ones. Updating them is cheaper than adding new ones.
- **Phone phases.** The default phone run skips the `catchup-dir2`, `chat-spec`, `reply` and `cards-tonight` phases. I'll pass them explicitly at 03:30.
- **Two broken captures** in both themes: `agents-approval-expired` and `agents-heavy-inflight` don't render their subject, so their shots aren't evidence.
- **Motion** is a code check only, not judged as fails tonight. The Catch up bar animates `width`, and the composer and an arrived reply animate `margin-bottom` and `min-height`. Five phone files read Reduce Motion once at launch. Frame strips come at 03:30.

The two closed diffs (the drawer focus ring and the dark selected/border clash) are recorded as closed and won't come back. Desk shots of the release branch are about halfway through and the phone run is still going; I'll add the clipped-text and contrast results to the file when they finish.