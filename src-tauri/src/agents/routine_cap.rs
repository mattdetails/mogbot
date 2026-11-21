//! A cap on an agent's routines: "pause its routines once it has used 2M
//! tokens this week", so unattended work can't quietly eat the week's limit.
//!
//! **The unit is tokens, as the engines reported them.** It is the one
//! per-agent figure every engine reports for every turn and check (Claude
//! Code, Codex and OpenCode alike; `usage`). A dollar figure isn't: Codex
//! and OpenCode report none, and Claude Code's is at API list prices, not a
//! Pro/Max bill. Nor is a share of a plan's weekly limit: engines report
//! limits per account in percent, never per agent, and the share a token is
//! worth is only learned, an upper-side estimate that often isn't known at
//! all (`forecast::rate`). So the cap is never said as a percentage.
//!
//! **"This week" is the agent's own week as its Usage tab counts it**: today
//! and the six days before (`usage::AgentUsage::summary`), turns and "When…"
//! checks together. The same number the user sees beside the control, so the
//! two can't disagree. It has no refill of its own: it falls back under the
//! cap as each day's use leaves the week, and [`lifts_on`] says on which day
//! that happens if nothing more runs. The plan's own limits refill on the
//! engine's clock; that is a different thing (`saver`, `quota`).
//!
//! **What it stops is unattended work only**: a repeating routine coming due
//! and a "When…" routine's checks ([`stops`]). The user's own messages, Run
//! now, Check now, and a one-time check-in (a reminder the user set for a
//! moment) still run. A skipped routine moves on to its next time with a
//! "Skipped" row saying why, as one skipped while the user drives the agent
//! does; a "When…" routine isn't checked meanwhile, and what arrived is found
//! by its first check after. One line in the agent's chat says it was
//! reached and how to lift it ([`reached_line`]), and one when it is back
//! under ([`back_line`]), never one per skipped run.
//!
//! Off by default (`Agent::routine_cap` is `None`); an old registry without
//! the field loads as off.

use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};

use super::forecast;
use super::usage::AgentUsage;

/// The largest cap accepted: far above any week, so a typo can't overflow.
pub const MAX_TOKENS: u64 = 10_000_000_000;
/// Days in the week it counts (today and the six before), as `usage` keeps.
const WEEK_DAYS: i64 = 7;

/// Stored on the agent (`Agent::routine_cap`).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoutineCap {
    /// Tokens this week at which its routines stop starting.
    pub tokens: u64,
    /// When the app saw it reached and said so in the chat; cleared once it
    /// is back under (said too), so each time it is reached is said exactly
    /// once. Kept across a change of the cap: raising it past the week is
    /// "back under", and a change that leaves it reached says nothing new.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reached_at: Option<i64>,
}

/// What the Usage tab shows beside the control (`UsageSummary::routine_cap`).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CapStatus {
    pub tokens: u64,
    /// Its tokens this week, as the engines reported them.
    pub used: u64,
    pub reached: bool,
    /// Reached: the day (`YYYY-MM-DD`) it falls back under if nothing more
    /// runs, as older days leave the week.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lifts_on: Option<String>,
}

/// Work an agent can be woken for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Work {
    /// The user's own message (from the desk, the phone, Slack…).
    UserMessage,
    /// A scheduled check-in coming due: `repeats` for a routine, else a
    /// one-time note; `manual` is Run now.
    Scheduled { repeats: bool, manual: bool },
    /// A "When…" routine's check; `manual` is Check now.
    When { manual: bool },
}

impl Work {
    /// Whether it runs with nobody asking for it right now.
    fn unattended(self) -> bool {
        match self {
            Work::UserMessage => false,
            Work::Scheduled { repeats, manual } => repeats && !manual,
            Work::When { manual } => !manual,
        }
    }
}

/// Its tokens this week: today and the six days before, turns and checks.
pub fn week_tokens(usage: &AgentUsage, today: NaiveDate) -> u64 {
    forecast::tokens(&usage.summary(today).week)
}

/// Whether `cap` is reached by `usage` this week.
pub fn reached(cap: &RoutineCap, usage: &AgentUsage, today: NaiveDate) -> bool {
    cap.tokens > 0 && week_tokens(usage, today) >= cap.tokens
}

/// Whether the cap stops `work` now. Off by default; never the user's own.
pub fn stops(agent: &super::store::Agent, work: Work, today: NaiveDate) -> bool {
    work.unattended()
        && agent
            .routine_cap
            .as_ref()
            .is_some_and(|cap| reached(cap, &agent.usage, today))
}

/// Whether a due check-in of `agent` is stopped by its cap (Run now is
/// planned elsewhere, so this is the tick's view: never manual).
pub fn stops_check_in(
    agent: &super::store::Agent,
    check_in: &super::schedule::CheckIn,
    today: NaiveDate,
) -> bool {
    let work = if check_in.watch.is_some() {
        Work::When { manual: false }
    } else {
        Work::Scheduled {
            repeats: check_in.repeat.is_some(),
            manual: false,
        }
    };
    stops(agent, work, today)
}

/// The day it falls back under `cap` if nothing more runs: the first day
/// whose week (that day and the six before) holds fewer tokens than the
/// cap. Within a week, always: by then every day it has now has left.
pub fn lifts_on(cap: u64, usage: &AgentUsage, today: NaiveDate) -> Option<NaiveDate> {
    if cap == 0 {
        return None;
    }
    let days: Vec<(NaiveDate, u64)> = usage
        .days
        .iter()
        .filter_map(|d| {
            NaiveDate::parse_from_str(&d.day, "%Y-%m-%d")
                .ok()
                .map(|day| (day, forecast::tokens(&d.totals)))
        })
        .collect();
    (1..=WEEK_DAYS)
        .map(|n| today + Duration::days(n))
        .find(|d| {
            let left: u64 = days
                .iter()
                .filter(|(day, _)| *day <= *d && (*d - *day).num_days() < WEEK_DAYS)
                .map(|(_, t)| *t)
                .sum();
            left < cap
        })
}

/// What the Usage tab shows, when a cap is set.
pub fn status(agent: &super::store::Agent, today: NaiveDate) -> Option<CapStatus> {
    let cap = agent.routine_cap.as_ref()?;
    let used = week_tokens(&agent.usage, today);
    let reached = reached(cap, &agent.usage, today);
    Some(CapStatus {
        tokens: cap.tokens,
        used,
        reached,
        lifts_on: reached
            .then(|| lifts_on(cap.tokens, &agent.usage, today))
            .flatten()
            .map(|d| d.format("%Y-%m-%d").to_string()),
    })
}

/// A cap from the user's words or the editor: a number of tokens ("2000000",
/// "2M", "500k", "1.5m"), or "off" / "none" / 0 for no cap. `Ok(None)` is off.
pub fn parse(raw: &str) -> Result<Option<u64>, String> {
    let words = raw.trim().to_ascii_lowercase();
    let words = words
        .strip_suffix("tokens")
        .or_else(|| words.strip_suffix("token"))
        .unwrap_or(&words)
        .trim()
        .replace([',', '_', ' '], "");
    if matches!(words.as_str(), "" | "off" | "none" | "no" | "0" | "nocap") {
        return Ok(None);
    }
    let (number, scale) = match words.chars().last() {
        Some('k') => (&words[..words.len() - 1], 1_000.0),
        Some('m') => (&words[..words.len() - 1], 1_000_000.0),
        Some('b') => (&words[..words.len() - 1], 1_000_000_000.0),
        _ => (words.as_str(), 1.0),
    };
    let n: f64 = number.parse().map_err(|_| {
        format!(
            "“{}” isn't a number of tokens, like 2M or 500k.",
            raw.trim()
        )
    })?;
    let tokens = (n * scale).round();
    if !tokens.is_finite() || tokens < 0.0 {
        return Err(format!("“{}” isn't a number of tokens.", raw.trim()));
    }
    checked(tokens as u64)
}

/// A cap in tokens as stored: 0 is off; at most [`MAX_TOKENS`].
pub fn checked(tokens: u64) -> Result<Option<u64>, String> {
    if tokens == 0 {
        return Ok(None);
    }
    if tokens > MAX_TOKENS {
        return Err("That's more tokens than any week holds. Pick a smaller cap.".to_string());
    }
    Ok(Some(tokens))
}

/// Set (or with `None`, clear) the cap on `a`. Whether it was said reached
/// carries over, so the next tick says "back under" when the new cap lifts
/// it, and nothing when it is still reached.
pub fn set(a: &mut super::store::Agent, tokens: Option<u64>) {
    let reached_at = a.routine_cap.as_ref().and_then(|c| c.reached_at);
    a.routine_cap = tokens.map(|tokens| RoutineCap { tokens, reached_at });
}

/// Whether `new` gives its routines more room than it has now (raising or
/// clearing it): a change another agent can only ask the user for.
pub fn loosens(current: Option<&RoutineCap>, new: Option<u64>) -> bool {
    match (current.map(|c| c.tokens), new) {
        (None, _) => false,
        (Some(_), None) => true,
        (Some(old), Some(new)) => new > old,
    }
}

/// "1.2M", "300k", "900": as the desk and the phone say it (`tokensShortly`).
pub fn tokens_short(n: u64) -> String {
    if n < 1_000 {
        return n.to_string();
    }
    if n < 1_000_000 {
        return format!("{}k", (n as f64 / 1_000.0).round() as u64);
    }
    let m = format!("{:.1}", n as f64 / 1_000_000.0);
    format!("{}M", m.strip_suffix(".0").unwrap_or(&m))
}

/// "tomorrow", "on Tue", "on Nov 26": the day it lifts, from today.
pub fn day_words(day: NaiveDate, today: NaiveDate) -> String {
    match (day - today).num_days() {
        ..=0 => "today".to_string(),
        1 => "tomorrow".to_string(),
        2..=6 => format!("on {}", day.format("%a")),
        _ => format!("on {} {}", day.format("%b"), day.day()),
    }
}

/// The one chat line when it is reached.
pub fn reached_line(
    name: &str,
    cap: u64,
    used: u64,
    lifts: Option<NaiveDate>,
    today: NaiveDate,
) -> String {
    let when = lifts
        .map(|d| format!(", {} if nothing more runs,", day_words(d, today)))
        .unwrap_or_default();
    format!(
        "{name} has used {} tokens this week, past its routines cap of {}. Its routines won't start until it's back under: on its own as older days leave the week{when} or now if you raise or clear the cap (its settings, Usage). Your own messages to it still run.",
        tokens_short(used),
        tokens_short(cap),
    )
}

/// The one chat line when it is back under.
pub fn back_line(cap: u64, used: u64) -> String {
    format!(
        "Back under its routines cap ({} of {} tokens this week): its routines run again.",
        tokens_short(used),
        tokens_short(cap),
    )
}

/// A skipped run's row.
pub fn skipped_detail(cap: u64, used: u64) -> String {
    format!(
        "Skipped: past its routines cap ({} of {} tokens this week).",
        tokens_short(used),
        tokens_short(cap),
    )
}

/// What the tool and the chat say a cap is now.
pub fn cap_words(tokens: Option<u64>) -> String {
    match tokens {
        Some(t) => format!(
            "its routines pause once it has used {} tokens this week",
            tokens_short(t)
        ),
        None => "no routines cap".to_string(),
    }
}

/// An agent with a routine that would start on its own: a repeating one or
/// a "When…" routine, not paused. The reached line is only for these.
pub fn has_unattended(agent: &super::store::Agent) -> bool {
    agent
        .check_ins
        .iter()
        .any(|c| !c.paused && (c.repeat.is_some() || c.watch.is_some()))
}

/// What the minute tick does about one agent's cap: say it was reached (and
/// remember that it said so), or that it is back under.
#[derive(Debug, Clone, PartialEq)]
pub enum Change {
    Reached { line: String },
    Back { line: String },
}

/// Inside the registry update: compare the cap with its week and mark it.
pub fn settle(a: &mut super::store::Agent, today: NaiveDate, now: i64) -> Option<Change> {
    let unattended = has_unattended(a);
    let name = a.name.clone();
    let used = week_tokens(&a.usage, today);
    let lifts = a
        .routine_cap
        .as_ref()
        .and_then(|c| lifts_on(c.tokens, &a.usage, today));
    let cap = a.routine_cap.as_mut()?;
    let over = cap.tokens > 0 && used >= cap.tokens;
    match (over, cap.reached_at) {
        (true, None) if unattended => {
            cap.reached_at = Some(now);
            Some(Change::Reached {
                line: reached_line(&name, cap.tokens, used, lifts, today),
            })
        }
        (false, Some(_)) => {
            cap.reached_at = None;
            Some(Change::Back {
                line: back_line(cap.tokens, used),
            })
        }
        _ => None,
    }
}

#[cfg(test)]
#[path = "routine_cap_tests.rs"]
mod tests;
