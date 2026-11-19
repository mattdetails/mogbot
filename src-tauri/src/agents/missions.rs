//! Missions: give a goal a share of your usage.
//!
//! A mission is a contract the Chief writes with the user in a short talk:
//! one goal, 2–5 checkable criteria ("What counts as done"), a share of each
//! engine's week to spend ("Usage to spend"), what asks first, how often to
//! update. It runs on this Mac, on the agents the Chief already has; the
//! Chief reports progress into it (the `mission` tool), and the app keeps
//! the record and the cap.
//!
//! **Shares, not dollars, and always "about".** A share is points of one
//! engine account's weekly window, as the engine reported it (`inventory`,
//! read about every ten minutes). What a mission has used is what the window
//! rose by since it started ([`observe`]), carried across a refill. An
//! engine with no reading can't be given a usage share; it is capped by
//! time instead ([`ShareKind::Time`]), and is never shown a made-up reading.
//!
//! **Soft stop.** A running turn is never killed. When a reading puts a
//! share at or over its cap the mission pauses ([`tick`]), says where it got
//! to in the Chief's chat with one card (Add 10% / Finish with the other
//! engine / Stop here), and the Chief is told not to start more of it. Adding
//! more is the user's yes. Nothing here ever spends money.
//!
//! **A judge, not the doer, says it's done.** [`Verdict`]s per criterion
//! (Met / Not met / Couldn't check) come from a separate sealed check on
//! another engine where possible (`checked_by`); the page shows it as "It
//! says it checked". A mission is only ever *ready for review* until the user
//! accepts.
//!
//! Stored in `missions.json` beside the registry. Full design:
//! docs/agents.md, "Missions".

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use super::engine::Engine;
use super::store;
use crate::errors::CommandError;

const FILE: &str = "missions.json";
/// Points added by "Add more" unless the user says otherwise.
pub const ADD_POINTS: u32 = 10;
/// Most missions kept (finished ones age out first).
const KEEP: usize = 40;
/// Most events kept per mission.
const EVENTS_KEPT: usize = 300;
/// Most criteria a mission carries.
pub const MAX_CRITERIA: usize = 8;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum State {
    /// Saved from the set-up screen, not started: nothing runs or is spent.
    Draft,
    /// Agreed, the Chief is splitting the work.
    Starting,
    Running,
    /// Paused at a share (or its end date): the soft stop.
    PausedCap,
    /// The user paused it (or the Mac slept past it).
    Paused,
    /// Something it needs is broken (a login expired).
    Blocked,
    /// The judge has looked; waiting on the user's call.
    Ready,
    Done,
    Stopped,
}

impl State {
    /// Still spending (or about to).
    pub fn is_live(self) -> bool {
        matches!(self, State::Starting | State::Running)
    }
    pub fn is_open(self) -> bool {
        !matches!(self, State::Done | State::Stopped)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShareKind {
    /// A share of the engine's weekly window, from its readings.
    Usage,
    /// Capped by time: an engine that reports no usage.
    Time,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Share {
    pub engine: Engine,
    /// A particular account's id; absent, whichever the engine runs on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    pub kind: ShareKind,
    /// Usage: points of the weekly window it may spend. Time: unused.
    #[serde(default)]
    pub pct: f64,
    /// Usage: points spent so far, from readings.
    #[serde(default)]
    pub used_pct: f64,
    /// The last reading's figure, to take the next difference from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_reading: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_resets_at: Option<i64>,
    /// When the last reading was taken, epoch ms. None: never read.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_at: Option<i64>,
    /// Time: how long it may run, and how long it has.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cap_ms: Option<i64>,
    #[serde(default)]
    pub spent_ms: i64,
}

impl Share {
    pub fn usage(engine: Engine, pct: f64) -> Share {
        Share {
            engine,
            account_id: None,
            kind: ShareKind::Usage,
            pct,
            used_pct: 0.0,
            last_reading: None,
            last_resets_at: None,
            read_at: None,
            cap_ms: None,
            spent_ms: 0,
        }
    }
    pub fn time(engine: Engine, cap_ms: i64) -> Share {
        Share {
            kind: ShareKind::Time,
            cap_ms: Some(cap_ms),
            ..Share::usage(engine, 0.0)
        }
    }
    /// Never read (usage) — said so, never guessed.
    pub fn unread(&self) -> bool {
        self.kind == ShareKind::Usage && self.read_at.is_none()
    }
    /// At or over its cap.
    pub fn over(&self) -> bool {
        match self.kind {
            ShareKind::Usage => self.pct > 0.0 && self.used_pct >= self.pct,
            ShareKind::Time => self.cap_ms.is_some_and(|c| self.spent_ms >= c),
        }
    }
}

/// An engine account's weekly window as last read.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Reading {
    pub used_percent: f64,
    pub resets_at: Option<i64>,
    pub observed_at: i64,
}

/// Take a reading into a share: add what the window rose by since the last
/// one. A window that fell (or a new reset time) is a refill: what it reads
/// now is all new. Pure.
pub fn observe(share: &Share, reading: Reading) -> Share {
    let mut s = share.clone();
    if s.kind != ShareKind::Usage {
        return s;
    }
    let cur = reading.used_percent.clamp(0.0, 100.0);
    let refilled = match (s.last_resets_at, reading.resets_at) {
        (Some(a), Some(b)) => b > a + 60_000,
        _ => false,
    };
    match s.last_reading {
        // The first reading is the baseline: nothing spent yet.
        None => {}
        Some(last) if refilled || cur < last => s.used_pct += cur,
        Some(last) => s.used_pct += cur - last,
    }
    s.last_reading = Some(cur);
    s.last_resets_at = reading.resets_at.or(s.last_resets_at);
    s.read_at = Some(reading.observed_at);
    s
}

/// Remove one mission (a discarded draft).
pub fn remove(id: &str) -> Result<(), CommandError> {
    edit(|all| all.retain(|m| m.id != id))
}

/// Add points to a usage share (the user's yes). Pure.
pub fn add_points(share: &Share, points: f64) -> Share {
    let mut s = share.clone();
    match s.kind {
        ShareKind::Usage => s.pct += points,
        ShareKind::Time => {
            // "Add 10%": a tenth more of the time it had.
            s.cap_ms = s.cap_ms.map(|c| c + (c as f64 * points / 100.0) as i64);
        }
    }
    s
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CriterionKind {
    /// Counts up to a target.
    Count,
    /// Counts down to a target (inbox 220 to under 20).
    Reduce,
    /// Pass or fail.
    Check,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    NotStarted,
    InProgress,
    Met,
    /// A rule that has held so far ("No lead contacted twice").
    Holding,
    CouldntCheck,
    NotMet,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Criterion {
    pub id: String,
    pub text: String,
    pub kind: CriterionKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<f64>,
    /// Reduce: where it started.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    pub status: Status,
    /// Where the number came from, and when ("Native OS · read 11:02 pm").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl Criterion {
    pub fn is_met(&self) -> bool {
        match (self.kind, self.value, self.target) {
            (CriterionKind::Count, Some(v), Some(t)) => v >= t,
            (CriterionKind::Reduce, Some(v), Some(t)) => v <= t,
            _ => matches!(self.status, Status::Met | Status::Holding),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub agent: String,
    pub text: String,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Blocked {
    pub what: String,
    /// The app it can't reach, for "Reconnect" ("Native OS").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    /// Who it stops.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub affects: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Updates {
    pub when_blocked: bool,
    pub each_milestone: bool,
    /// Minutes after local midnight, for a daily update.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub daily_at: Option<u32>,
}

/// An agent working on the mission, and what it is doing now.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MissionAgent {
    pub name: String,
    pub engine: Engine,
    /// "Working", "Waiting on you", "Planning", "Idle": its own word; the
    /// page overrides it when the mission itself is paused, blocked or done.
    pub status: String,
}

/// Something the mission is waiting on the user for.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ask {
    pub id: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Met {
    Met,
    NotMet,
    CouldntCheck,
}

/// One criterion as the independent check judged it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub criterion: String,
    pub result: Met,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Mission {
    pub id: String,
    pub goal: String,
    pub criteria: Vec<Criterion>,
    pub shares: Vec<Share>,
    pub state: State,
    pub started_at: i64,
    /// The end date, epoch ms; whichever of it and the shares comes first.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_at: Option<i64>,
    /// The user's own rules for what asks first (spending money always does).
    #[serde(default)]
    pub asks_first: Vec<String>,
    #[serde(default)]
    pub updates: Updates,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocked: Option<Blocked>,
    #[serde(default)]
    pub events: Vec<Event>,
    /// The judge: which engine looked, and what it found.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked_by: Option<Engine>,
    #[serde(default)]
    pub verdicts: Vec<Verdict>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<i64>,
    /// When a cap or the end date stopped it, and which engine's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paused_by: Option<Engine>,
    /// One plain sentence on where it stands, in the Chief's words.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default)]
    pub agents: Vec<MissionAgent>,
    /// What waits on the user.
    #[serde(default)]
    pub asks: Vec<Ask>,
    /// The last time the app looked at it while it ran, epoch ms. A live
    /// mission whose beat is old was asleep with the Mac (`beat`), and the
    /// page says so rather than looking as if it ran.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heartbeat_at: Option<i64>,
    /// The first numeric criterion's readings over time, for the estimate.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub progress_log: Vec<ProgressPoint>,
    /// "Day N of about M": M, fixed the first time the app could estimate
    /// it (two readings, 15% done), so running past it can be said.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimated_days: Option<u32>,
}

/// One reading of the mission's headline number.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPoint {
    pub at: i64,
    pub value: f64,
}

impl Mission {
    pub fn new(goal: &str, criteria: Vec<Criterion>, shares: Vec<Share>, now: i64) -> Mission {
        Mission {
            id: store::new_id()[..8].to_string(),
            goal: goal.trim().to_string(),
            criteria,
            shares,
            state: State::Starting,
            started_at: now,
            end_at: None,
            asks_first: Vec::new(),
            updates: Updates::default(),
            blocked: None,
            events: Vec::new(),
            checked_by: None,
            verdicts: Vec::new(),
            finished_at: None,
            paused_by: None,
            summary: None,
            agents: Vec::new(),
            asks: Vec::new(),
            heartbeat_at: None,
            progress_log: Vec::new(),
            estimated_days: None,
        }
    }

    /// Criteria met of all, by their own numbers.
    pub fn met_count(&self) -> usize {
        self.criteria.iter().filter(|c| c.is_met()).count()
    }

    pub fn push_event(&mut self, agent: &str, text: &str, at: i64) {
        self.events.insert(
            0,
            Event {
                agent: agent.to_string(),
                text: text.trim().to_string(),
                at,
            },
        );
        self.events.truncate(EVENTS_KEPT);
    }
}

/// Checked before a mission starts: a goal, 2–5 criteria, at least one
/// share, each usage share a sane figure. Pure.
pub fn check(goal: &str, criteria: &[Criterion], shares: &[Share]) -> Result<(), String> {
    if goal.trim().is_empty() {
        return Err("A mission needs a goal in one sentence.".into());
    }
    if criteria.len() < 2 || criteria.len() > 5 {
        return Err(
            "\"What counts as done\" is two to five checkable criteria; ask the user for the rest."
                .into(),
        );
    }
    if shares.is_empty() {
        return Err("Give it a share of at least one engine's usage (or a time cap).".into());
    }
    for s in shares {
        if s.kind == ShareKind::Usage && !(1.0..=100.0).contains(&s.pct) {
            return Err(format!(
                "{}'s share is a percent of its week, 1 to 100.",
                s.engine.label()
            ));
        }
    }
    Ok(())
}

/// What a tick found. Pure result of [`tick`].
#[derive(Debug, Clone, PartialEq)]
pub enum Change {
    None,
    /// Paused at this engine's cap (or `None`: at the end date).
    PausedAtCap(Option<Engine>),
}

const DAY_MS: i64 = 24 * 3_600_000;
/// An estimate needs this many readings and this share done.
pub const ESTIMATE_MIN_READINGS: usize = 2;
pub const ESTIMATE_MIN_DONE: f64 = 0.15;
const LOG_KEPT: usize = 60;

/// How far the mission's first numeric criterion has come, 0..=1: a count by
/// its target, a goal that goes down by the distance covered. `None` when
/// there is no such criterion or no number yet. Pure.
pub fn first_progress(m: &Mission) -> Option<f64> {
    let c = m.criteria.iter().find(|c| {
        matches!(c.kind, CriterionKind::Count | CriterionKind::Reduce) && c.target.is_some()
    })?;
    let (v, t) = (c.value?, c.target?);
    match c.kind {
        CriterionKind::Reduce => {
            let start = c.start.unwrap_or_else(|| v.max(t));
            let span = start - t;
            (span > 0.0).then(|| ((start - v) / span).clamp(0.0, 1.0))
        }
        _ => (t > 0.0).then(|| (v / t).clamp(0.0, 1.0)),
    }
}

/// A new reading of the headline number into the log (only a changed one). Pure.
pub fn log_reading(m: &Mission, now: i64) -> Mission {
    let mut next = m.clone();
    let value = m
        .criteria
        .iter()
        .find(|c| {
            matches!(c.kind, CriterionKind::Count | CriterionKind::Reduce) && c.target.is_some()
        })
        .and_then(|c| c.value);
    if let Some(value) = value {
        if next.progress_log.last().map(|p| p.value) != Some(value) {
            next.progress_log.push(ProgressPoint { at: now, value });
            if next.progress_log.len() > LOG_KEPT {
                next.progress_log.remove(0);
            }
        }
    }
    next
}

/// "About M" days in all: elapsed time over the share done, rounded up to a
/// whole day and never less than the day it is. Only with two readings and
/// 15% done; never otherwise, never invented. Pure.
pub fn estimate_days(m: &Mission, now: i64) -> Option<u32> {
    if m.progress_log.len() < ESTIMATE_MIN_READINGS {
        return None;
    }
    let done = first_progress(m)?;
    if done < ESTIMATE_MIN_DONE {
        return None;
    }
    let elapsed = (now - m.started_at).max(0) as f64;
    let total_days = (elapsed / done / DAY_MS as f64).ceil() as u32;
    let today = (elapsed / DAY_MS as f64).floor() as u32 + 1;
    Some(total_days.max(today))
}

/// Fix the estimate the first time one can be made. Pure.
pub fn with_estimate(m: &Mission, now: i64) -> Mission {
    let mut next = m.clone();
    if next.estimated_days.is_none() {
        next.estimated_days = estimate_days(&next, now);
    }
    next
}

/// The scheduler looks about once a minute: a longer gap than this since the
/// last beat was the Mac asleep (or the app closed), not time spent.
pub const AWAKE_STEP_MS: i64 = 3 * 60_000;
/// A gap this long gets a line in the updates ("Your Mac was asleep").
pub const SLEPT_MS: i64 = 10 * 60_000;

/// A beat of the scheduler for a live mission: time-capped shares are charged
/// only the time the app was really awake, and a long gap since the last beat
/// is returned as the sleep it was. Pure.
pub fn beat(m: &Mission, now: i64) -> (Mission, Option<(i64, i64)>) {
    let mut next = m.clone();
    if !m.state.is_live() {
        return (next, None);
    }
    let prev = m.heartbeat_at.unwrap_or(now);
    let gap = (now - prev).max(0);
    for share in &mut next.shares {
        if share.kind == ShareKind::Time {
            share.spent_ms += gap.min(AWAKE_STEP_MS);
        }
    }
    next.heartbeat_at = Some(now);
    (next, (gap >= SLEPT_MS).then_some((prev, now)))
}

/// Move a live mission on given fresh readings (one per engine) and the
/// time. Only a live mission can pause; the others just keep their numbers.
/// Pure over its inputs.
pub fn tick(m: &Mission, readings: &[(Engine, Reading)], now: i64) -> (Mission, Change) {
    let mut next = m.clone();
    for share in &mut next.shares {
        if let Some((_, r)) = readings.iter().find(|(e, _)| *e == share.engine) {
            *share = observe(share, *r);
        }
    }
    if !m.state.is_live() {
        return (next, Change::None);
    }
    if let Some(over) = next.shares.iter().find(|s| s.over()) {
        let engine = over.engine;
        next.state = State::PausedCap;
        next.paused_by = Some(engine);
        return (next, Change::PausedAtCap(Some(engine)));
    }
    if next.end_at.is_some_and(|end| now >= end) {
        next.state = State::PausedCap;
        next.paused_by = None;
        return (next, Change::PausedAtCap(None));
    }
    (next, Change::None)
}

/// The words the pause says in the Chief's chat. "About" on every cap. Pure.
pub fn pause_text(m: &Mission, engine: Option<Engine>) -> String {
    let done = m.met_count();
    let total = m.criteria.len();
    match engine {
        Some(e) => {
            let pct = m
                .shares
                .iter()
                .find(|s| s.engine == e && s.kind == ShareKind::Usage)
                .map(|s| s.pct)
                .unwrap_or(0.0);
            if pct > 0.0 {
                format!(
                    "Used about all of {}'s {}%. {done} of {total} criteria met. Add more or stop?",
                    e.label(),
                    pct.round()
                )
            } else {
                format!(
                    "{} reached its time cap. {done} of {total} criteria met. Add more or stop?",
                    e.label()
                )
            }
        }
        None => {
            format!("The end date came. {done} of {total} criteria met. Add more time or stop?")
        }
    }
}

/// The user's yes to more: add points to one engine's share (a mission
/// paused at it carries on). Pure.
pub fn add_more(m: &Mission, engine: Engine, points: f64) -> Mission {
    let mut next = m.clone();
    for s in &mut next.shares {
        if s.engine == engine {
            *s = add_points(s, points);
        }
    }
    if next.state == State::PausedCap && !next.shares.iter().any(|s| s.over()) {
        next.state = State::Running;
        next.paused_by = None;
    }
    next
}

/// The judge's verdicts into the record: the mission is then ready for the
/// user's call, never done by the doer's say. Pure.
pub fn judged(m: &Mission, checked_by: Engine, verdicts: Vec<Verdict>, now: i64) -> Mission {
    let mut next = m.clone();
    for v in &verdicts {
        if let Some(c) = next.criteria.iter_mut().find(|c| c.id == v.criterion) {
            c.status = match v.result {
                Met::Met => Status::Met,
                Met::NotMet => Status::NotMet,
                Met::CouldntCheck => Status::CouldntCheck,
            };
        }
    }
    next.checked_by = Some(checked_by);
    next.verdicts = verdicts;
    next.state = State::Ready;
    next.finished_at = Some(now);
    next
}

/// The judge ran on the engine that did the work: worth saying. Pure.
pub fn judge_was_independent(m: &Mission, doers: &[Engine]) -> bool {
    m.checked_by.is_some_and(|c| !doers.contains(&c))
}

/* ----------------------------------------------------------------- store */

static LOCK: Mutex<()> = Mutex::new(());

fn path() -> Result<std::path::PathBuf, CommandError> {
    Ok(store::agents_root()?.join(FILE))
}

pub fn list() -> Vec<Mission> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    path()
        .ok()
        .and_then(|p| super::survive::read_kept(&p, "Your missions"))
        .unwrap_or_default()
}

fn save(missions: &[Mission]) -> Result<(), CommandError> {
    let json = serde_json::to_vec_pretty(missions).map_err(super::err_other)?;
    store::write_atomic(&path()?, &json)
}

/// Change the stored list under the lock.
pub fn edit<T>(f: impl FnOnce(&mut Vec<Mission>) -> T) -> Result<T, CommandError> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut all: Vec<Mission> = path()
        .ok()
        .and_then(|p| super::survive::read_kept(&p, "Your missions"))
        .unwrap_or_default();
    let out = f(&mut all);
    // Finished ones age out first.
    if all.len() > KEEP {
        let drop = all.len() - KEEP;
        let mut gone = 0;
        all.retain(|m| {
            if gone < drop && !m.state.is_open() {
                gone += 1;
                false
            } else {
                true
            }
        });
    }
    save(&all)?;
    Ok(out)
}

pub fn get(id: &str) -> Option<Mission> {
    list().into_iter().find(|m| m.id == id)
}

/// Replace one mission by id.
pub fn put(m: Mission) -> Result<(), CommandError> {
    edit(|all| match all.iter_mut().find(|x| x.id == m.id) {
        Some(slot) => *slot = m,
        None => all.insert(0, m),
    })
}

/// The live missions' standing line for the Chief's briefing, so it doesn't
/// hand out work to one that's paused. `None` with nothing open. Pure over
/// the list.
pub fn briefing(all: &[Mission]) -> Option<String> {
    let open: Vec<&Mission> = all.iter().filter(|m| m.state.is_open()).collect();
    if open.is_empty() {
        return None;
    }
    let mut out = String::from(
        "## Missions\n\nGoals with a share of the user's usage. Report progress with `mission` (criteria values, events); never start work for one that isn't running; the app pauses a mission at about its share and asks the user. Judge a finished one with a separate check, never by your own say.",
    );
    for m in open.iter().take(4) {
        let state = match m.state {
            State::Draft => "a draft, not started",
            State::Starting => "starting",
            State::Running => "running",
            State::PausedCap => "paused at its share, waiting on the user",
            State::Paused => "paused",
            State::Blocked => "blocked",
            State::Ready => "ready for the user's review",
            _ => "",
        };
        out.push_str(&format!(
            "\n- [{}] {} ({state}; {} of {} criteria met)",
            m.id,
            clip(&m.goal, 90),
            m.met_count(),
            m.criteria.len()
        ));
    }
    Some(out)
}

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.to_string();
    }
    let kept: String = s.chars().take(n.saturating_sub(1)).collect();
    format!("{}…", kept.trim_end())
}

#[cfg(test)]
#[path = "missions_tests.rs"]
mod tests;
