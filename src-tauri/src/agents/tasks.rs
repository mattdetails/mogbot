//! Each agent's own task list, so an ask never drops, and the Chief's view of
//! all of them (the board).
//!
//! Observed (2026-11-18 calls): an agent was asked something, got busy with
//! another thing, and the ask was simply gone; two agents with near-identical
//! jobs ("Apollo PM", "Apollo Finances") both got the same update; the user
//! couldn't tell who was overloaded or stuck.
//!
//! **One list per agent**, `<home>/tasks.jsonl` (one task a line, beside `messages.jsonl`), written only through
//! the `task_add` and `task_update` tools and the app's own hooks, kept by the app, not the
//! model: an ask from another agent (`message_agent`) lands on the helper's
//! list the moment it is delivered, and is settled when that helper's turn
//! answers it ([`answered`]) or ends in an error ([`failed`]). The agent adds
//! the user's asks it can't finish in one reply with the `tasks` tool, and
//! marks them done. Every turn's briefing ends with its own open list
//! ([`briefing_for`]), so a restart or a long chat never loses one.
//!
//! **The Chief manages from it.** Its briefing carries the board ([`board`]):
//! each agent's job in a few words, how many asks are open and how old, who is
//! overloaded, what is stuck. [`similar_elsewhere`] tells it, as it hands out
//! work, that another agent already has the same thing open (the Apollo
//! problem). [`tick`] chases: an ask still open after [`CHASE_AFTER_MS`] is
//! nudged once more to its agent, at most [`MAX_CHASES`] times, never while
//! the agent is busy, driven by the user, in quiet hours or in "Save my
//! limits"; after the last nudge the Chief's chat gets a line saying it's
//! stuck, so nothing goes silent.
//!
//! "Overloaded" is a plain rule, shown as such: [`OVERLOAD_OPEN`] or more open
//! asks, or [`OVERLOAD_AGE_MS`] on the oldest with three or more open.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use super::store::{self, AgentRef, OrLog};

/// Open asks at which an agent counts as overloaded.
pub const OVERLOAD_OPEN: usize = 10;
/// One open line this long with no movement counts as overloaded.
pub const OVERLOAD_AGE_MS: i64 = 24 * 3_600_000;
/// An ask from another agent is nudged when open this long (and again after
/// the same wait).
pub const CHASE_AFTER_MS: i64 = 3 * 3_600_000;
/// The user's own asks on an agent's list wait longer before a nudge.
pub const CHASE_USER_AFTER_MS: i64 = 8 * 3_600_000;
/// Nudges one task gets before it is called stuck.
pub const MAX_CHASES: u32 = 2;
/// A line is chased at most once a day.
pub const CHASE_AGAIN_MS: i64 = 24 * 3_600_000;
/// Most tasks kept per agent (done and dropped ones age out first).
const KEEP: usize = 60;
/// A finished task stays listed this long.
const DONE_KEEP_MS: i64 = 3 * 24 * 3_600_000;
/// Longest title, in characters.
const TITLE_CHARS: usize = 160;
/// The board's most characters in a briefing.
pub const BOARD_CAP: usize = 1_400;
/// An agent's own list's most characters in its briefing.
pub const OWN_CAP: usize = 900;
const TICK_EVERY_MS: i64 = 5 * 60_000;

pub const TOOL: &str = "tasks";

pub const DESCRIPTION: &str = "Read task lists, kept by the app so an ask never drops. `action`: `list` (yours, open first; give `agent` for a teammate's) or `board` (every agent's open lines and who is busy). Add and change lines with `task_add` and `task_update`. Check `board` before handing work out, so two agents don't do the same thing.";

pub const ADD_TOOL: &str = "task_add";
pub const UPDATE_TOOL: &str = "task_update";
pub const ASSIGN_TOOL: &str = "task_assign";

/// Open lines one agent may have on another's list at once.
pub const MAX_ASSIGNED: usize = 5;

pub const ADD_DESCRIPTION: &str = "Put an ask on your task list before you reply: one line in the user's words (a user ask you can't finish in this reply, or a step you owe). Asks other agents send you are added for you.";
pub const UPDATE_DESCRIPTION: &str = "Move one of your task lines: `state` doing (one at a time), next, waiting (it waits on the user: say what in `note`), done, or dropped (`note` says why: a line is never removed without a reason). Mark an ask `done` once you've delivered it.";

pub const ASSIGN_DESCRIPTION: &str = "Put a task on a teammate's list (it lands in their Next with \"from you\", and their chat says so; they aren't woken). Use it to hand over a job they own without messaging them; use `message_agent` when you need an answer. `agent` is their name, `title` the job in one line, `note` optional context. Not for yourself (use `task_add`); at most 5 open on one teammate. They can hand it back with a reason, which comes to you as a message.";

pub fn assign_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "agent": { "type": "string", "description": "The teammate's name." },
            "title": { "type": "string", "description": "The job, one line." },
            "note": { "type": "string", "description": "Optional context for them." }
        },
        "required": ["agent", "title"]
    })
}

pub fn schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "action": { "type": "string", "enum": ["list", "board"] },
            "agent": { "type": "string", "description": "For list: a teammate's name." }
        },
        "required": ["action"]
    })
}

pub fn add_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": { "title": { "type": "string", "description": "What's owed, in the user's words, one line." } },
        "required": ["title"]
    })
}

pub fn update_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "id": { "type": "string", "description": "The line's id from list." },
            "state": { "type": "string", "enum": ["doing", "next", "waiting", "done", "dropped"] },
            "note": { "type": "string", "description": "For waiting: what it waits on. For dropped: why." }
        },
        "required": ["id", "state"]
    })
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum State {
    /// Being worked on now. One at a time per agent.
    Doing,
    Next,
    /// Blocked on someone or something (`waiting_on`).
    Waiting,
    /// Nudged [`MAX_CHASES`] times and still open, or its turn ended in an error.
    Stuck,
    Done,
    Dropped,
}

impl State {
    pub fn is_open(self) -> bool {
        matches!(
            self,
            State::Doing | State::Next | State::Waiting | State::Stuck
        )
    }
}

/// Where an ask came from.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    /// The user, said in the agent's chat (added by the agent).
    User,
    /// Another agent's `message_agent` request.
    Agent,
    /// The agent's own step.
    Own,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub source: Source,
    /// The agent that asked, when it was one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<AgentRef>,
    pub state: State,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub waiting_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default)]
    pub chased: u32,
    #[serde(default)]
    pub last_chased_at: i64,
}

/// What the desk and the Chief see of one agent's list.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Load {
    pub agent_id: String,
    pub name: String,
    pub role: String,
    /// What it is doing this moment, as its status says it, or none.
    pub doing: Option<String>,
    pub open: Vec<Task>,
    /// Finished or dropped in the last days, newest first.
    pub recent: Vec<Task>,
    pub overloaded: bool,
    /// Why, in words, when overloaded.
    pub overloaded_why: Option<String>,
    pub stuck: usize,
}

static LOCK: Mutex<()> = Mutex::new(());

fn path(agent_id: &str) -> Option<std::path::PathBuf> {
    Some(store::agent_home(agent_id).ok()?.join("tasks.jsonl"))
}

fn read(agent_id: &str) -> Vec<Task> {
    path(agent_id)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|raw| {
            raw.lines()
                .filter_map(|l| serde_json::from_str::<Task>(l).ok())
                .collect()
        })
        .unwrap_or_default()
}

fn write(agent_id: &str, tasks: &[Task]) {
    if store::is_gone(agent_id) {
        return;
    }
    let Some(p) = path(agent_id) else { return };
    let lines: Vec<String> = tasks
        .iter()
        .filter_map(|t| serde_json::to_string(t).ok())
        .collect();
    let mut raw = lines.join("\n");
    raw.push('\n');
    store::write_atomic(&p, raw.as_bytes()).or_log("an agent's task list");
}

fn edit<T>(agent_id: &str, f: impl FnOnce(&mut Vec<Task>) -> T) -> T {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut tasks = read(agent_id);
    let out = f(&mut tasks);
    prune(&mut tasks, store::now_ms());
    write(agent_id, &tasks);
    out
}

/// Old finished tasks leave; the list stays bounded. Pure.
pub fn prune(tasks: &mut Vec<Task>, now: i64) {
    tasks.retain(|t| t.state.is_open() || now - t.updated_at < DONE_KEEP_MS);
    if tasks.len() > KEEP {
        // Oldest finished first.
        let mut finished: Vec<(i64, String)> = tasks
            .iter()
            .filter(|t| !t.state.is_open())
            .map(|t| (t.updated_at, t.id.clone()))
            .collect();
        finished.sort();
        let mut over = tasks.len() - KEEP;
        for (_, id) in finished {
            if over == 0 {
                break;
            }
            tasks.retain(|t| t.id != id);
            over -= 1;
        }
    }
}

/// A title from a free-text ask: its first sentence or line, one line,
/// clipped. Pure.
pub fn title_of(text: &str) -> String {
    let line = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    let first = line
        .split_inclusive(['.', '?', '!'])
        .next()
        .unwrap_or(line)
        .trim();
    clip(first, TITLE_CHARS)
}

fn clip(s: &str, n: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= n {
        return t.to_string();
    }
    let kept: String = t.chars().take(n.saturating_sub(1)).collect();
    format!("{}…", kept.trim_end())
}

fn words(s: &str) -> std::collections::HashSet<String> {
    const STOP: &[&str] = &[
        "the", "a", "an", "to", "of", "for", "and", "on", "in", "it", "is", "this", "that", "with",
        "please", "can", "you", "your", "i", "we", "me", "my", "be", "at", "up", "as", "or",
    ];
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 1 && !STOP.contains(w))
        .map(str::to_string)
        .collect()
}

/// How alike two asks are, 0..=1: the share of words they have in common
/// out of the shorter one. Pure.
pub fn likeness(a: &str, b: &str) -> f32 {
    let (wa, wb) = (words(a), words(b));
    let shorter = wa.len().min(wb.len());
    if shorter < 2 {
        return 0.0;
    }
    wa.intersection(&wb).count() as f32 / shorter as f32
}

/// At or above this, two asks are the same ask.
pub const SAME: f32 = 0.7;

fn new_task(title: String, source: Source, from: Option<AgentRef>, now: i64) -> Task {
    Task {
        id: store::new_id()[..8].to_string(),
        title,
        source,
        from,
        state: State::Next,
        created_at: now,
        updated_at: now,
        waiting_on: None,
        note: None,
        chased: 0,
        last_chased_at: 0,
    }
}

/// Add an ask to `agent_id`'s list. An open one that is already the same
/// ask from the same sender is bumped, not doubled; returns its id and
/// whether it was already there.
pub fn add(agent_id: &str, title: &str, source: Source, from: Option<AgentRef>) -> (String, bool) {
    let title = title_of(title);
    if title.is_empty() {
        return (String::new(), false);
    }
    let now = store::now_ms();
    edit(agent_id, |tasks| {
        if let Some(t) = tasks.iter_mut().find(|t| {
            t.state.is_open()
                && t.from.as_ref().map(|f| &f.id) == from.as_ref().map(|f| &f.id)
                && likeness(&t.title, &title) >= SAME
        }) {
            t.updated_at = now;
            if t.state == State::Stuck {
                t.state = State::Next;
            }
            return (t.id.clone(), true);
        }
        let t = new_task(title, source, from, now);
        let id = t.id.clone();
        tasks.push(t);
        (id, false)
    })
}

/// Another agent's `message_agent` request, delivered to `target`.
pub fn from_ask(target_id: &str, asker: &store::Agent, body: &str) -> (String, bool) {
    add(
        target_id,
        body,
        Source::Agent,
        Some(AgentRef {
            id: asker.id.clone(),
            name: asker.name.clone(),
        }),
    )
}

/// `helper`'s turn answered `asker`: its open asks from `asker` are done.
pub fn answered(helper_id: &str, asker_id: &str) {
    settle(helper_id, asker_id, State::Done, None);
}

/// `helper`'s turn for `asker` ended in an error: the ask is stuck, said so.
pub fn failed(helper_id: &str, asker_id: &str, why: &str) {
    settle(helper_id, asker_id, State::Stuck, Some(clip(why, 200)));
}

fn settle(helper_id: &str, asker_id: &str, state: State, note: Option<String>) {
    let now = store::now_ms();
    edit(helper_id, |tasks| {
        for t in tasks
            .iter_mut()
            .filter(|t| t.state.is_open() && t.from.as_ref().is_some_and(|f| f.id == asker_id))
        {
            t.state = state;
            t.updated_at = now;
            t.note = note.clone();
        }
    });
}

/// Set one task by id (or an unambiguous id prefix). Returns what happened.
pub fn set(agent_id: &str, id: &str, state: State, note: Option<&str>) -> Result<String, String> {
    let now = store::now_ms();
    edit(agent_id, |tasks| {
        let matches: Vec<usize> = tasks
            .iter()
            .enumerate()
            .filter(|(_, t)| t.id == id || (id.len() >= 3 && t.id.starts_with(id)))
            .map(|(i, _)| i)
            .collect();
        match matches.as_slice() {
            [i] => {
                let i = *i;
                if state == State::Doing {
                    for other in tasks.iter_mut().filter(|t| t.state == State::Doing) {
                        other.state = State::Next;
                    }
                }
                let t = &mut tasks[i];
                t.state = state;
                t.updated_at = now;
                match state {
                    State::Waiting => t.waiting_on = note.map(|n| clip(n, 120)),
                    _ => {
                        t.waiting_on = None;
                        t.note = note.map(|n| clip(n, 200));
                    }
                }
                Ok(t.title.clone())
            }
            [] => Err(format!(
                "No task {id} on your list. `tasks list` shows them."
            )),
            _ => Err(format!(
                "More than one task starts with {id}: use the whole id."
            )),
        }
    })
}

pub fn open_of(agent_id: &str) -> Vec<Task> {
    let mut v: Vec<Task> = read(agent_id)
        .into_iter()
        .filter(|t| t.state.is_open())
        .collect();
    v.sort_by_key(|t| t.created_at);
    v
}

/// Overloaded or not, and why. Pure.
pub fn overload(open: &[Task], now: i64) -> Option<String> {
    if open.len() >= OVERLOAD_OPEN {
        return Some(format!("{} to do", open.len()));
    }
    // One open over a day with no movement (a line waiting on the user
    // is theirs to move, not the agent's).
    let stale = open
        .iter()
        .filter(|t| t.state != State::Waiting)
        .map(|t| t.updated_at)
        .min()?;
    (now - stale >= OVERLOAD_AGE_MS)
        .then(|| format!("one open {} with no movement", age(now - stale)))
}

/// "5h", "2d", "20m". Pure.
pub fn age(ms: i64) -> String {
    let m = (ms / 60_000).max(0);
    if m < 60 {
        format!("{}m", m.max(1))
    } else if m < 48 * 60 {
        format!("{}h", m / 60)
    } else {
        format!("{}d", m / 1440)
    }
}

/// One agent's load, for the desk and the board.
pub fn load_of(agent: &store::Agent, now: i64) -> Load {
    let all = read(&agent.id);
    let mut open: Vec<Task> = all.iter().filter(|t| t.state.is_open()).cloned().collect();
    open.sort_by_key(|t| t.created_at);
    let mut recent: Vec<Task> = all.into_iter().filter(|t| !t.state.is_open()).collect();
    recent.sort_by_key(|t| std::cmp::Reverse(t.updated_at));
    recent.truncate(8);
    let why = overload(&open, now);
    let status = super::runner::status_of(&agent.id);
    let doing = (status.state != "idle")
        .then(|| status.activity.clone())
        .flatten();
    // Working now with no line marked Doing: the oldest next line is it.
    if status.state != "idle" && !open.iter().any(|t| t.state == State::Doing) {
        if let Some(t) = open.iter_mut().find(|t| t.state == State::Next) {
            t.state = State::Doing;
        }
    }
    Load {
        agent_id: agent.id.clone(),
        name: agent.name.clone(),
        role: agent.role.clone(),
        doing,
        stuck: open.iter().filter(|t| t.state == State::Stuck).count(),
        overloaded: why.is_some(),
        overloaded_why: why,
        open,
        recent,
    }
}

/// What the header's quiet line says of one agent ("Drafting intros · 5 to
/// do · 1 waits"), counted here once so the desk and the phone don't each
/// count.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    /// What it is doing now: its status line while a turn runs, else the line marked Doing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub doing: Option<String>,
    /// Lines still to do: Next and Stuck (the one in progress is `doing`).
    pub to_do: u32,
    /// Lines waiting on the user.
    pub waits: u32,
}

/// `open` and the working status as [`Counts`]; `None` when there is
/// nothing open and the agent isn't working (the line is hidden).
pub fn counts(open: &[Task], working: Option<&str>) -> Option<Counts> {
    let doing = working.map(str::to_string).or_else(|| {
        open.iter()
            .find(|t| t.state == State::Doing)
            .map(|t| t.title.clone())
    });
    let to_do = open
        .iter()
        .filter(|t| matches!(t.state, State::Next | State::Stuck))
        .count() as u32;
    let waits = open.iter().filter(|t| t.state == State::Waiting).count() as u32;
    (doing.is_some() || to_do > 0 || waits > 0).then_some(Counts {
        doing,
        to_do,
        waits,
    })
}

/// [`counts`] for one agent, from its list and its status.
pub fn counts_of(agent_id: &str, working: Option<String>) -> Option<Counts> {
    counts(&open_of(agent_id), working.as_deref())
}

/// Open lines `from_id` has put on `agent_id`'s list.
pub fn assigned_by(agent_id: &str, from_id: &str) -> usize {
    open_of(agent_id)
        .iter()
        .filter(|t| t.from.as_ref().is_some_and(|f| f.id == from_id))
        .count()
}

/// Whether `caller` may put a line on `target`'s list now. Pure: the caller
/// says whether this turn answers outside text, whether the hop cap allows
/// one more hop, and how many lines it already has open on `target`.
pub fn check_assign(
    caller_id: &str,
    target_id: &str,
    target_name: &str,
    outside: bool,
    hop_ok: bool,
    already: usize,
) -> Result<(), String> {
    if outside {
        return Err("Not while answering what a “When…” routine found: that text came from outside this app. Tell the user instead.".into());
    }
    if caller_id == target_id {
        return Err("That's you: add it to your own list with task_add.".into());
    }
    if !hop_ok {
        return Err("Not added: this chain of agent-to-agent work is too long. Tell the user where things stand instead.".into());
    }
    if already >= MAX_ASSIGNED {
        return Err(format!(
            "Not added: you already have {MAX_ASSIGNED} open tasks on {target_name}'s list. Let them clear some first."
        ));
    }
    Ok(())
}

/// The centred line in the assignee's chat.
pub fn assigned_line(caller_name: &str, target_name: &str, title: &str) -> String {
    format!(
        "{caller_name} added a task for {target_name} · {}",
        title_of(title)
    )
}

/// What goes back to the agent that assigned `task` when the assignee drops
/// it or sets it waiting (`state`), with the reason. `None` for a line that
/// wasn't another agent's, or any other state.
pub fn hand_back_body(task: &Task, state: &str, why: &str) -> Option<String> {
    if task.source != Source::Agent || task.from.is_none() {
        return None;
    }
    let what = match state {
        "dropped" => "dropped",
        "waiting" => "waiting on the user",
        _ => return None,
    };
    Some(format!("Handed back: \"{}\" — {what}. {why}", task.title))
}

/// `task_assign`'s write: a line on `target`'s list from `caller`, with the
/// optional note. Returns its id and whether it was already open.
pub fn assign(
    target_id: &str,
    caller: &store::Agent,
    title: &str,
    note: Option<&str>,
) -> (String, bool) {
    let (id, dup) = add(
        target_id,
        title,
        Source::Agent,
        Some(AgentRef {
            id: caller.id.clone(),
            name: caller.name.clone(),
        }),
    );
    if let (false, false, Some(n)) = (id.is_empty(), dup, note) {
        let note = clip(n, 200);
        edit(target_id, |tasks| {
            if let Some(t) = tasks.iter_mut().find(|t| t.id == id) {
                t.note = Some(note);
            }
        });
    }
    (id, dup)
}

/// The line of `agent_id`'s list that `id` (or an unambiguous prefix) names.
pub fn find(agent_id: &str, id: &str) -> Option<Task> {
    let all = read(agent_id);
    let mut hits = all
        .iter()
        .filter(|t| t.id == id || (id.len() >= 3 && t.id.starts_with(id)));
    let first = hits.next()?;
    hits.next().is_none().then(|| first.clone())
}

/// Every visible agent's load, the busiest first.
pub fn all_loads(now: i64) -> Vec<Load> {
    let mut v: Vec<Load> = store::list()
        .unwrap_or_default()
        .iter()
        .filter(|a| !a.hidden)
        .map(|a| load_of(a, now))
        .collect();
    v.sort_by_key(|l| std::cmp::Reverse((l.overloaded, l.open.len())));
    v
}

/// Asks closed since `since`, per agent (name, count), the most first. Only
/// done ones: a dropped ask isn't work done.
pub fn closed_since(since: i64) -> Vec<(String, usize)> {
    let mut out: Vec<(String, usize)> = store::list()
        .unwrap_or_default()
        .iter()
        .filter(|a| !a.hidden)
        .filter_map(|a| {
            let n = read(&a.id)
                .iter()
                .filter(|t| t.state == State::Done && t.updated_at >= since)
                .count();
            (n > 0).then(|| (a.name.clone(), n))
        })
        .collect();
    out.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
    out
}

/// Another agent already has something like `title` open: who and what.
pub fn similar_elsewhere(title: &str, except: &str) -> Option<(String, String, String)> {
    let now = store::now_ms();
    store::list()
        .unwrap_or_default()
        .iter()
        .filter(|a| a.id != except && !a.hidden)
        .find_map(|a| {
            open_of(&a.id)
                .into_iter()
                .find(|t| likeness(&t.title, title) >= SAME)
                .map(|t| (a.name.clone(), t.title.clone(), age(now - t.created_at)))
        })
}

fn role_short(role: &str) -> String {
    clip(role, 90)
}

/// The Chief's board: who does what and where it stands, capped. Agents with
/// nothing open are named once, at the end, so it also says who has room.
/// Pure over the loads.
pub fn board(loads: &[Load], now: i64) -> Option<String> {
    let busy: Vec<&Load> = loads.iter().filter(|l| !l.open.is_empty()).collect();
    if busy.is_empty() {
        return None;
    }
    let mut out = String::from(
        "## Your board\n\nEvery agent's open asks, from the app's own lists. You manage from this: hand work to who owns that job (never two agents the same thing), give less to anyone overloaded, and when an ask is stuck or old, find out why and unblock it or tell the user. The app already nudges an agent twice about an ask that sits.\n",
    );
    for l in &busy {
        let oldest = l
            .open
            .first()
            .map(|t| age(now - t.created_at))
            .unwrap_or_default();
        let mut line = format!(
            "\n- {} ({}): {} open, oldest {oldest}",
            l.name,
            role_short(&l.role),
            l.open.len()
        );
        if let Some(why) = &l.overloaded_why {
            line.push_str(&format!(" — OVERLOADED ({why})"));
        }
        if l.stuck > 0 {
            line.push_str(&format!(" — {} stuck", l.stuck));
        }
        if let Some(d) = &l.doing {
            line.push_str(&format!("; now: {}", clip(d, 60)));
        }
        if let Some(t) = l.open.first() {
            line.push_str(&format!("; first: \"{}\"", clip(&t.title, 70)));
        }
        if out.chars().count() + line.chars().count() > BOARD_CAP {
            out.push_str("\n- …more (call `tasks` with `board`)");
            break;
        }
        out.push_str(&line);
    }
    let free: Vec<&str> = loads
        .iter()
        .filter(|l| l.open.is_empty())
        .map(|l| l.name.as_str())
        .take(12)
        .collect();
    if !free.is_empty() {
        let tail = format!("\n\nNothing open: {}.", free.join(", "));
        if out.chars().count() + tail.chars().count() <= BOARD_CAP + 200 {
            out.push_str(&tail);
        }
    }
    Some(out)
}

/// The Chief's briefing section.
pub fn board_for_chief() -> Option<String> {
    board(&all_loads(store::now_ms()), store::now_ms())
}

/// An agent's own open list for its briefing. `None` when empty. Pure over
/// the tasks.
pub fn own_section(open: &[Task], now: i64) -> Option<String> {
    if open.is_empty() {
        return None;
    }
    let mut out = String::from(
        "## Your task list\n\nOpen asks the app is keeping for you. Don't let one drop: finish it, or say what's blocking it. Mark each done with the `tasks` tool once you've delivered it; add a user ask you can't finish in one reply.",
    );
    for t in open {
        let who = match (&t.source, &t.from) {
            (_, Some(f)) => format!("from {}", f.name),
            (Source::User, _) => "from the user".to_string(),
            _ => "yours".to_string(),
        };
        let mut line = format!(
            "\n- [{}] {} ({who}, {} ago)",
            t.id,
            t.title,
            age(now - t.created_at)
        );
        match t.state {
            State::Waiting => line.push_str(&format!(
                " — waiting on {}",
                t.waiting_on.as_deref().unwrap_or("something")
            )),
            State::Stuck => line.push_str(" — stuck"),
            _ => {}
        }
        if out.chars().count() + line.chars().count() > OWN_CAP {
            out.push_str("\n- …more (call `tasks`)");
            break;
        }
        out.push_str(&line);
    }
    Some(out)
}

pub fn briefing_for(agent: &store::Agent) -> Option<String> {
    own_section(&open_of(&agent.id), store::now_ms())
}

/// The `tasks` tool's text answer for `caller`.
pub fn run_tool(caller: &store::Agent, args: &serde_json::Value) -> Result<String, String> {
    let s = |k: &str| {
        args.get(k)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
    };
    let now = store::now_ms();
    match s("action").unwrap_or("") {
        "board" => Ok(board_text(&all_loads(now), now)),
        "list" => {
            let target = match s("agent") {
                Some(name) => store::find_addressed(name)
                    .ok()
                    .flatten()
                    .ok_or_else(|| format!("There's no agent called {name}."))?,
                None => caller.clone(),
            };
            Ok(list_text(&load_of(&target, now), now))
        }
        _ => Err("`action` is list or board.".into()),
    }
}

/// `task_add`.
pub fn run_add(caller: &store::Agent, args: &serde_json::Value) -> Result<String, String> {
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or("`title` is required.")?;
    let (id, dup) = add(&caller.id, title, Source::User, None);
    Ok(if dup {
        format!("Already on your list as {id}; kept as one.")
    } else {
        format!("Added {id}.")
    })
}

/// `task_update`.
pub fn run_update(caller: &store::Agent, args: &serde_json::Value) -> Result<String, String> {
    let s = |k: &str| {
        args.get(k)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
    };
    let id = s("id").ok_or("`id` is required.")?;
    let (state, word) = match s("state").unwrap_or("") {
        "doing" => (State::Doing, "doing"),
        "next" => (State::Next, "next"),
        "waiting" => (State::Waiting, "waiting on the user"),
        "done" => (State::Done, "done"),
        "dropped" => (State::Dropped, "dropped"),
        _ => return Err("`state` is doing, next, waiting, done or dropped.".into()),
    };
    if state == State::Dropped && s("note").is_none() {
        return Err("A line is never dropped without a reason: say why in `note`.".into());
    }
    set(&caller.id, id, state, s("note")).map(|t| format!("{t}: {word}."))
}

fn list_text(l: &Load, now: i64) -> String {
    if l.open.is_empty() {
        return format!("{}: nothing open.", l.name);
    }
    let mut out = format!("{}: {} open", l.name, l.open.len());
    if let Some(w) = &l.overloaded_why {
        out.push_str(&format!(" (overloaded: {w})"));
    }
    for t in &l.open {
        out.push_str(&format!(
            "\n- [{}] {} ({}, {} ago){}",
            t.id,
            t.title,
            t.from
                .as_ref()
                .map(|f| format!("from {}", f.name))
                .unwrap_or_else(|| "user or own".into()),
            age(now - t.created_at),
            match t.state {
                State::Waiting => " — waiting",
                State::Stuck => " — stuck",
                _ => "",
            }
        ));
    }
    out
}

fn board_text(loads: &[Load], now: i64) -> String {
    let mut out = String::new();
    for l in loads.iter().filter(|l| !l.open.is_empty()) {
        out.push_str(&list_text(l, now));
        out.push('\n');
    }
    if out.is_empty() {
        "Nothing open on any list.".into()
    } else {
        out
    }
}

/* ---------------------------------------------------------------- chasing */

/// What to nudge, now. Pure: `ready` says whether the agent may be woken.
pub fn due_chase(t: &Task, now: i64) -> bool {
    if !matches!(t.state, State::Next | State::Doing | State::Stuck) || t.chased >= MAX_CHASES {
        return false;
    }
    // The first nudge after the wait; a line is chased at most once a day.
    if t.chased > 0 {
        return now - t.last_chased_at >= CHASE_AGAIN_MS;
    }
    let after = if t.from.is_some() {
        CHASE_AFTER_MS
    } else {
        CHASE_USER_AFTER_MS
    };
    now - t.updated_at >= after
}

/// A task used up its nudges and is still open. Pure.
pub fn out_of_nudges(t: &Task, now: i64) -> bool {
    matches!(t.state, State::Next | State::Doing)
        && t.chased >= MAX_CHASES
        && now - t.last_chased_at >= CHASE_AGAIN_MS
}

pub fn nudge_text(t: &Task, now: i64) -> String {
    let who = t
        .from
        .as_ref()
        .map(|f| f.name.clone())
        .unwrap_or_else(|| "the user".into());
    format!(
        "[Still open on your task list: \"{}\", from {who}, {} ago. Do it now, or reply with exactly what's blocking you. If it's already done or no longer wanted, mark it with the `tasks` tool and say so.]",
        t.title,
        age(now - t.created_at)
    )
}

static LAST_TICK: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

/// From the check-in tick: nudge asks that sit, say when one ran out of
/// nudges. Cheap (a few small files) and throttled to every few minutes.
pub fn tick(app: &tauri::AppHandle) {
    use std::sync::atomic::Ordering;
    let now = store::now_ms();
    if now - LAST_TICK.load(Ordering::Relaxed) < TICK_EVERY_MS {
        return;
    }
    LAST_TICK.store(now, Ordering::Relaxed);
    if super::quiet::holding_now() || super::usage_plan::mode().0 == super::usage_plan::Mode::Save {
        return;
    }
    let agents = store::list().unwrap_or_default();
    let chief = agents.iter().find(|a| a.is_main).cloned();
    for agent in agents.iter().filter(|a| !a.hidden) {
        if super::runner::driven(&agent.id)
            || super::runner::queued(&agent.id)
            || super::runner::status_of(&agent.id).state != "idle"
        {
            continue;
        }
        let todo: Vec<Task> = open_of(&agent.id)
            .into_iter()
            .filter(|t| due_chase(t, now))
            .collect();
        if let Some(t) = todo.first() {
            let sender = t.from.clone().or_else(|| {
                chief.as_ref().map(|c| AgentRef {
                    id: c.id.clone(),
                    name: c.name.clone(),
                })
            });
            if let Some(sender) = sender.filter(|s| s.id != agent.id) {
                let ids: Vec<String> = todo.iter().map(|t| t.id.clone()).collect();
                edit(&agent.id, |tasks| {
                    for t in tasks.iter_mut().filter(|t| ids.contains(&t.id)) {
                        t.chased += 1;
                        t.last_chased_at = now;
                    }
                });
                // One nudge per agent per tick, carrying its oldest.
                super::runner::enqueue_request(
                    app,
                    &agent.id,
                    nudge_text(t, now),
                    sender,
                    1,
                    false,
                );
                tracing::info!(agent = %agent.id, task = %t.id, "[Agents] nudged a task that sat open");
            }
        }
        // Out of nudges and still open: the Chief's chat says so, once.
        let stuck: Vec<Task> = open_of(&agent.id)
            .into_iter()
            .filter(|t| out_of_nudges(t, now))
            .collect();
        if let (Some(c), false) = (&chief, stuck.is_empty()) {
            let ids: Vec<String> = stuck.iter().map(|t| t.id.clone()).collect();
            edit(&agent.id, |tasks| {
                for t in tasks.iter_mut().filter(|t| ids.contains(&t.id)) {
                    t.state = State::Stuck;
                    t.updated_at = now;
                }
            });
            let line = format!(
                "{} hasn't finished \"{}\" after {} and two nudges. It's marked stuck: worth a look.",
                agent.name,
                stuck[0].title,
                age(now - stuck[0].created_at)
            );
            let _ = super::runner::record(
                app,
                super::runner::new_message(&c.id, store::MessageKind::Note, line),
            );
        }
    }
}

#[cfg(test)]
#[path = "tasks_tests.rs"]
mod tests;
