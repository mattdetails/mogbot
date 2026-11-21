//! Terminal tabs on the wallet's accounts: a Claude Code or Codex tab in a
//! project starts on the account agents would use now, and a Claude Code tab
//! that runs out of usage moves to the next one, keeping its conversation.
//!
//! **Which tabs.** Only a project in the Default workspace, where the tab
//! would otherwise run on this Mac's own sign-in. A project in another
//! workspace runs on that workspace's login, as the user set it, and is
//! never switched; nor is a tab whose workspace routes Claude Code elsewhere
//! (`ANTHROPIC_BASE_URL`). With fewer than two signed-in accounts there is
//! nothing to choose and nothing changes. Settings → Accounts & usage has the
//! choice ([`Mode`], `tab-accounts.json` beside the wallet): **Ask me** (the
//! default: a bar on the tab, one click, so a restart is never a surprise),
//! **Switch on its own**, or **Off** (tabs run on this Mac's sign-in, as
//! before).
//!
//! **Starting.** [`pick`] runs as the tab's process is opened: the first
//! signed-in account in the user's order that isn't out (`wallet::choose`,
//! the rule every agent turn uses, so "out" is the same everywhere). A tab
//! resuming its session gets the newest copy of its transcript carried into
//! that account's folder first (`wallet::carry_session`).
//!
//! **Running out.** Claude Code writes the limit into its own transcript as
//! a structured entry (`"isApiErrorMessage": true`, `"apiError":
//! "usage_limit_reached"`, `quotaLimits.resetsAt` in epoch seconds; observed
//! on 2.1.310). [`spawn`] reads what each tracked tab's transcript gained
//! since the tab started, so an old limit in a resumed conversation never
//! counts, and the text of the conversation never does. On one: the account
//! is marked out until the reset it reported (as an agent turn would), and
//! the tab gets one notice (`tab-account`): switch to the next account,
//! ask to, or say every account is out and when the first is back. The tab
//! restarts its process with `--resume` on the next account and the continue
//! prompt ([`CONTINUE`]), so the conversation carries on where it stopped.
//!
//! **Limits.** Codex tabs are started on the right account but not switched
//! mid-way: a tab doesn't keep a Codex session to resume. A Claude Code tab
//! whose user ran `/clear` has a new session id this module doesn't know,
//! so its limit is left to Claude Code's own message.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use super::engine::Engine;
use super::quota::QuotaWindow;
use super::wallet::{self, Account, Choice, LimitHit};
use crate::errors::CommandError;

/// How often tracked tabs' transcripts are read.
const EVERY: Duration = Duration::from_secs(3);

/// At most this much of a transcript is read in one go (a resumed tab's
/// first read after a long reply).
const READ_MAX: u64 = 4 * 1024 * 1024;

/// What the tab is told on the next account, as its opening prompt.
pub const CONTINUE: &str = "Continue where you left off. Your last reply stopped because that account reached its usage limit; this is the same conversation on another account.";

/* ---------------------------------------------------------------- the mode */

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    /// Switch to the next account on its own, with a line in the tab.
    Auto,
    /// A bar on the tab: "Continue on <account>?" The default.
    #[default]
    Ask,
    /// Tabs run on this Mac's own sign-in, as before.
    Off,
}

impl Mode {
    pub fn parse(value: &str) -> Result<Mode, CommandError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "auto" => Ok(Mode::Auto),
            "ask" => Ok(Mode::Ask),
            "off" => Ok(Mode::Off),
            _ => Err(CommandError::expected(
                "Choose auto, ask or off.".to_string(),
            )),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct File {
    #[serde(default)]
    mode: Mode,
}

static FILE_LOCK: Mutex<()> = Mutex::new(());

fn path() -> Result<PathBuf, CommandError> {
    Ok(super::store::agents_root()?.join("tab-accounts.json"))
}

pub fn mode() -> Mode {
    let _guard = FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    path()
        .ok()
        .and_then(|p| {
            super::survive::read_kept::<File>(
                &p,
                "Your choice about switching accounts in terminal tabs",
            )
        })
        .unwrap_or_default()
        .mode
}

pub fn set_mode(mode: Mode) -> Result<(), CommandError> {
    let _guard = FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let json = serde_json::to_vec_pretty(&File { mode }).map_err(super::err_other)?;
    super::store::write_atomic(&path()?, &json)
}

/* ----------------------------------------------------------- the notice */

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum NoticeKind {
    /// Move to `to`: on its own (`ask == false`) or when the user says so.
    Switch,
    /// Every signed-in account is out.
    AllOut,
}

/// What a tab is told when its account runs out.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub session_id: String,
    pub kind: NoticeKind,
    /// Wait for the user's click before switching.
    pub ask: bool,
    /// The one line said about it: "Switched to Work: Personal is out of
    /// usage until 10:30 PM." / "Both Claude Code accounts have reached …"
    pub line: String,
    /// The account it moves to, as it is shown.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// The opening prompt on the next account.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
}

/* ------------------------------------------------------------- the runs */

/// A tab running on an account of the wallet.
#[derive(Debug, Clone)]
struct Run {
    engine: Engine,
    account: Account,
    /// Claude Code's session id, from the tab's argv.
    session: Option<String>,
    /// The session's transcript, once it exists.
    transcript: Option<PathBuf>,
    /// How far it has been read (everything before was there already).
    read_to: u64,
    /// A notice the tab hasn't acted on yet.
    pending: Option<Notice>,
}

static RUNS: LazyLock<Mutex<HashMap<String, Run>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn runs() -> std::sync::MutexGuard<'static, HashMap<String, Run>> {
    RUNS.lock().unwrap_or_else(|e| e.into_inner())
}

/// Tabs the account chip is offered on: opened in the Default workspace,
/// not routed elsewhere, with switching not off and two accounts to choose
/// between (what [`pick`] checks). Kept apart from [`RUNS`] so a tab still
/// shows its chip while it restarts.
static ELIGIBLE: LazyLock<Mutex<std::collections::HashSet<String>>> =
    LazyLock::new(|| Mutex::new(std::collections::HashSet::new()));

/// The account the user chose for a tab's next start (the chip's menu):
/// taken once by [`pick`], ignored if that account isn't signed in by then.
static PREFER: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn eligible() -> std::sync::MutexGuard<'static, std::collections::HashSet<String>> {
    ELIGIBLE.lock().unwrap_or_else(|e| e.into_inner())
}

fn prefer() -> std::sync::MutexGuard<'static, HashMap<String, String>> {
    PREFER.lock().unwrap_or_else(|e| e.into_inner())
}

/// Remember the user's choice for this tab's next start.
pub fn set_preference(pty_session: &str, account_id: &str) {
    prefer().insert(pty_session.to_string(), account_id.to_string());
}

/// The account to start on: the user's choice for this tab when it is
/// signed in (taken either way, so it applies to one start only), else the
/// wallet's.
pub fn preferred_or_chosen(
    pty_session: &str,
    candidates: &[wallet::Candidate],
    now: i64,
) -> Option<Account> {
    let wanted = prefer().remove(pty_session);
    if let Some(c) = wanted.and_then(|id| {
        candidates
            .iter()
            .find(|c| c.signed_in && c.account.id == id)
    }) {
        return Some(c.account.clone());
    }
    match wallet::choose(candidates, &[], now) {
        Choice::Run(account) => Some(account),
        // Every one is out: the first, and the engine says so in the tab.
        Choice::AllOut { .. } => candidates
            .iter()
            .find(|c| c.signed_in)
            .map(|c| c.account.clone()),
    }
}

/// The Claude Code sessions project tabs are running now: they move
/// accounts on their own, so the menu bar leaves them out (`tray_accounts`).
pub fn tracked_sessions() -> std::collections::HashSet<String> {
    runs().values().filter_map(|r| r.session.clone()).collect()
}

/// What the tab's process is opened with to run as the account picked.
#[derive(Debug, Default)]
pub struct Picked {
    pub env: Vec<(String, String)>,
    pub unset: Vec<&'static str>,
}

/// The engine a tab's agent id runs, when it is one with a plan.
pub fn engine_of(agent_id: &str) -> Option<Engine> {
    match agent_id {
        "claude-code" => Some(Engine::Claude),
        "codex" => Some(Engine::Codex),
        _ => None,
    }
}

/// Claude Code's session id in a tab's argv, and whether it resumes it.
pub fn session_arg(args: &[String]) -> Option<(String, bool)> {
    args.windows(2).find_map(|w| match w[0].as_str() {
        "--resume" => Some((w[1].clone(), true)),
        "--session-id" => Some((w[1].clone(), false)),
        _ => None,
    })
}

/// Called as a tab's process is opened. Nothing to add (this Mac's own
/// sign-in, as before) unless the tab is one this module looks after.
pub async fn pick(
    pty_session: &str,
    agent_id: Option<&str>,
    project_path: Option<&str>,
    args: &[String],
    workspace_env: &HashMap<String, String>,
) -> Picked {
    forget(pty_session);
    let Some(engine) = agent_id.and_then(engine_of) else {
        return Picked::default();
    };
    let Some(project) = project_path else {
        return Picked::default();
    };
    let workspace = crate::commands::projects::project_account_id_sync(Path::new(project));
    if workspace != crate::commands::accounts::DEFAULT_ACCOUNT_ID
        || workspace_env.contains_key("ANTHROPIC_BASE_URL")
        || mode() == Mode::Off
    {
        eligible().remove(pty_session);
        prefer().remove(pty_session);
        return Picked::default();
    }
    let candidates = wallet::candidates(engine).await;
    if candidates.iter().filter(|c| c.signed_in).count() < 2 {
        eligible().remove(pty_session);
        prefer().remove(pty_session);
        return Picked::default();
    }
    if engine == Engine::Claude {
        eligible().insert(pty_session.to_string());
    }
    let now = super::store::now_ms();
    let Some(account) = preferred_or_chosen(pty_session, &candidates, now) else {
        return Picked::default();
    };
    let session = match (engine, session_arg(args)) {
        (Engine::Claude, Some((id, resume))) => {
            if resume {
                wallet::carry_session(&account, &id);
            }
            Some(id)
        }
        _ => None,
    };
    wallet::prepare(&account);
    let transcript = session
        .as_deref()
        .and_then(|s| find_transcript(&wallet::folder(&account), s));
    let read_to = transcript
        .as_deref()
        .and_then(|p| std::fs::metadata(p).ok())
        .map_or(0, |m| m.len());
    tracing::info!(
        engine = engine.word(),
        account = %account.id,
        "[tab_accounts] tab opened on a wallet account"
    );
    let picked = Picked {
        env: wallet::env_for(&account),
        unset: wallet::env_unset_for(&account),
    };
    runs().insert(
        pty_session.to_string(),
        Run {
            engine,
            account,
            session,
            transcript,
            read_to,
            pending: None,
        },
    );
    picked
}

/// The tab closed, or opened as something this module doesn't look after.
pub fn forget(pty_session: &str) {
    runs().remove(pty_session);
}

/// The notice a tab hasn't acted on (a tab mounted after it came).
pub fn pending(pty_session: &str) -> Option<Notice> {
    runs().get(pty_session).and_then(|r| r.pending.clone())
}

/// The tab acted on its notice, or the user put it away.
pub fn settle(pty_session: &str) {
    if let Some(run) = runs().get_mut(pty_session) {
        run.pending = None;
    }
}

/// What the account chip on a terminal tab shows and offers.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TabAccounts {
    /// The account the tab runs on, as it is shown; none: this Mac's own
    /// sign-in (or nothing known yet).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current: Option<String>,
    /// Empty: the tab can't be switched (another workspace's login, a
    /// routed base URL, switching off, or one account).
    pub accounts: Vec<TabAccount>,
    /// The tab's account will likely run out before it refills, and another
    /// has room: offered, never done on its own ([`suggestion_of`]).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggest: Option<Suggestion>,
}

/// "Continue on Personal?": the tab's account is nearly used up and, at the
/// pace of its own readings, runs out before that window refills.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    /// Always true: it rests on the pace of readings (`forecast::pace`), not
    /// on a reading.
    pub estimate: bool,
    pub to_id: String,
    pub to_name: String,
    /// "At this pace Work runs out at 3:40 PM, before its 5-hour limit
    /// refills (an estimate). Personal has 80% left."
    pub line: String,
}

/// From this much used of a window, a run-out before its refill is offered.
pub const SUGGEST_FROM_USED: f64 = 75.0;
/// The account offered instead has at least this much left.
pub const SUGGEST_ROOM_LEFT: u8 = 30;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TabAccount {
    pub id: String,
    /// Its name as shown everywhere.
    pub name: String,
    /// Its line in the menu: "Work · 61% left", "Personal · out until 4 PM".
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_percent: Option<u8>,
    pub out: bool,
    pub current: bool,
    /// Left of its 5-hour limit, 0–100, when read and still current.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_left: Option<u8>,
    /// Left of its weekly limit, 0–100, when read and still current.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub week_left: Option<u8>,
}

/// What is left of one window kind (`five_hour`, `seven_day`), when it was
/// read and hasn't refilled since.
pub fn window_left(windows: &[QuotaWindow], kind: &str, now: i64) -> Option<u8> {
    windows
        .iter()
        .filter(|w| w.kind == kind && w.resets_at.is_none_or(|r| r > now))
        .find_map(|w| w.used_percent)
        .map(|used| (100.0 - used).clamp(0.0, 100.0).round() as u8)
}

fn window_words(kind: &str) -> &'static str {
    if kind == "five_hour" {
        "5-hour"
    } else {
        "weekly"
    }
}

/// The offer to move on ([`Suggestion`]): the current account has used
/// [`SUGGEST_FROM_USED`] of a window whose pace reaches 100% before its
/// refill, and another signed-in account (not a second sign-in of the same
/// one) has [`SUGGEST_ROOM_LEFT`] or more left. The roomiest is offered.
pub fn suggestion_of<Tz: chrono::TimeZone>(
    lines: &[super::inventory::AccountLine],
    current_id: Option<&str>,
    tz: &Tz,
    now: i64,
) -> Option<Suggestion>
where
    Tz::Offset: std::fmt::Display,
{
    let claude = |l: &&super::inventory::AccountLine| l.engine == Engine::Claude && l.signed_in;
    let current = lines
        .iter()
        .filter(claude)
        .find(|l| Some(l.id.as_str()) == current_id && !l.out)?;
    let pace = current
        .windows
        .iter()
        .filter(|w| w.resets_at.is_none_or(|r| r > now))
        .filter(|w| w.used_percent.is_some_and(|u| u >= SUGGEST_FROM_USED))
        .filter_map(|w| {
            current
                .pace
                .iter()
                .find(|p| p.kind == w.kind && p.reaches_at > now && p.reaches_at < p.resets_at)
        })
        .min_by_key(|p| p.reaches_at)?;
    let same = |a: &super::inventory::AccountLine, b: &super::inventory::AccountLine| {
        a.same_as.as_deref() == Some(b.name.as_str())
            || b.same_as.as_deref() == Some(a.name.as_str())
    };
    let (to, left) = lines
        .iter()
        .filter(claude)
        .filter(|l| l.id != current.id && !l.out && !same(l, current))
        .filter_map(|l| super::tray_accounts::left_percent(&l.windows, now).map(|left| (l, left)))
        .filter(|(_, left)| *left >= SUGGEST_ROOM_LEFT)
        .max_by_key(|(_, left)| *left)?;
    let when = super::failure::clock_phrase(tz, pace.reaches_at, now);
    Some(Suggestion {
        estimate: true,
        to_id: to.id.clone(),
        to_name: to.name.clone(),
        line: format!(
            "At this pace {} runs out {when}, before its {} limit refills (an estimate). {} has {left}% left.",
            current.name,
            window_words(&pace.kind),
            to.name
        ),
    })
}

/// The chip's view for a tab, from the accounts as the menu bar reads them.
pub async fn info(pty_session: &str) -> TabAccounts {
    if !eligible().contains(pty_session) {
        return TabAccounts::default();
    }
    let current_id = runs().get(pty_session).map(|r| r.account.id.clone());
    let inv = super::inventory::read().await;
    let now = super::store::now_ms();
    view_of(&inv.accounts, current_id.as_deref(), &chrono::Local, now)
}

/// [`info`]'s view from the inventory's lines: Claude Code's signed-in
/// accounts in the user's order.
pub fn view_of<Tz: chrono::TimeZone>(
    lines: &[super::inventory::AccountLine],
    current_id: Option<&str>,
    tz: &Tz,
    now: i64,
) -> TabAccounts
where
    Tz::Offset: std::fmt::Display,
{
    let accounts: Vec<TabAccount> = lines
        .iter()
        .filter(|l| l.engine == Engine::Claude && l.signed_in)
        .map(|l| TabAccount {
            id: l.id.clone(),
            name: l.name.clone(),
            label: super::tray_accounts::account_label(l, tz, now),
            left_percent: if l.out {
                None
            } else {
                super::tray_accounts::left_percent(&l.windows, now)
            },
            out: l.out,
            current: current_id == Some(l.id.as_str()),
            session_left: if l.out {
                None
            } else {
                window_left(&l.windows, "five_hour", now)
            },
            week_left: if l.out {
                None
            } else {
                window_left(&l.windows, "seven_day", now)
            },
        })
        .collect();
    if accounts.len() < 2 {
        return TabAccounts::default();
    }
    TabAccounts {
        current: accounts.iter().find(|a| a.current).map(|a| a.name.clone()),
        accounts,
        suggest: suggestion_of(lines, current_id, tz, now),
    }
}

/// The user picked an account on the tab's chip: it starts there next, and
/// the tab is told to restart with its conversation (as a switch is).
pub async fn choose(pty_session: &str, account_id: &str) -> Result<Notice, CommandError> {
    if !eligible().contains(pty_session) {
        return Err(CommandError::expected(
            "This tab can't change accounts.".to_string(),
        ));
    }
    let candidates = wallet::candidates(Engine::Claude).await;
    let Some(to) = candidates
        .iter()
        .find(|c| c.signed_in && c.account.id == account_id)
        .map(|c| c.account.clone())
    else {
        return Err(CommandError::expected(
            "That account isn't signed in. Sign it in again in Settings → Accounts & usage."
                .to_string(),
        ));
    };
    set_preference(pty_session, &to.id);
    Ok(chosen_notice(pty_session, &to.name))
}

/// What the tab is told when the user moves it: restart, on `to`, with the
/// conversation.
pub fn chosen_notice(pty_session: &str, to: &str) -> Notice {
    Notice {
        session_id: pty_session.to_string(),
        kind: NoticeKind::Switch,
        ask: false,
        line: format!("Continuing on {to}…"),
        to: Some(to.to_string()),
        prompt: Some(CONTINUE.to_string()),
    }
}

/// The account a tab runs on, as it is shown (none: this Mac's own sign-in,
/// as every tab did before).
pub fn account_of(pty_session: &str) -> Option<String> {
    runs()
        .get(pty_session)
        .filter(|r| !r.account.is_this_mac())
        .map(|r| r.account.name.clone())
}

/* ------------------------------------------------------------ the reading */

/// `<folder>/projects/<any>/<session>.jsonl`, where Claude Code writes it.
fn find_transcript(folder: &Path, session: &str) -> Option<PathBuf> {
    let name = format!("{session}.jsonl");
    std::fs::read_dir(folder.join("projects"))
        .ok()?
        .flatten()
        .map(|d| d.path().join(&name))
        .find(|p| p.is_file())
}

/// One transcript line: `Some(resets_at)` when it is Claude Code's own
/// usage-limit entry (the reset in epoch ms when it said).
pub fn limit_in(line: &str) -> Option<Option<i64>> {
    if !line.contains("isApiErrorMessage") {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if value.get("isApiErrorMessage").and_then(|v| v.as_bool()) != Some(true) {
        return None;
    }
    let secs = |v: Option<&serde_json::Value>| v.and_then(|v| v.as_i64()).map(|s| s * 1000);
    let reported = secs(value.pointer("/quotaLimits/resetsAt"))
        .or_else(|| secs(value.pointer("/apiErrorParams/rate_limit_info/resetsAt")));
    match value.get("apiError").and_then(|v| v.as_str()) {
        Some("usage_limit_reached") => return Some(reported),
        // A typed error that isn't the limit (a 429 blip, a long prompt).
        Some(_) => return None,
        None => {}
    }
    // An older Claude Code: its words, as an agent turn's failure is read.
    let text: String = value
        .pointer("/message/content")
        .and_then(|c| c.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    let (_, failure) = super::failure::describe_now(Engine::Claude, &text);
    (failure.kind == super::failure::FailureKind::UsageLimit)
        .then_some(reported.or(failure.resets_at))
}

/// What a transcript gained since `from`: whole lines only, and how far
/// they reach.
pub fn read_new(path: &Path, from: u64) -> Option<(Vec<String>, u64)> {
    let len = std::fs::metadata(path).ok()?.len();
    if len < from {
        // Replaced by a shorter copy (a carry): start again from its end.
        return Some((Vec::new(), len));
    }
    if len == from {
        return None;
    }
    let mut file = std::fs::File::open(path).ok()?;
    file.seek(SeekFrom::Start(from)).ok()?;
    let mut bytes = Vec::new();
    file.take(READ_MAX).read_to_end(&mut bytes).ok()?;
    let whole = bytes.iter().rposition(|b| *b == b'\n').map_or(0, |i| i + 1);
    if whole == 0 {
        return None;
    }
    let text = String::from_utf8_lossy(&bytes[..whole]);
    Some((
        text.lines().map(str::to_string).collect(),
        from + whole as u64,
    ))
}

/// One pass over the tracked tabs.
async fn check(app: &AppHandle) {
    let tracked: Vec<(String, Run)> = runs()
        .iter()
        .filter(|(_, r)| r.engine == Engine::Claude && r.pending.is_none())
        .map(|(id, r)| (id.clone(), r.clone()))
        .collect();
    for (id, run) in tracked {
        let alive = crate::commands::pty_session::session_snapshot(&id).is_some_and(|s| s.alive);
        if !alive {
            // Exited: a restart opens it again through `pick`.
            continue;
        }
        let Some(session) = run.session.as_deref() else {
            continue;
        };
        let transcript = run
            .transcript
            .clone()
            .or_else(|| find_transcript(&wallet::folder(&run.account), session));
        let Some(transcript) = transcript else {
            continue;
        };
        let Some((lines, read_to)) = read_new(&transcript, run.read_to) else {
            if run.transcript.is_none() {
                remember(&id, Some(transcript), run.read_to);
            }
            continue;
        };
        remember(&id, Some(transcript), read_to);
        if let Some(resets_at) = lines.iter().rev().find_map(|l| limit_in(l)) {
            ran_out(app, &id, &run, resets_at).await;
        }
    }
}

fn remember(id: &str, transcript: Option<PathBuf>, read_to: u64) {
    if let Some(run) = runs().get_mut(id) {
        run.transcript = transcript;
        run.read_to = read_to;
    }
}

/// A tab's account ran out: mark it, and tell the tab what happens next.
async fn ran_out(app: &AppHandle, id: &str, run: &Run, resets_at: Option<i64>) {
    let now = super::store::now_ms();
    wallet::mark_out_with_twins(run.engine, &run.account.id, resets_at, now);
    let candidates = wallet::candidates(run.engine).await;
    let from = Account {
        limit: Some(LimitHit { at: now, resets_at }),
        ..run.account.clone()
    };
    let notice = notice_for(id, &from, &candidates, mode(), &chrono::Local, now);
    tracing::info!(
        account = %run.account.id,
        kind = ?notice.kind,
        "[tab_accounts] a tab's account reached its usage limit"
    );
    if let Some(r) = runs().get_mut(id) {
        r.pending = Some(notice.clone());
    }
    let _ = app.emit("tab-account", &notice);
}

/// What the tab is told, from the accounts as they are now.
pub fn notice_for<Tz: chrono::TimeZone>(
    session_id: &str,
    from: &Account,
    candidates: &[wallet::Candidate],
    mode: Mode,
    tz: &Tz,
    now: i64,
) -> Notice
where
    Tz::Offset: std::fmt::Display,
{
    match wallet::choose(candidates, std::slice::from_ref(&from.id), now) {
        Choice::Run(to) => Notice {
            session_id: session_id.to_string(),
            kind: NoticeKind::Switch,
            ask: mode == Mode::Ask,
            line: wallet::switch_line(&to, Some(from), tz, now),
            to: Some(to.name.clone()),
            prompt: Some(CONTINUE.to_string()),
        },
        Choice::AllOut { earliest, count } => Notice {
            session_id: session_id.to_string(),
            kind: NoticeKind::AllOut,
            ask: false,
            line: wallet::all_out_line(from.engine, count, earliest, tz, now),
            to: None,
            prompt: None,
        },
    }
}

/// Every [`EVERY`] while the app is open; a pass with no tracked tab reads
/// nothing.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(EVERY).await;
            if runs().is_empty() {
                continue;
            }
            super::survive::tick("tab_accounts", check(&app)).await;
        }
    });
}

#[cfg(test)]
#[path = "tab_accounts_tests.rs"]
mod tests;
