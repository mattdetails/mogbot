//! The same reach on every Claude Code account: what an agent can use
//! shouldn't change because its turn failed over from this Mac's sign-in to
//! an added account (`wallet`).
//!
//! Three things differ per Claude Code config dir, and each is handled here:
//!
//! 1. **User-scope MCP servers** live in `.claude.json`'s `mcpServers`, which
//!    is per config dir. Before a turn on an added account, this Mac's are
//!    merged into the account's file ([`sync_servers`]): only that key, an
//!    atomic 0600 write, the account's own servers kept, and a server this
//!    Mac no longer has removed only when it was put there by this sync
//!    (recorded in [`SYNCED_FILE`]). Never a login: the OAuth tokens those
//!    servers use are in Claude Code's secure storage, which is per config
//!    dir too (Keychain `Claude Code-credentials-<sha256(dir)[..8]>`, key
//!    `mcpOAuth`, read in 2.1.319's own code), so a server that signs in by
//!    OAuth needs one sign-in per account. [`needs_auth_line`] says which,
//!    from `claude mcp list` run as that account.
//! 2. **Claude in Chrome**. `--chrome` reaches the extension through the
//!    claude.ai bridge, as the claude.ai account its OAuth token belongs to
//!    (2.1.319: `bridgeConfig.getUserId` resolves the token's account), and
//!    the extension in the user's Chrome is signed in to this Mac's. So on an
//!    added account `--chrome` finds no browser (observed: "Browser extension
//!    is not connected" under the account's `CLAUDE_CONFIG_DIR`). Such a turn
//!    runs `--no-chrome` and gets the same server under [`CHROME_SERVER`],
//!    started without the account's variables ([`chrome_server`]), so it
//!    reaches the user's Chrome as this Mac's sign-in (observed: the same
//!    browser listed). Claude Code reserves the name `claude-in-chrome`, so
//!    its tools are `mcp__user-chrome__*`; the broker and the stream map
//!    them back (`e2e_alias`), and the browser gate decides them exactly as
//!    the real ones.
//! 4. **Claude Code's own first-run setup** (the text-style screen, then
//!    "Do you trust the files in this folder?") is recorded per config dir
//!    too. An interactive Claude Code on an added account (a project's
//!    terminal tab, Take over, "Continue on…" from the menu bar) showed both
//!    instead of the resumed chat, which read as the chat being lost. Before
//!    one starts, this Mac's answers are copied over ([`sync_setup`]): setup
//!    done, the onboarding version and theme it was done at, and each folder
//!    this Mac trusts. Only ever added, never taken back or turned off.
//! 3. **claude.ai connectors** (Gmail, Calendar, Slack through claude.ai)
//!    belong to each claude.ai account and can't be copied. When a switched
//!    turn's engine lists its connectors, [`lost_line`] compares them with
//!    the last turn's and says, once, what isn't on this account and how the
//!    agent reaches it meanwhile.

use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::path::Path;

use super::capabilities::Capabilities;

/// The MCP server name a turn on an added account reaches the user's Chrome
/// under. Not `claude-in-chrome`: Claude Code drops a config entry by that
/// name (observed on 2.1.319).
pub const CHROME_SERVER: &str = "user-chrome";

/// Beside an account's `.claude.json`: the server names this sync put there.
pub const SYNCED_FILE: &str = ".synced-mcp-servers.json";

/// One read-modify-write of an account's `.claude.json` at a time, whichever
/// part of it is being brought over: agents failing over together each
/// prepare the same account before their turn, and a write that overlapped
/// another could put back what it had read before the other's change.
static CONFIG_WRITES: std::sync::Mutex<()> = std::sync::Mutex::new(());

/* ------------------------------------------------- first-run setup */

/// Top-level keys that say Claude Code's first-run screens are done, copied
/// to an account that doesn't have them yet. `hasCompletedOnboarding` is
/// copied only as `true`; the version and theme only where the account has
/// none, so the account's own choices are kept.
const SETUP_KEYS: &[&str] = &["hasCompletedOnboarding", "lastOnboardingVersion", "theme"];

/// Bring this Mac's first-run answers (`native`, its `.claude.json`) to an
/// account's (`target`): setup done ([`SETUP_KEYS`]) and every folder this
/// Mac trusts (`projects["<path>"].hasTrustDialogAccepted`). Only adds: a
/// key the account already has is kept, nothing is set to false, and the
/// rest of the file (its login, its own projects' settings) is kept as
/// read. Nothing to add, nothing written. Returns what was added, for the
/// log and the tests. A `target` that isn't a JSON object is left alone.
pub fn sync_setup(native: &Path, target: &Path) -> std::io::Result<Vec<String>> {
    let _one = CONFIG_WRITES.lock().unwrap_or_else(|e| e.into_inner());
    let Some(Value::Object(from)) = read_json(native)? else {
        return Ok(Vec::new());
    };
    let mut config = match read_json(target)? {
        Some(Value::Object(m)) => m,
        Some(_) => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "an account's .claude.json isn't an object",
            ))
        }
        None => Map::new(),
    };
    let mut added = Vec::new();
    for key in SETUP_KEYS {
        let Some(value) = from.get(*key) else {
            continue;
        };
        let wanted = if *key == "hasCompletedOnboarding" {
            value.as_bool() == Some(true) && config.get(*key).and_then(Value::as_bool) != Some(true)
        } else {
            !config.contains_key(*key)
        };
        if wanted {
            config.insert((*key).to_string(), value.clone());
            added.push((*key).to_string());
        }
    }
    let trusted = from
        .get("projects")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter(|(_, p)| p.get("hasTrustDialogAccepted").and_then(Value::as_bool) == Some(true))
        .map(|(path, _)| path.clone());
    let mut projects = config
        .get("projects")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut projects_changed = false;
    for path in trusted {
        let entry = projects
            .entry(path.clone())
            .or_insert_with(|| Value::Object(Map::new()));
        if !entry.is_object() {
            *entry = Value::Object(Map::new());
        }
        if entry.get("hasTrustDialogAccepted").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        entry["hasTrustDialogAccepted"] = Value::Bool(true);
        added.push(format!("trust {path}"));
        projects_changed = true;
    }
    if projects_changed {
        config.insert("projects".into(), Value::Object(projects));
    }
    if !added.is_empty() {
        let bytes = serde_json::to_vec_pretty(&Value::Object(config))
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        write_atomic(target, &bytes)?;
    }
    Ok(added)
}

/* ------------------------------------------------------ MCP servers */

/// What a sync did, for the log and the tests.
#[derive(Debug, Default, PartialEq)]
pub struct Synced {
    pub added: Vec<String>,
    pub updated: Vec<String>,
    pub removed: Vec<String>,
}

impl Synced {
    pub fn changed(&self) -> bool {
        !(self.added.is_empty() && self.updated.is_empty() && self.removed.is_empty())
    }
}

fn read_json(path: &Path) -> std::io::Result<Option<Value>> {
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text)
            .map(Some)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Merge `native`'s `mcpServers`, user-scope and each project's, into
/// `target`'s. Only those keys are written; the rest of `target` (its login,
/// its projects' other settings) is kept as read. A `target` that isn't
/// JSON is left alone (an error). Nothing to change, nothing written.
pub fn sync_servers(native: &Path, target: &Path) -> std::io::Result<Synced> {
    let _one = CONFIG_WRITES.lock().unwrap_or_else(|e| e.into_inner());
    let native_config = read_json(native)?;
    let from: Map<String, Value> = native_config
        .as_ref()
        .and_then(|v| v.get("mcpServers")?.as_object().cloned())
        .unwrap_or_default();
    let mut config = match read_json(target)? {
        Some(Value::Object(m)) => m,
        Some(_) => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "an account's .claude.json isn't an object",
            ))
        }
        None => Map::new(),
    };
    let ledger = target.with_file_name(SYNCED_FILE);
    let before: BTreeSet<String> = read_json(&ledger)
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let mut done = Synced::default();
    let mut now = BTreeSet::new();
    let mut servers = config
        .get("mcpServers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let user_changed = merge(&from, &mut servers, &before, "", &mut done, &mut now);
    if user_changed {
        config.insert("mcpServers".into(), Value::Object(servers));
    }
    // Project-scoped servers (`projects["<path>"].mcpServers`, e.g. the
    // preview server registered for one project) are per config dir too: a
    // turn in that project on an added account had none of them.
    let native_projects: Map<String, Value> = native_config
        .as_ref()
        .and_then(|v| v.get("projects")?.as_object().cloned())
        .unwrap_or_default();
    let mut paths: BTreeSet<String> = native_projects
        .iter()
        .filter(|(_, p)| p.get("mcpServers").is_some_and(Value::is_object))
        .map(|(k, _)| k.clone())
        .collect();
    // A project this Mac no longer has servers for: take back what we put.
    paths.extend(
        before
            .iter()
            .filter_map(|k| k.split_once(PROJECT_SEP).map(|(p, _)| p.to_string())),
    );
    let mut projects_changed = false;
    let mut projects = config
        .get("projects")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    for path in paths {
        let from: Map<String, Value> = native_projects
            .get(&path)
            .and_then(|p| p.get("mcpServers")?.as_object().cloned())
            .unwrap_or_default();
        let mut entry = match projects.get(&path) {
            Some(Value::Object(m)) => m.clone(),
            _ => Map::new(),
        };
        let mut servers = entry
            .get("mcpServers")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let prefix = format!("{path}{PROJECT_SEP}");
        if merge(&from, &mut servers, &before, &prefix, &mut done, &mut now) {
            entry.insert("mcpServers".into(), Value::Object(servers));
            projects.insert(path, Value::Object(entry));
            projects_changed = true;
        }
    }
    if projects_changed {
        config.insert("projects".into(), Value::Object(projects));
    }
    if user_changed || projects_changed {
        let bytes = serde_json::to_vec_pretty(&Value::Object(config))
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        write_atomic(target, &bytes)?;
    }
    if now != before {
        let bytes = serde_json::to_vec(&now).unwrap_or_default();
        write_atomic(&ledger, &bytes)?;
    }
    Ok(done)
}

/// In the ledger, a project's server is `<path>` + this + `<name>`; a
/// user-scope one is its bare name (as before projects were synced).
const PROJECT_SEP: char = '\u{0}';

/// Merge one scope's servers (`from`, this Mac's) into `servers` (the
/// account's). Ledger keys carry `prefix`. Only what this sync put there is
/// its own to take away later: a server the account already had under that
/// name stays the account's, so this Mac dropping it never removes it.
/// True when `servers` changed.
fn merge(
    from: &Map<String, Value>,
    servers: &mut Map<String, Value>,
    before: &BTreeSet<String>,
    prefix: &str,
    done: &mut Synced,
    now: &mut BTreeSet<String>,
) -> bool {
    let label = |name: &str| match prefix.strip_suffix(PROJECT_SEP) {
        Some(path) => format!("{name} ({path})"),
        None => name.to_string(),
    };
    let mut changed = false;
    for (name, def) in from {
        let key = format!("{prefix}{name}");
        match servers.get(name) {
            None => {
                done.added.push(label(name));
                now.insert(key);
            }
            Some(have) => {
                if before.contains(&key) {
                    now.insert(key);
                }
                if have == def {
                    continue;
                }
                done.updated.push(label(name));
            }
        }
        servers.insert(name.clone(), def.clone());
        changed = true;
    }
    for key in before {
        let Some(name) = key.strip_prefix(prefix) else {
            continue;
        };
        if prefix.is_empty() && name.contains(PROJECT_SEP) {
            continue;
        }
        if !from.contains_key(name) && servers.remove(name).is_some() {
            done.removed.push(label(name));
            changed = true;
        }
    }
    changed
}

/// Written beside `path` under a name of its own, then renamed over it. A
/// shared `.tmp` name let two writers truncate and rename each other's file:
/// an account's `.claude.json` (its login) could be replaced by one still
/// being written. Claude Code itself may also be writing beside it.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(format!(
        ".{}.{}.tmp",
        std::process::id(),
        super::store::new_id()
    ));
    let tmp = std::path::PathBuf::from(tmp);
    let written =
        super::store::write_private(&tmp, bytes).and_then(|()| std::fs::rename(&tmp, path));
    if written.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    written
}

/// Before a turn or a terminal on `account`: this Mac's first-run answers
/// and user-scope servers on it too.
pub fn prepare(account: &super::wallet::Account) {
    if account.is_this_mac() || account.engine != super::engine::Engine::Claude {
        return;
    }
    let Some(native) = super::decisions::claude_config() else {
        return;
    };
    let target = super::wallet::folder(account).join(".claude.json");
    if !target.parent().is_some_and(Path::is_dir) {
        return;
    }
    match sync_setup(&native, &target) {
        Ok(added) if !added.is_empty() => tracing::info!(
            account = %account.id, count = added.len(),
            "[Agents] brought this Mac's Claude Code setup and folder trust to an added account"
        ),
        Ok(_) => {}
        Err(e) => {
            tracing::warn!(account = %account.id, "[Agents] couldn't bring this Mac's Claude Code setup to an added account: {e}")
        }
    }
    match sync_servers(&native, &target) {
        Ok(done) if done.changed() => tracing::info!(
            account = %account.id, added = ?done.added, updated = ?done.updated, removed = ?done.removed,
            "[Agents] brought this Mac's MCP servers to an added account"
        ),
        Ok(_) => {}
        Err(e) => {
            tracing::warn!(account = %account.id, "[Agents] couldn't bring this Mac's MCP servers to an added account: {e}")
        }
    }
}

/// "On Personal, Figma and Webflow need a one-time sign-in…": the user-scope
/// servers `claude mcp list` (run as that account) says need authentication.
/// `None` when none does. Pure.
pub fn needs_auth_line(account: &str, agent: &str, apps: &[super::apps::App]) -> Option<String> {
    let names: Vec<String> = apps
        .iter()
        .filter(|a| a.status == "needs_auth" && a.source == super::apps::Source::User)
        .map(|a| super::apps::display_name(&a.name))
        .collect();
    if names.is_empty() {
        return None;
    }
    let refs: Vec<&str> = names.iter().map(String::as_str).collect();
    let (list, verb) = (join(&refs), if names.len() == 1 { "needs" } else { "need" });
    Some(format!(
        "On {account}, {list} {verb} a one-time sign-in: their logins are kept per Claude account. Take over {agent}, type /mcp and sign in, then hand back."
    ))
}

/* --------------------------------------------------------- Chrome */

/// A turn reaches Claude in Chrome as this Mac's sign-in ([`chrome_server`]
/// under [`CHROME_SERVER`], `--no-chrome`) instead of `--chrome`: only on
/// Claude Code, only when its route is Claude in Chrome (`browser`), and
/// only on an added account. A turn with Your Chrome has `browser` false,
/// so it never gets this server, on any account. Pure.
pub fn chrome_as_this_mac(engine: super::engine::Engine, browser: bool, this_mac: bool) -> bool {
    engine == super::engine::Engine::Claude && browser && !this_mac
}

/// The `--mcp-config` entry that reaches the user's Chrome as this Mac's
/// sign-in: Claude Code's own Claude in Chrome server, started with the
/// account's variables taken away, so it resolves this Mac's login.
pub fn chrome_server(claude: &Path) -> Value {
    serde_json::json!({
        "type": "stdio",
        "command": "/usr/bin/env",
        "args": [
            "-u", "CLAUDE_CONFIG_DIR",
            "-u", "CLAUDE_CODE_OAUTH_TOKEN",
            "-u", "CLAUDE_SECURESTORAGE_CONFIG_DIR",
            claude.to_string_lossy(),
            "--claude-in-chrome-mcp",
        ],
    })
}

/// What a turn on an added account is told about its Chrome tools' name.
pub fn chrome_prompt_line() -> String {
    format!("Your Chrome tools in this turn are named mcp__{CHROME_SERVER}__* (the same Claude in Chrome tools as mcp__claude-in-chrome__*, in the user's own Chrome, with the same rules). Use them wherever you'd use mcp__claude-in-chrome__*.")
}

/* ------------------------------------------------------- connectors */

fn listed(caps: &Capabilities, what: &str) -> Vec<String> {
    caps.lines
        .iter()
        .filter(|l| l.what == what)
        .flat_map(|l| {
            let detail = l
                .detail
                .split(". Connect them")
                .next()
                .unwrap_or("")
                .trim_end_matches('.')
                .to_string();
            detail
                .split(", ")
                .flat_map(|p| p.split(" and "))
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
        })
        .collect()
}

fn chrome_connected(caps: &Capabilities) -> bool {
    caps.lines
        .iter()
        .any(|l| l.what == "Chrome" && !l.detail.starts_with("Not connected"))
}

/// The one quiet line for a turn that switched to `account`: the connectors
/// the last turn had that this one's engine doesn't list as connected, and
/// how it reaches them meanwhile (`chrome`: its turns get the user's Chrome).
/// Also says when Chrome itself was lost. `None`: nothing lost. Pure.
pub fn lost_line(
    account: &str,
    before: &Capabilities,
    now: &Capabilities,
    chrome: bool,
) -> Option<String> {
    let have: BTreeSet<String> = listed(now, "Connectors").into_iter().collect();
    // Listed as needing a sign-in on this account: its OAuth login is kept
    // per Claude account, so it's a one-time sign-in here, not a claude.ai
    // connector to turn on (`needs_auth_line` says how). Calling those
    // "not on in claude.ai" sent the user to the wrong place.
    let sign_in: BTreeSet<String> = listed(now, "Needs sign-in").into_iter().collect();
    let lost: Vec<String> = listed(before, "Connectors")
        .into_iter()
        .filter(|c| !have.contains(c))
        .collect();
    let (needs_sign_in, missing): (Vec<String>, Vec<String>) =
        lost.into_iter().partition(|c| sign_in.contains(c));
    let lost_chrome = chrome_connected(before) && !chrome_connected(now);
    if missing.is_empty() && needs_sign_in.is_empty() && !lost_chrome {
        return None;
    }
    let mut parts = Vec::new();
    if !needs_sign_in.is_empty() {
        let refs: Vec<&str> = needs_sign_in.iter().map(String::as_str).collect();
        let verb = if needs_sign_in.len() == 1 {
            "needs"
        } else {
            "need"
        };
        parts.push(format!(
            "On {account}, {} {verb} a one-time sign-in: their logins are kept per Claude account.",
            join(&refs)
        ));
    }
    if !missing.is_empty() {
        let refs: Vec<&str> = missing.iter().map(String::as_str).collect();
        let (list, verb) = (
            join(&refs),
            if missing.len() == 1 {
                "isn't"
            } else {
                "aren't"
            },
        );
        let meanwhile = if chrome && !lost_chrome {
            "agents use them in your Chrome meanwhile"
        } else {
            "or connect them here"
        };
        parts.push(format!(
            "{list} {verb} reachable on {account}. If {} a claude.ai connector, turn {} on at claude.ai/settings/connectors while signed in as {account}; {meanwhile}.",
            if missing.len() == 1 { "it's" } else { "they're" },
            if missing.len() == 1 { "it" } else { "them" }
        ));
    }
    if lost_chrome {
        parts.push(format!(
            "Your Chrome isn't reachable on {account}; agents use their own browser for sites they're allowed."
        ));
    }
    Some(parts.join(" "))
}

fn join(items: &[&str]) -> String {
    match items {
        [] => String::new(),
        [one] => one.to_string(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

#[cfg(test)]
#[path = "account_reach_tests.rs"]
mod tests;
