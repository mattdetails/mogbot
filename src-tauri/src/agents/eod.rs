//! The end-of-day check-in: once a day, at the user's time, the Chief of
//! Staff posts one short message in its chat: what the team closed today,
//! what is still open or stuck on their lists (`tasks`), and one question,
//! "anything to hand off or chase tomorrow?". The user's answer is an
//! ordinary message to the Chief, which turns it into asks on the agents
//! that own them.
//!
//! - **On by default** (17:30), off with one switch: Settings → Agents →
//!   Notifications, or by telling the Chief ("stop the end-of-day
//!   check-in", `set_end_of_day`).
//! - **No model turn.** Composed here from the task lists, like the morning
//!   brief ([`brief`](super::brief)); nothing is inferred. A day with
//!   nothing closed or open still asks its question, once.
//! - **Missed, not late.** The Mac asleep or the app closed more than
//!   [`LATE_MS`] past the time: that day's is skipped, never posted at night.
//! - **Not over the user.** If they wrote to the Chief within
//!   [`QUIET_AFTER_USER_MS`] of the time, it waits that long, up to
//!   [`LATE_MS`] after the time, so it never cuts across a conversation.

use chrono::{NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use super::store::{self, MessageKind};
use super::tasks;
use crate::errors::CommandError;

const MINUTE_MS: i64 = 60_000;
/// 17:30.
pub const DEFAULT_AT: u32 = 17 * 60 + 30;
/// Past its time by more than this, the day's check-in is skipped.
pub const LATE_MS: i64 = 3 * 60 * MINUTE_MS;
/// The user wrote to the Chief this recently: wait.
pub const QUIET_AFTER_USER_MS: i64 = 10 * MINUTE_MS;
/// Every check-in starts with this, so the app can tell them apart.
pub const HEAD: &str = "End of day.";
pub const EVENT: &str = "agents-end-of-day-changed";
pub const TOOL: &str = "set_end_of_day";

const FILE: &str = "end-of-day.json";
const STATE_FILE: &str = "end-of-day-state.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub on: bool,
    /// Minutes after local midnight.
    pub at: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            on: true,
            at: DEFAULT_AT,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct State {
    pub settled_day: Option<String>,
    pub last_posted_at: i64,
}

static LOCK: Mutex<()> = Mutex::new(());

fn read<T: serde::de::DeserializeOwned + Default>(name: &str, what: &str) -> T {
    store::agents_root()
        .ok()
        .and_then(|r| super::survive::read_kept(&r.join(name), what))
        .unwrap_or_default()
}

fn write<T: Serialize>(name: &str, v: &T) -> Result<(), CommandError> {
    let json = serde_json::to_vec_pretty(v).map_err(super::err_other)?;
    store::write_atomic(&store::agents_root()?.join(name), &json)
}

pub fn get() -> Settings {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    read(FILE, "Your end-of-day check-in")
}

pub fn set(s: Settings) -> Result<Settings, CommandError> {
    if s.at >= 24 * 60 {
        return Err(CommandError::expected("That isn't a time of day."));
    }
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    write(FILE, &s)?;
    Ok(s)
}

fn state() -> State {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    read(STATE_FILE, "The end-of-day check-in's state")
}

fn save_state(f: impl FnOnce(&mut State)) -> Result<(), CommandError> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut s: State = read(STATE_FILE, "The end-of-day check-in's state");
    f(&mut s);
    write(STATE_FILE, &s)
}

fn day_key(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    Nothing,
    Post { day: String },
    Missed { day: String },
}

/// What the tick does now. `last_user_at`: when the user last wrote to the
/// Chief (0 if never). Pure.
pub fn decide<Tz: TimeZone>(
    s: &Settings,
    st: &State,
    tz: &Tz,
    now: i64,
    last_user_at: i64,
) -> Step {
    if !s.on {
        return Step::Nothing;
    }
    let Some(today) = tz
        .timestamp_millis_opt(now)
        .single()
        .map(|t| t.date_naive())
    else {
        return Step::Nothing;
    };
    let day = day_key(today);
    if st.settled_day.as_deref() == Some(day.as_str()) {
        return Step::Nothing;
    }
    let Some(at) = super::schedule::resolve(tz, today, s.at / 60, s.at % 60) else {
        return Step::Nothing;
    };
    if now < at {
        return Step::Nothing;
    }
    if now - at > LATE_MS {
        return Step::Missed { day };
    }
    if last_user_at > 0 && now - last_user_at < QUIET_AFTER_USER_MS {
        return Step::Nothing;
    }
    Step::Post { day }
}

/// Everything the message says.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Facts {
    /// Asks closed today, per agent.
    pub closed: Vec<(String, usize)>,
    pub open: usize,
    /// (agent, ask) for each stuck ask.
    pub stuck: Vec<(String, String)>,
    pub overloaded: Vec<String>,
}

pub fn gather(loads: &[tasks::Load], closed: Vec<(String, usize)>) -> Facts {
    Facts {
        closed,
        open: loads.iter().map(|l| l.open.len()).sum(),
        stuck: loads
            .iter()
            .flat_map(|l| {
                l.open
                    .iter()
                    .filter(|t| t.state == tasks::State::Stuck)
                    .map(|t| (l.name.clone(), t.title.clone()))
            })
            .collect(),
        overloaded: loads
            .iter()
            .filter(|l| l.overloaded)
            .map(|l| l.name.clone())
            .collect(),
    }
}

fn plural(n: usize, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

fn list(items: &[String]) -> String {
    match items {
        [] => String::new(),
        [a] => a.clone(),
        [a, b] => format!("{a} and {b}"),
        [rest @ .., last] => format!("{}, and {last}", rest.join(", ")),
    }
}

/// The message. Pure.
pub fn compose(f: &Facts) -> String {
    let mut parts: Vec<String> = Vec::new();
    let total: usize = f.closed.iter().map(|(_, n)| n).sum();
    if total > 0 {
        let who: Vec<String> = f
            .closed
            .iter()
            .take(4)
            .map(|(a, n)| format!("{a} {n}"))
            .collect();
        parts.push(format!(
            "The team closed {} today ({}).",
            plural(total, "ask", "asks"),
            list(&who)
        ));
    }
    if f.open > 0 {
        let mut s = format!("{} still open.", plural(f.open, "ask is", "asks are"));
        if let Some((a, t)) = f.stuck.first() {
            s.push_str(&format!(
                " {} stuck, starting with {a}'s \"{}\".",
                f.stuck.len(),
                t
            ));
        }
        if !f.overloaded.is_empty() {
            s.push_str(&format!(" {} overloaded.", list(&f.overloaded)));
        }
        parts.push(s);
    } else {
        parts.push("Nothing is open on any agent's list.".into());
    }
    parts.push("Anything to hand off tonight, or chase tomorrow?".into());
    format!("{HEAD} {}", parts.join(" "))
}

fn chief() -> Result<store::Agent, CommandError> {
    store::list()?
        .into_iter()
        .find(|a| a.is_main)
        .ok_or_else(|| CommandError::expected("There's no Chief of Staff to post to."))
}

fn last_user_message_at(chief_id: &str) -> i64 {
    store::messages(chief_id, 30)
        .unwrap_or_default()
        .iter()
        .rev()
        .find(|m| m.kind == MessageKind::User)
        .map(|m| m.ts)
        .unwrap_or(0)
}

/// From the scheduler tick: post today's check-in when its time says so.
pub fn tick(app: &tauri::AppHandle) {
    let now = store::now_ms();
    let settings = get();
    if !settings.on {
        return;
    }
    let Ok(chief) = chief() else { return };
    let step = decide(
        &settings,
        &state(),
        &chrono::Local,
        now,
        last_user_message_at(&chief.id),
    );
    let (day, post) = match step {
        Step::Nothing => return,
        Step::Missed { day } => (day, false),
        Step::Post { day } => (day, true),
    };
    if post {
        let since = {
            let tz = chrono::Local;
            tz.timestamp_millis_opt(now)
                .single()
                .and_then(|t| t.date_naive().and_hms_opt(0, 0, 0))
                .and_then(|d| tz.from_local_datetime(&d).single())
                .map(|d| d.timestamp_millis())
                .unwrap_or(now - 24 * 60 * MINUTE_MS)
        };
        let facts = gather(&tasks::all_loads(now), tasks::closed_since(since));
        let message = super::runner::new_message(&chief.id, MessageKind::Agent, compose(&facts));
        if let Err(e) = super::runner::record(app, message) {
            tracing::warn!(error = %e, "end-of-day check-in");
            return;
        }
    }
    let _ = save_state(|s| {
        s.settled_day = Some(day);
        if post {
            s.last_posted_at = now;
        }
    });
}

pub const DESCRIPTION: &str = "The end-of-day check-in, the app's own: once a day at the user's time (17:30 unless set) you post a short message in your chat, composed by the app from the team's task lists, ending in one question about what to hand off or chase tomorrow. On by default. Call it when the user says when (\"check in at 6\"), or to stop it (`off: true`) or bring it back (`on: true`). It applies at once: say what's set in a line.";

pub fn schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "on": { "type": "boolean" },
            "off": { "type": "boolean" },
            "at": { "type": "string", "description": "Local time, 24-hour \"HH:MM\"." }
        }
    })
}

pub fn clock_label(minute: u32) -> String {
    format!("{:02}:{:02}", minute / 60, minute % 60)
}

pub fn describe(s: &Settings) -> String {
    if s.on {
        format!("The end-of-day check-in is on, at {}.", clock_label(s.at))
    } else {
        "The end-of-day check-in is off.".into()
    }
}

/// The settings a tool call asks for. Pure.
pub fn wanted(args: &serde_json::Value, now: &Settings) -> Result<Settings, String> {
    let mut next = now.clone();
    if args.get("off").and_then(|v| v.as_bool()) == Some(true) {
        next.on = false;
    } else if args.get("on").and_then(|v| v.as_bool()) == Some(true) {
        next.on = true;
    }
    if let Some(t) = args.get("at").and_then(|v| v.as_str()) {
        let (h, m) = t
            .trim()
            .split_once(':')
            .ok_or("`at` is a time like 17:30.")?;
        let (h, m): (u32, u32) = (
            h.parse().map_err(|_| "`at` is a time like 17:30.")?,
            m.parse().map_err(|_| "`at` is a time like 17:30.")?,
        );
        if h > 23 || m > 59 {
            return Err("`at` is a time like 17:30.".into());
        }
        next.at = h * 60 + m;
        next.on = true;
    }
    Ok(next)
}

#[cfg(test)]
#[path = "eod_tests.rs"]
mod tests;
