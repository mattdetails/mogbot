//! The menu bar's Accounts section (`tray`): every account the team runs on,
//! in the user's order, with what is left on it; and Claude Code chats run
//! in the user's own Terminal, each with "Continue on <account>".
//!
//! Mogbot's own agents and project tabs already move to the next account
//! when one runs out (`wallet`, `tab_accounts`). A chat in another app's
//! Terminal can't be restarted from here, so it is watched instead: when its
//! transcript records Claude Code's usage-limit entry, the account is marked
//! out (so agents skip it too), a notification says so, and the menu offers
//! the chat on the next account with room. Continuing copies the chat into
//! that account's folder (`wallet::carry_session`) and opens it in a new
//! Terminal window with only `CLAUDE_CONFIG_DIR` set: never a token, so an
//! account kept only as an older build's Keychain token isn't offered.
//!
//! Nothing is estimated: "N% left" is the engine's own last reading, "out
//! until" the reset it reported (`inventory`).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

use super::engine::Engine;
use super::inventory::AccountLine;
use super::quota::QuotaWindow;
use super::wallet::{self, Account};

/// How often the accounts and chats are read again while the app is open.
const EVERY: Duration = Duration::from_secs(60);
/// How often running chats are checked for the usage limit.
const WATCH_EVERY: Duration = Duration::from_secs(20);
/// Chats touched this recently are offered; older ones aren't "this chat" any more.
const RECENT_MS: i64 = 24 * 60 * 60 * 1000;
/// Chats touched this recently are watched for the limit.
const WATCH_MS: i64 = 30 * 60 * 1000;
/// Chats listed in the menu.
pub const MAX_CHATS: usize = 5;
/// The first lines of a chat are read for its folder and first message.
const HEAD_BYTES: u64 = 256 * 1024;
const SAID_MAX: usize = 32;

/// One account's line in the menu.
#[derive(Debug, Clone, PartialEq)]
pub struct AccountRow {
    pub engine: Engine,
    pub id: String,
    pub label: String,
    /// The engine's next turn runs on it.
    pub next: bool,
}

/// An account a chat can continue on.
#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    pub account_id: String,
    pub label: String,
}

/// One Terminal chat in the menu.
#[derive(Debug, Clone, PartialEq)]
pub struct ChatRow {
    pub session: String,
    pub label: String,
    pub targets: Vec<Target>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Model {
    pub accounts: Vec<AccountRow>,
    pub chats: Vec<ChatRow>,
}

/// A chat found on disk.
#[derive(Debug, Clone)]
struct Found {
    session: String,
    path: PathBuf,
    modified: i64,
    account: Account,
    cwd: PathBuf,
    said: Option<String>,
}

static MODEL: Mutex<Option<Model>> = Mutex::new(None);
/// Where each listed chat is, by session, for a click to act on.
static FOUND: Mutex<Vec<Found>> = Mutex::new(Vec::new());
/// Each chat's folder and first message, read once: neither changes.
type Head = (Option<PathBuf>, Option<String>);
static HEADS: Mutex<Option<HashMap<PathBuf, Head>>> = Mutex::new(None);
/// How far each watched transcript has been read.
static READ_TO: Mutex<Option<HashMap<PathBuf, u64>>> = Mutex::new(None);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The section as last read; empty before the first read.
pub fn model() -> Model {
    lock(&MODEL).clone().unwrap_or_default()
}

/* ------------------------------------------------------------ labels */

/// What is left on an account, from its readings still current: the
/// tightest window's remainder. `None` with no reading.
pub fn left_percent(windows: &[QuotaWindow], now: i64) -> Option<u8> {
    windows
        .iter()
        .filter(|w| w.resets_at.is_none_or(|r| r > now))
        .filter_map(|w| w.used_percent)
        .fold(None, |most: Option<f64>, used| {
            Some(most.map_or(used, |m| m.max(used)))
        })
        .map(|used| (100.0 - used).clamp(0.0, 100.0).round() as u8)
}

pub fn account_label<Tz: chrono::TimeZone>(line: &AccountLine, tz: &Tz, now: i64) -> String
where
    Tz::Offset: std::fmt::Display,
{
    let state = if !line.signed_in {
        Some("not signed in".to_string())
    } else if line.out {
        Some(match line.out_until {
            Some(at) => format!(
                "out until {}",
                super::failure::until_phrase(&super::failure::clock_phrase(tz, at, now))
            ),
            None => "out of usage".to_string(),
        })
    } else {
        left_percent(&line.windows, now).map(|left| format!("{left}% left"))
    };
    match state {
        Some(state) => format!("{} · {state}", line.name),
        None => line.name.clone(),
    }
}

/// The accounts in the user's order, Claude Code's first. With both engines
/// there, Codex's say so.
pub fn account_rows<Tz: chrono::TimeZone>(
    lines: &[AccountLine],
    tz: &Tz,
    now: i64,
) -> Vec<AccountRow>
where
    Tz::Offset: std::fmt::Display,
{
    let both = lines.iter().any(|a| a.engine == Engine::Claude)
        && lines.iter().any(|a| a.engine == Engine::Codex);
    let mut rows: Vec<AccountRow> = lines
        .iter()
        .filter(|a| matches!(a.engine, Engine::Claude | Engine::Codex))
        .map(|a| {
            let label = account_label(a, tz, now);
            AccountRow {
                engine: a.engine,
                id: a.id.clone(),
                label: if both && a.engine == Engine::Codex {
                    format!("Codex · {label}")
                } else {
                    label
                },
                next: a.next,
            }
        })
        .collect();
    // Stable: each engine keeps the user's order.
    rows.sort_by_key(|r| r.engine != Engine::Claude);
    rows
}

/// A chat's folder and the first thing typed in it, from its first lines.
pub fn chat_head(text: &str) -> (Option<PathBuf>, Option<String>) {
    let (mut cwd, mut said) = (None, None);
    for line in text.lines() {
        if cwd.is_some() && said.is_some() {
            break;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if cwd.is_none() {
            cwd = value.get("cwd").and_then(|c| c.as_str()).map(PathBuf::from);
        }
        if said.is_none() && value.get("type").and_then(|t| t.as_str()) == Some("user") {
            // Typed text only: tool results and pasted command output start with a tag.
            said = value
                .pointer("/message/content")
                .and_then(|c| c.as_str())
                .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" "))
                .filter(|s| !s.is_empty() && !s.starts_with('<'));
        }
    }
    (cwd, said)
}

fn clip(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let cut: String = text.chars().take(max - 1).collect();
    format!("{}…", cut.trim_end())
}

pub fn chat_label<Tz: chrono::TimeZone>(
    cwd: &Path,
    said: Option<&str>,
    modified: i64,
    tz: &Tz,
    now: i64,
) -> String
where
    Tz::Offset: std::fmt::Display,
{
    let folder = cwd
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| cwd.to_string_lossy().into_owned());
    let when = super::failure::until_phrase(&super::failure::clock_phrase(tz, modified, now));
    match said {
        Some(said) => format!("{folder} · {when} · “{}”", clip(said, SAID_MAX)),
        None => format!("{folder} · {when}"),
    }
}

/// A folder the user works in, not one the app or a tool made: agent homes,
/// task copies (`.worktrees`) and anything under a hidden folder are left out.
pub fn users_folder(cwd: &Path, app_dir: &Path) -> bool {
    !cwd.starts_with(app_dir)
        && !cwd
            .components()
            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
}

/// Where a chat on `on` can continue: every other signed-in account that a
/// Terminal can use as it is, the next one with room first.
pub fn targets_for(
    on: &str,
    accounts: &[(Account, bool)],
    lines: &[AccountRow],
    usable: &dyn Fn(&Account) -> bool,
) -> Vec<Target> {
    let mut out: Vec<(bool, Target)> = accounts
        .iter()
        .filter(|(a, signed_in)| *signed_in && a.id != on && usable(a))
        .map(|(a, _)| {
            let line = lines
                .iter()
                .find(|l| l.engine == Engine::Claude && l.id == a.id);
            let out = line.is_some_and(|l| l.label.contains(" · out"));
            let label = line.map_or_else(|| a.name.clone(), |l| l.label.clone());
            (
                out,
                Target {
                    account_id: a.id.clone(),
                    label: format!("Continue on {label}"),
                },
            )
        })
        .collect();
    out.sort_by_key(|(out, _)| *out);
    out.into_iter().map(|(_, t)| t).collect()
}

/* ------------------------------------------------------------- disk */

fn modified_ms(path: &Path) -> Option<i64> {
    let t = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(t.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64)
}

fn head_of(path: &Path) -> String {
    use std::io::Read;
    let mut bytes = Vec::new();
    if let Ok(file) = std::fs::File::open(path) {
        let _ = file.take(HEAD_BYTES).read_to_end(&mut bytes);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Claude Code chats touched since `since`, newest first, one per session
/// (a carried chat lives on two accounts: the newest copy is where it is).
fn scan(accounts: &[Account], since: i64) -> Vec<Found> {
    let app_dir = crate::brand::app_support_dir();
    let tabs = super::tab_accounts::tracked_sessions();
    let mut found = Vec::new();
    for account in accounts {
        let Ok(dirs) = std::fs::read_dir(wallet::folder(account).join("projects")) else {
            continue;
        };
        for dir in dirs.flatten() {
            let Ok(files) = std::fs::read_dir(dir.path()) else {
                continue;
            };
            for file in files.flatten() {
                let path = file.path();
                if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }
                let Some(modified) = modified_ms(&path).filter(|m| *m >= since) else {
                    continue;
                };
                let session = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                // A project tab's chat moves accounts on its own (`tab_accounts`).
                if tabs.contains(&session) {
                    continue;
                }
                found.push(Found {
                    session,
                    path,
                    modified,
                    account: account.clone(),
                    cwd: PathBuf::new(),
                    said: None,
                });
            }
        }
    }
    found.sort_by_key(|f| std::cmp::Reverse(f.modified));
    let mut seen = HashSet::new();
    found.retain(|f| seen.insert(f.session.clone()));
    found
        .into_iter()
        .filter_map(|mut f| {
            let known = lock(&HEADS).as_ref().and_then(|h| h.get(&f.path).cloned());
            let (cwd, said) = known.unwrap_or_else(|| {
                let head = chat_head(&head_of(&f.path));
                // Kept only once it names its folder: a chat just begun may not yet.
                if head.0.is_some() {
                    lock(&HEADS)
                        .get_or_insert_with(HashMap::new)
                        .insert(f.path.clone(), head.clone());
                }
                head
            });
            f.cwd = cwd.filter(|c| c.is_dir() && users_folder(c, &app_dir))?;
            f.said = said;
            Some(f)
        })
        .collect()
}

/// A Terminal can use this account as it is: its sign-in is in its own folder.
fn terminal_can_use(account: &Account) -> bool {
    account.engine == Engine::Claude
        && wallet::env_for(account)
            .iter()
            .all(|(k, _)| k == "CLAUDE_CONFIG_DIR")
}

/* ------------------------------------------------------------ reading */

async fn rebuild(app: &AppHandle) {
    let inv = super::inventory::read().await;
    let candidates = wallet::candidates(Engine::Claude).await;
    let now = super::store::now_ms();
    let tz = chrono::Local;
    let accounts = account_rows(&inv.accounts, &tz, now);
    let signed: Vec<(Account, bool)> = candidates
        .iter()
        .map(|c| (c.account.clone(), c.signed_in))
        .collect();
    let roots: Vec<Account> = signed
        .iter()
        .filter(|(_, s)| *s)
        .map(|(a, _)| a.clone())
        .collect();
    let found = tokio::task::spawn_blocking(move || scan(&roots, now - RECENT_MS))
        .await
        .unwrap_or_default();
    let chats = found
        .iter()
        .take(MAX_CHATS)
        .map(|f| ChatRow {
            session: f.session.clone(),
            label: chat_label(&f.cwd, f.said.as_deref(), f.modified, &tz, now),
            targets: targets_for(&f.account.id, &signed, &accounts, &terminal_can_use),
        })
        .collect();
    *lock(&FOUND) = found;
    let model = Model { accounts, chats };
    let changed = lock(&MODEL).as_ref() != Some(&model);
    *lock(&MODEL) = Some(model);
    if changed {
        super::tray::refresh_soon(app);
    }
}

/// Running Terminal chats that reached the limit since the last look.
async fn watch(app: &AppHandle) {
    let now = super::store::now_ms();
    let candidates = wallet::candidates(Engine::Claude).await;
    let roots: Vec<Account> = candidates
        .iter()
        .filter(|c| c.signed_in)
        .map(|c| c.account.clone())
        .collect();
    let recent = tokio::task::spawn_blocking(move || scan(&roots, now - WATCH_MS))
        .await
        .unwrap_or_default();
    let mut ran_out = Vec::new();
    {
        let mut guard = lock(&READ_TO);
        let first = guard.is_none();
        let read_to = guard.get_or_insert_with(HashMap::new);
        for f in &recent {
            let len = std::fs::metadata(&f.path).map(|m| m.len()).unwrap_or(0);
            // First sight (and the app's first pass): what's there is history.
            let Some(from) = read_to.get(&f.path).copied().filter(|_| !first) else {
                read_to.insert(f.path.clone(), len);
                continue;
            };
            let Some((lines, to)) = super::tab_accounts::read_new(&f.path, from) else {
                continue;
            };
            read_to.insert(f.path.clone(), to);
            if let Some(resets_at) = lines
                .iter()
                .rev()
                .find_map(|l| super::tab_accounts::limit_in(l))
            {
                ran_out.push((f.clone(), resets_at));
            }
        }
    }
    if ran_out.is_empty() {
        return;
    }
    for (f, resets_at) in &ran_out {
        wallet::mark_out_with_twins(Engine::Claude, &f.account.id, *resets_at, now);
        tracing::info!(
            account = %f.account.id,
            "[tray_accounts] a Terminal chat's account reached its usage limit"
        );
    }
    rebuild(app).await;
    for (f, _) in ran_out {
        let next = model()
            .chats
            .iter()
            .find(|c| c.session == f.session)
            .and_then(|c| c.targets.first().cloned());
        let folder = f
            .cwd
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let body = match next {
            Some(t) => format!(
                "{} reached its limit in {folder}. {} from the menu bar.",
                f.account.name, t.label
            ),
            None => format!("{} reached its limit in {folder}.", f.account.name),
        };
        notify(app, "Claude Code ran out of usage", &body);
    }
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if super::quiet::holding_now() {
        return;
    }
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        tracing::warn!("[tray_accounts] notification failed: {e}");
    }
}

/// Read the accounts now and every minute; watch Terminal chats for the limit.
pub fn spawn(app: AppHandle) {
    let reader = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            super::survive::tick("tray_accounts", rebuild(&reader)).await;
            tokio::time::sleep(EVERY).await;
        }
    });
    tauri::async_runtime::spawn(async move {
        loop {
            super::survive::tick("tray_accounts_watch", watch(&app)).await;
            tokio::time::sleep(WATCH_EVERY).await;
        }
    });
}

/* ------------------------------------------------------------- clicks */

fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// The Terminal command that opens `session` in `cwd` on `account`.
pub fn resume_command(cwd: &Path, account: &Account, session: &str) -> String {
    let mut env = vec!["env".to_string()];
    if account.is_this_mac() {
        env.push("-u CLAUDE_CONFIG_DIR".to_string());
    } else {
        env.extend(
            wallet::env_unset_for(account)
                .iter()
                .map(|k| format!("-u {k}")),
        );
        env.extend(
            wallet::env_for(account)
                .iter()
                .filter(|(k, _)| k == "CLAUDE_CONFIG_DIR")
                .map(|(k, v)| format!("{k}={}", quote(v))),
        );
    }
    format!(
        "cd {} && {} claude --resume {} {}",
        quote(&cwd.to_string_lossy()),
        env.join(" "),
        quote(session),
        quote(super::tab_accounts::CONTINUE)
    )
}

async fn open_terminal(command: &str) -> bool {
    let script = command.replace('\\', r"\\").replace('"', "\\\"");
    let mut cmd = tokio::process::Command::new("osascript");
    cmd.arg("-e")
        .arg(format!(
            "tell application \"Terminal\" to do script \"{script}\""
        ))
        .arg("-e")
        .arg("tell application \"Terminal\" to activate");
    // Long enough for macOS's "allow controlling Terminal?" prompt to be answered.
    crate::external_command::run_with_timeout(cmd, "osascript (open Terminal)", 120)
        .await
        .is_ok_and(|out| out.status.success())
}

fn carry(app: &AppHandle, session: &str, account_id: &str) {
    let found = lock(&FOUND).iter().find(|f| f.session == session).cloned();
    let account = wallet::of(Engine::Claude)
        .into_iter()
        .find(|a| a.id == account_id);
    let (Some(found), Some(account)) = (found, account) else {
        notify(
            app,
            "Couldn’t continue that chat",
            "Open the menu again: it has moved on.",
        );
        return;
    };
    if !terminal_can_use(&account) {
        notify(
            app,
            "Couldn’t continue that chat",
            &format!(
                "Sign {} in again in Settings → Accounts & usage first.",
                account.name
            ),
        );
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let (to, session) = (account.clone(), found.session.clone());
        let carried = tokio::task::spawn_blocking(move || {
            // Setup done and the folder trusted there too, or Claude Code
            // opens on its first-run screens instead of the chat.
            wallet::prepare(&to);
            wallet::carry_session(&to, &session);
            wallet::session_in(&[wallet::folder(&to)], Engine::Claude, &session)
        })
        .await
        .unwrap_or(false);
        if !carried {
            notify(
                &app,
                "Couldn’t continue that chat",
                "Its file couldn’t be copied to that account.",
            );
            return;
        }
        if !open_terminal(&resume_command(&found.cwd, &account, &found.session)).await {
            notify(
                &app,
                "Couldn’t open Terminal",
                "Allow the app to control Terminal in System Settings → Privacy & Security → Automation.",
            );
        }
    });
}

/// A click in the Accounts section; `false` when the id isn't one of ours.
pub fn on_menu(app: &AppHandle, id: &str) -> bool {
    if let Some(rest) = id.strip_prefix("carry:") {
        if let Some((session, account)) = rest.split_once(':') {
            carry(app, session, account);
        }
        return true;
    }
    if let Some(rest) = id.strip_prefix("first:") {
        if let Some((engine, account)) = rest.split_once(':') {
            if let Ok(engine) = Engine::parse(engine) {
                if let Err(e) = wallet::use_first(engine, account) {
                    tracing::warn!("[tray_accounts] use first: {e:?}");
                }
                let _ = app.emit("agents-accounts-changed", ());
                let app = app.clone();
                tauri::async_runtime::spawn(async move { rebuild(&app).await });
            }
        }
        return true;
    }
    if id == "accounts" {
        super::tray::show_app(app);
        let _ = app.emit(
            super::settings_tools::EVENT_OPEN_SETTINGS,
            json!({ "section": "page", "page": "accounts" }),
        );
        return true;
    }
    false
}

#[cfg(test)]
#[path = "tray_accounts_tests.rs"]
mod tests;
