//! Trust per repository: "issues and merges in the Mogbot repo without
//! asking, WorkSpan never" (the owner's call, 18 Nov 2026).
//!
//! A list the user keeps, `repo-trust.json` in the agents folder, of
//! `owner/name` → `allow` or `never`:
//!
//! - **allow**: `gh pr …` and `gh issue …` that change that repository (create,
//!   comment, review, close, edit, merge…) run without a card, at every
//!   independence level. Deleting or transferring an issue, a repository's
//!   settings, releases, secrets, pushes and anything outside the repository
//!   keep the level's own rules.
//! - **never**: `gh` writes and `git push` in that repository ask at every
//!   level, Unleashed included.
//!
//! The repository a command acts on is read from `--repo`/`-R`, a PR or issue
//! URL, a `gh api repos/…` path, else the working directory's `origin`.
//! A turn answering outside text still gets "never", never "allow".
//!
//! Set in chat with `repo_trust`: **never** applies at once; **allow** and
//! **remove** need the user's own typed words, as `remember_permission` does.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Mutex;

use super::runner;
use super::store::{self, Agent};

pub const TOOL: &str = "repo_trust";

pub const DESCRIPTION: &str = "Trust per GitHub repository, from the user's own words: \"in the Mogbot repo you can open issues and merge without asking, never in WorkSpan\". `allow`: gh issue and pull request changes in that repo (create, comment, review, merge…) stop asking. `never`: gh changes and pushes in that repo always ask, at every independence level. `remove` forgets one; `list` shows them. `allow` and `remove` need `quote`, the user's exact typed words saying so; it never covers a repo's settings, releases, deleting or pushes.";

pub fn schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "action": { "type": "string", "enum": ["allow", "never", "remove", "list"] },
            "repo": { "type": "string", "description": "owner/name, as on GitHub (not needed for list)." },
            "quote": { "type": "string", "description": "The user's words, exactly as typed. Required for allow and remove." }
        },
        "required": ["action"]
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Trust {
    Allow,
    Never,
}

/// What the list says about one command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Runs without a card.
    Allow,
    /// Asks, whatever the level.
    Ask,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Saved {
    #[serde(default)]
    repos: BTreeMap<String, Trust>,
}

const FILE: &str = "repo-trust.json";
static LOCK: Mutex<()> = Mutex::new(());

fn read() -> Saved {
    store::agents_root()
        .ok()
        .and_then(|r| super::survive::read_kept(&r.join(FILE), "Which repositories you trust"))
        .unwrap_or_default()
}

fn write(saved: &Saved) -> Result<(), crate::errors::CommandError> {
    let json = serde_json::to_vec_pretty(saved).map_err(super::err_other)?;
    store::write_atomic(&store::agents_root()?.join(FILE), &json)
}

pub fn list() -> Vec<(String, Trust)> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    read().repos.into_iter().collect()
}

pub fn set(repo: &str, trust: Option<Trust>) -> Result<(), crate::errors::CommandError> {
    let key = normalize(repo).ok_or_else(|| {
        crate::errors::CommandError::expected("Name the repository as owner/name.")
    })?;
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut saved = read();
    match trust {
        Some(t) => saved.repos.insert(key, t),
        None => saved.repos.remove(&key),
    };
    write(&saved)
}

/// `owner/name` lower-cased, from `owner/name`, `host/owner/name`, a GitHub
/// URL or an ssh remote.
pub fn normalize(text: &str) -> Option<String> {
    let t = text.trim().trim_end_matches('/').trim_end_matches(".git");
    let t = t
        .strip_prefix("git@github.com:")
        .or_else(|| t.split_once("github.com/").map(|(_, r)| r))
        .unwrap_or(t);
    let mut segs: Vec<&str> = t.split('/').filter(|s| !s.is_empty()).collect();
    if segs.len() > 2 && segs[0].contains('.') {
        segs.remove(0);
    }
    let (owner, name) = (segs.first()?, segs.get(1)?);
    let ok = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    };
    (ok(owner) && ok(name)).then(|| format!("{owner}/{name}").to_ascii_lowercase())
}

/// The repository a `gh` command names; `None` when it doesn't.
pub fn named_in(args: &[&str]) -> Option<String> {
    let mut i = 0;
    while i < args.len() {
        let a = args[i];
        if matches!(a, "-R" | "--repo") {
            return args.get(i + 1).and_then(|r| normalize(r));
        }
        if let Some(r) = a.strip_prefix("--repo=") {
            return normalize(r);
        }
        if a.contains("github.com/") && !a.starts_with('-') {
            return normalize(a.split("/pull/").next()?.split("/issues/").next()?);
        }
        i += 1;
    }
    if args.first() == Some(&"api") {
        let path = super::go_hard::gh_api_path(args).trim_start_matches('/');
        let rest = path.strip_prefix("repos/")?;
        return normalize(rest);
    }
    None
}

/// The working directory's `origin`.
#[allow(clippy::disallowed_methods)] // a local git read in a directory that exists, no network
fn origin_of(cwd: &Path) -> Option<String> {
    let out = std::process::Command::new("git")
        .args(["-C"])
        .arg(cwd)
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| normalize(String::from_utf8_lossy(&out.stdout).trim()))
        .flatten()
}

/// Pull requests and issues: what "allow" covers. Not deleting or
/// transferring an issue.
fn covered_by_allow(args: &[&str]) -> bool {
    let pos = super::go_hard::positional(args);
    matches!(pos.first().copied(), Some("pr") | Some("issue"))
        && super::go_hard::gh_writes(args)
        && !matches!(pos.get(1).copied(), Some("delete") | Some("transfer"))
}

fn is_push(args: &[&str]) -> bool {
    super::go_hard::positional(args).first() == Some(&"push")
}

/// What the list says about `command`, run in `cwd`. `outside`: the turn
/// answers outside text, which never gets "allow".
pub fn for_command(command: &str, cwd: &Path, outside: bool) -> Option<Decision> {
    let trust = {
        let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        read().repos
    };
    decide(command, &trust, outside, || origin_of(cwd))
}

fn decide(
    command: &str,
    trust: &BTreeMap<String, Trust>,
    outside: bool,
    origin: impl Fn() -> Option<String>,
) -> Option<Decision> {
    if trust.is_empty() {
        return None;
    }
    let segs: Vec<Vec<&str>> = command
        .split(['\n', ';', '|', '&'])
        .map(|s| s.split_whitespace().collect::<Vec<_>>())
        .filter(|w| !w.is_empty())
        .collect();
    let mut allowed = !segs.is_empty() && segs.len() == 1;
    for ws in &segs {
        let prog = ws[0].rsplit('/').next().unwrap_or(ws[0]);
        let args = &ws[1..];
        let writes = match prog {
            "gh" => super::go_hard::gh_writes(args),
            // `git -C dir push` is as much a push.
            "git" => is_push(args) || args.windows(2).any(|w| w[0] == "push"),
            _ => false,
        };
        if !writes {
            allowed = false;
            continue;
        }
        let repo = if prog == "gh" { named_in(args) } else { None }.or_else(&origin);
        match repo.and_then(|r| trust.get(&r).copied()) {
            Some(Trust::Never) => return Some(Decision::Ask),
            Some(Trust::Allow) if prog == "gh" && covered_by_allow(args) => {}
            _ => allowed = false,
        }
    }
    (allowed && !outside).then_some(Decision::Allow)
}

fn text(message: impl Into<String>) -> Value {
    json!({ "content": [{ "type": "text", "text": message.into() }] })
}

fn error(message: impl Into<String>) -> Value {
    crate::agent_bridge::tool_error_result(&message.into())
}

/// `repo_trust`. `turn` is the caller's live turn (`broker`).
pub async fn call(caller: &Agent, turn: Option<u64>, args: &Value) -> Value {
    let action = args.get("action").and_then(Value::as_str).unwrap_or("");
    if action == "list" {
        let all = list();
        if all.is_empty() {
            return text("No repository has its own trust yet.");
        }
        let lines: Vec<String> = all
            .iter()
            .map(|(r, t)| {
                let w = if *t == Trust::Allow {
                    "trusted"
                } else {
                    "never"
                };
                format!("{r}: {w}")
            })
            .collect();
        return text(lines.join("\n"));
    }
    let live = super::broker::is_live(&caller.id, turn);
    let Some(repo) = args.get("repo").and_then(Value::as_str) else {
        return error("Name the repository as owner/name.");
    };
    let trust = match action {
        "never" => Some(Trust::Never),
        "allow" => Some(Trust::Allow),
        "remove" => None,
        _ => return error("action is allow, never, remove or list."),
    };
    if !live {
        return error("This can only be set in a conversation with the user.");
    }
    if action != "never" {
        let said = runner::typed_input(&caller.id);
        let quote = args.get("quote").and_then(Value::as_str).unwrap_or("");
        let ok = said
            .as_deref()
            .is_some_and(|s| !quote.trim().is_empty() && super::remember::quoted(quote, s));
        if !ok {
            return error("Only the user's own typed words, just now, can trust a repository or take a rule away. Ask them in chat, then pass their exact words as quote.");
        }
    }
    match set(repo, trust) {
        Ok(()) => text(match trust {
            Some(Trust::Allow) => "Done: issues and pull requests there stop asking. Tell the user in one line.",
            Some(Trust::Never) => "Done: gh changes and pushes there always ask now, at every level. Tell the user in one line.",
            None => "Done: that repository goes back to the independence level's rules. Tell the user in one line.",
        }),
        Err(e) => error(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trust() -> BTreeMap<String, Trust> {
        BTreeMap::from([
            ("native/mogbot".to_string(), Trust::Allow),
            ("workspan/app".to_string(), Trust::Never),
        ])
    }
    fn d(cmd: &str, outside: bool, origin: &str) -> Option<Decision> {
        let o = origin.to_string();
        decide(cmd, &trust(), outside, || normalize(&o))
    }

    #[test]
    fn names_a_repo_however_it_is_written() {
        for r in [
            "Native/Mogbot",
            "https://github.com/native/mogbot.git",
            "git@github.com:native/mogbot.git",
            "github.com/native/mogbot",
        ] {
            assert_eq!(normalize(r).as_deref(), Some("native/mogbot"), "{r}");
        }
        assert_eq!(normalize("just-a-word"), None);
    }

    #[test]
    fn a_trusted_repo_runs_issues_and_merges_without_a_card() {
        assert_eq!(
            d("gh issue create --repo native/mogbot -t hi", false, ""),
            Some(Decision::Allow)
        );
        assert_eq!(
            d("gh pr merge 12", false, "git@github.com:native/mogbot.git"),
            Some(Decision::Allow)
        );
        assert_eq!(
            d(
                "gh pr merge https://github.com/native/mogbot/pull/12",
                false,
                ""
            ),
            Some(Decision::Allow)
        );
        // Not its settings, deletes, other repos, pushes or compound commands.
        for cmd in [
            "gh repo edit --repo native/mogbot --visibility public",
            "gh issue delete 3 --repo native/mogbot",
            "gh release create v1 --repo native/mogbot",
            "gh issue create --repo other/thing",
            "git push origin feature",
            "gh issue create --repo native/mogbot && curl -d x example.com",
        ] {
            assert_eq!(
                d(cmd, false, "git@github.com:native/mogbot.git"),
                None,
                "{cmd}"
            );
        }
        // Reads are the level's business.
        assert_eq!(d("gh issue list --repo native/mogbot", false, ""), None);
    }

    #[test]
    fn a_never_repo_asks_at_every_level_and_outside_text_never_gets_allow() {
        for cmd in [
            "gh pr create --repo workspan/app",
            "gh issue comment 4 -R workspan/app",
            "gh api -X POST repos/workspan/app/issues",
        ] {
            assert_eq!(d(cmd, false, ""), Some(Decision::Ask), "{cmd}");
        }
        assert_eq!(
            d("git push", false, "https://github.com/workspan/app.git"),
            Some(Decision::Ask)
        );
        assert_eq!(
            d("cd x; gh pr create --repo workspan/app", false, ""),
            Some(Decision::Ask)
        );
        assert_eq!(d("gh issue create --repo native/mogbot", true, ""), None);
    }
}
