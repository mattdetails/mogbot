//! Going back in the code too: "Also undo the code changes since then" on
//! Rewind to here and Edit and resend, for a project-bound agent working in
//! its own copy of the project (`task`; docs/agents.md, "Rewind, fork and
//! edit").
//!
//! - **Only where the point is known.** At the start of every turn in a copy
//!   the app notes the copy's commit (`code_points.jsonl`, [`CodePoint`]),
//!   and only when that commit *is* the copy as it stood: on its own branch,
//!   nothing in progress, and the working tree's snapshot the same tree as
//!   the commit's. Anything else (work left unsaved by a blocked commit, a
//!   file left out of the commits) notes no commit, and that message offers
//!   no code option. Turns from before this was noted offer none either:
//!   a commit is never guessed by time.
//! - **Which message.** The point of the turn whose batch *starts* with the
//!   message, as `rewind::plan` reads it: a message batched behind another
//!   shares that turn, and undoing it would undo the other's work too.
//! - **Whose copy.** Only the copy the point was noted in, still open, still
//!   the conversation's, still on its own branch, still locked as this
//!   agent's (`task::LOCK_MARK`), with no merge or rebase in progress, and
//!   with the noted commit still in its history. Never one another
//!   conversation of the agent has worked in since (they share the copy),
//!   never a copy that was kept, discarded or moved, never while a turn runs
//!   or the user drives it.
//! - **Nothing lost for good.** What's unsaved is committed first (the same
//!   commit a turn's end makes, so secrets and big files stay out), the
//!   copy's latest commit is kept under [`UNDONE_REFS`], and only then does
//!   the copy's own branch go back (`git reset --hard`). Files git never had
//!   (left out of every commit) stay as they are, and the line names them.
//!   Discard removes those refs with the copy.
//! - **Fork never undoes code**: the conversation it leaves stays exactly as
//!   it was, and it shares the copy.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

use super::conversations;
use super::store;
use super::task::{self, TaskCopy};
use crate::errors::CommandError;

const POINTS: &str = "code_points.jsonl";
/// Points kept per agent, as `rewind::MAX_POINTS`.
pub const MAX_POINTS: usize = 400;
/// Where an undone commit is kept: `refs/rewound/<copy id>/<when>`. Not a
/// branch, so no branch list shows it; Discard removes it with the copy.
pub const UNDONE_REFS: &str = "refs/rewound";
/// The message of what's committed before the copy goes back.
const BEFORE_GOING_BACK: &str = "Work in the copy before going back";

/// One writer at a time for the file.
static LOCK: Mutex<()> = Mutex::new(());

/// Where a copy stood when a turn began.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CodePoint {
    pub ts: i64,
    /// The messages the turn answered, in order.
    pub messages: Vec<String>,
    /// The conversation the turn ran in.
    pub conversation: String,
    /// The copy's id (`TaskCopy::id`).
    pub copy: String,
    /// The copy's commit, when it was exactly the copy as it stood.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head: Option<String>,
}

/// Why a message offers no code option.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoPoint {
    /// No turn noted the copy exactly before it (an older turn, a message
    /// batched behind another, unsaved work at the time).
    Unknown,
    /// The copy it was noted in isn't this conversation's open copy any more
    /// (kept, discarded, another one made since).
    OtherCopy,
    /// Another conversation has worked in the same copy since.
    Shared,
}

impl NoPoint {
    pub fn sentence(self) -> &'static str {
        match self {
            NoPoint::Unknown => {
                "Where the copy stood before that message isn't known, so its code can't go back. Nothing was changed."
            }
            NoPoint::OtherCopy => {
                "The copy from back then was kept or discarded since, so there's no code to undo. Nothing was changed."
            }
            NoPoint::Shared => {
                "Another conversation has worked in this copy since then, so undoing the code would undo its work too. Nothing was changed."
            }
        }
    }
}

/* ------------------------------------------------------------- noting */

/// A turn is starting in `copy`, whose working tree snapshots to `tree`
/// (`project::snapshot`, already taken for the change card).
pub async fn note(
    agent_id: &str,
    conversation: &str,
    messages: &[String],
    copy: &TaskCopy,
    tree: &str,
) {
    if messages.is_empty() {
        return;
    }
    let point = CodePoint {
        ts: store::now_ms(),
        messages: messages.to_vec(),
        conversation: conversation.to_string(),
        copy: copy.id.clone(),
        head: exact_head(copy, tree).await,
    };
    write_point(agent_id, &point);
}

/// The copy's commit, when it is exactly what the copy holds.
async fn exact_head(copy: &TaskCopy, tree: &str) -> Option<String> {
    let dir = Path::new(&copy.path);
    if !task::on_own_branch(dir, &copy.branch).await || task::in_progress(dir).await.is_some() {
        return None;
    }
    let head = task::read(dir, &["rev-parse", "-q", "--verify", "HEAD^{commit}"]).await?;
    let head_tree = task::read(dir, &["rev-parse", &format!("{head}^{{tree}}")]).await?;
    (head_tree == tree).then_some(head)
}

fn write_point(agent_id: &str, point: &CodePoint) {
    let Some(home) = store::agent_home(agent_id).ok().filter(|h| h.is_dir()) else {
        return;
    };
    let Ok(line) = serde_json::to_string(point) else {
        return;
    };
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = home.join(POINTS);
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let written = if raw.lines().count() < MAX_POINTS + MAX_POINTS / 2
        && (raw.is_empty() || raw.ends_with('\n'))
    {
        super::rewind::append_private(&path, format!("{line}\n").as_bytes())
    } else {
        let mut lines: Vec<&str> = raw.lines().collect();
        lines.push(&line);
        if lines.len() > MAX_POINTS + MAX_POINTS / 2 {
            lines.drain(..lines.len() - MAX_POINTS);
        }
        store::write_private(&path, (lines.join("\n") + "\n").as_bytes())
    };
    if let Err(e) = written {
        tracing::warn!("[Agents] couldn't note where a copy stood: {e}");
    }
}

fn points(agent_id: &str) -> Vec<CodePoint> {
    let Some(home) = store::agent_home(agent_id).ok() else {
        return Vec::new();
    };
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    std::fs::read_to_string(home.join(POINTS))
        .unwrap_or_default()
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

/* ------------------------------------------------------------ finding */

/// The point before `message` in `conversation`, for its open copy `copy`.
/// The latest turn that answered it, when that turn started with it, noted
/// a commit, in that copy; and no other conversation's turn ran in the copy
/// after it. Pure.
pub fn find<'a>(
    points: &'a [CodePoint],
    message: &str,
    conversation: &str,
    copy: &str,
) -> Result<&'a CodePoint, NoPoint> {
    let Some(at) = points
        .iter()
        .rposition(|p| p.messages.iter().any(|m| m == message))
    else {
        return Err(NoPoint::Unknown);
    };
    let point = &points[at];
    if point.messages.first().map(String::as_str) != Some(message) || point.head.is_none() {
        return Err(NoPoint::Unknown);
    }
    if point.copy != copy {
        return Err(NoPoint::OtherCopy);
    }
    if points[at + 1..]
        .iter()
        .any(|p| p.copy == copy && p.conversation != conversation)
    {
        return Err(NoPoint::Shared);
    }
    Ok(point)
}

/// The conversation's open copy: the agent's own, or the one parked with
/// that conversation's project.
fn conversation_copy(agent: &store::Agent, conversation: &str) -> Option<TaskCopy> {
    if agent.work_directly {
        return None;
    }
    let project = conversations::project_of(agent, conversation)?;
    conversations::copies(agent)
        .into_iter()
        .find(|c| c.project == project)
        .cloned()
}

/// The commit to go back to and the copy, or why there's none.
fn locate(
    agent_id: &str,
    conversation: &str,
    message: &str,
) -> Result<Result<(String, TaskCopy), NoPoint>, CommandError> {
    let agent = store::get(agent_id)?;
    let Some(copy) = conversation_copy(&agent, conversation) else {
        return Ok(Err(NoPoint::OtherCopy));
    };
    let all = points(agent_id);
    Ok(find(&all, message, conversation, &copy.id)
        .map(|p| (p.head.clone().unwrap_or_default(), copy)))
}

/* ------------------------------------------------------------- offer */

/// What the confirm offers: the copy's project and what going back undoes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodeOffer {
    /// The project's folder name, as the chat says it.
    pub project: String,
    /// Commits in the copy since then.
    pub commits: u32,
    /// Work in the copy not committed yet (committed, then undone with them).
    pub unsaved: bool,
}

/// Whether going back before `message` can also undo the code, and what it
/// would undo. `None` when there's no known point or nothing to undo.
pub async fn offer(
    agent_id: &str,
    conversation: &str,
    message: &str,
) -> Result<Option<CodeOffer>, CommandError> {
    let Ok((head, copy)) = locate(agent_id, conversation, message)? else {
        return Ok(None);
    };
    if ready(agent_id, &copy, &head).await.is_err() {
        return Ok(None);
    }
    let dir = Path::new(&copy.path);
    let commits = task::read(dir, &["rev-list", "--count", &format!("{head}..HEAD")])
        .await
        .and_then(|n| n.parse::<u32>().ok())
        .unwrap_or(0);
    let unsaved = task::read(
        dir,
        &[
            "status",
            "--porcelain",
            "--",
            ".",
            ":(exclude,glob)**/node_modules",
            ":(exclude,glob)**/node_modules/**",
        ],
    )
    .await
    .is_some_and(|s| !s.trim().is_empty());
    if commits == 0 && !unsaved {
        return Ok(None);
    }
    Ok(Some(CodeOffer {
        project: super::project::folder_name(&copy.project).to_string(),
        commits,
        unsaved,
    }))
}

/* ----------------------------------------------------------- restore */

/// What going back did to the copy.
#[derive(Debug, Clone, PartialEq)]
pub struct Restored {
    /// The project's folder name.
    pub project: String,
    /// Commits undone (what was unsaved counts as one).
    pub undone: u32,
    /// Where they're kept, when there were any.
    pub kept: Option<String>,
    /// Files git never had, which stay as they are.
    pub stays: Vec<String>,
}

/// Everything that must hold before a copy goes back. Touches nothing.
async fn ready(agent_id: &str, copy: &TaskCopy, head: &str) -> Result<(), CommandError> {
    let dir = Path::new(&copy.path);
    if !dir.is_dir() {
        return Err(CommandError::expected(
            "The copy isn't there any more, so there's no code to undo. Nothing was changed.",
        ));
    }
    if !held_by(dir, &copy.path, agent_id).await {
        return Err(CommandError::expected(
            "The copy isn't held for this agent any more, so it was left as it is. Nothing was changed.",
        ));
    }
    if !task::on_own_branch(dir, &copy.branch).await {
        return Err(CommandError::expected(task::OFF_BRANCH));
    }
    if let Some(what) = task::in_progress(dir).await {
        return Err(CommandError::expected(format!(
            "The copy is in the middle of {what}. Finish it in the copy first, then go back again. Nothing was changed."
        )));
    }
    let ancestor = task::git(dir, &["merge-base", "--is-ancestor", head, "HEAD"]).await?;
    if !ancestor.status.success() {
        return Err(CommandError::expected(
            "The copy's history changed since then, so where it stood isn't known any more. Nothing was changed.",
        ));
    }
    Ok(())
}

/// The copy is still a worktree of its project, locked as `agent_id`'s.
async fn held_by(dir: &Path, path: &str, agent_id: &str) -> bool {
    let Some(list) = task::read(dir, &["worktree", "list", "--porcelain"]).await else {
        return false;
    };
    let reason = format!("{}{agent_id}", task::LOCK_MARK);
    crate::commands::git::parse_worktree_porcelain(&list)
        .iter()
        .find(|w| task::same_path(&w.path, path))
        .is_some_and(|w| w.locked.as_deref() == Some(reason.as_str()))
}

/// Put `copy` back to `head`: what's unsaved is committed, the latest commit
/// kept under [`UNDONE_REFS`], then the copy's branch reset. Refused, with
/// nothing changed, unless every guard in [`ready`] holds.
pub async fn restore_copy(
    agent_id: &str,
    copy: &TaskCopy,
    head: &str,
) -> Result<Restored, CommandError> {
    ready(agent_id, copy, head).await?;
    let dir = Path::new(&copy.path);
    let saved = task::commit_pending(dir, &copy.branch, BEFORE_GOING_BACK, None).await?;
    if !saved.conflicts.is_empty() || !saved.markers.is_empty() {
        let mut files = saved.conflicts;
        files.extend(saved.markers);
        return Err(CommandError::expected(format!(
            "Some files in the copy are still being chosen between ({}), so its code was left as it is. Nothing was changed.",
            files.into_iter().take(5).collect::<Vec<_>>().join(", ")
        )));
    }
    let project = super::project::folder_name(&copy.project).to_string();
    let now = task::run(dir, &["rev-parse", "HEAD"]).await?;
    let mut kept = None;
    let mut undone = 0;
    if now != head {
        undone = task::read(dir, &["rev-list", "--count", &format!("{head}..{now}")])
            .await
            .and_then(|n| n.parse::<u32>().ok())
            .unwrap_or(0);
        let name = format!("{UNDONE_REFS}/{}/{}", copy.id, store::now_ms());
        task::run(dir, &["update-ref", &name, &now]).await?;
        task::run(dir, &["reset", "--hard", "-q", head]).await?;
        kept = Some(name);
    }
    crate::cache::GIT_CACHE.invalidate(&copy.path);
    crate::cache::GIT_CACHE.invalidate(&copy.project);
    let stays = task::left_out(copy)
        .await
        .into_iter()
        .filter(|l| l.why != task::LeftOutWhy::Dependencies)
        .map(|l| l.path)
        .collect();
    Ok(Restored {
        project,
        undone,
        kept,
        stays,
    })
}

/// "Also undo the code changes since then": the conversation's copy goes
/// back to where it stood before the user's `message`. Under the project's
/// lock, and refused while the agent works or is driven.
pub async fn restore(
    agent_id: &str,
    conversation: &str,
    message: &str,
) -> Result<Restored, CommandError> {
    let (_, copy) = locate(agent_id, conversation, message)?
        .map_err(|why| CommandError::expected(why.sentence()))?;
    task::refuse_while_working(&store::get(agent_id)?).await?;
    let _guard = task::lock(&copy.project).await;
    // Asked again under the lock: a Keep or Discard may have got there first.
    task::refuse_while_working(&store::get(agent_id)?).await?;
    let (head, copy) = locate(agent_id, conversation, message)?
        .map_err(|why| CommandError::expected(why.sentence()))?;
    let restored = restore_copy(agent_id, &copy, &head).await?;
    // Whatever stopped the last Keep is undone with the rest.
    store::update(agent_id, |a| {
        if let Some(c) = a.copy.as_mut().filter(|c| c.id == copy.id) {
            c.stuck = None;
        }
        for parked in &mut a.conversations.parked {
            if let Some(c) = parked.copy.as_mut().filter(|c| c.id == copy.id) {
                c.stuck = None;
            }
        }
    })?;
    tracing::info!(
        agent = agent_id,
        conversation,
        undone = restored.undone,
        "[Agents] put a copy back to before a message"
    );
    Ok(restored)
}

/// Discard: the commits a rewind kept for copy `copy_id` go with it.
pub async fn forget_undone(project: &Path, copy_id: &str) {
    if copy_id.is_empty() {
        return;
    }
    let prefix = format!("{UNDONE_REFS}/{copy_id}/");
    let Some(refs) = task::read(project, &["for-each-ref", "--format=%(refname)", &prefix]).await
    else {
        return;
    };
    for name in refs.lines().map(str::trim).filter(|l| !l.is_empty()) {
        let _ = task::git(project, &["update-ref", "-d", name]).await;
    }
}

/* ------------------------------------------------------------- words */

/// What the rewind's line says about the code, in place of `NOT_UNDONE`.
pub fn line(restored: &Restored) -> String {
    let mut out = match (restored.undone, &restored.kept) {
        (0, _) | (_, None) => format!(
            "Its copy of {} had no code changes since then.",
            restored.project
        ),
        (n, Some(kept)) => format!(
            "Its copy of {} is back to how it was then: {} undone, kept in git as {kept}, not deleted.",
            restored.project,
            match n {
                1 => "1 saved change".to_string(),
                n => format!("{n} saved changes"),
            }
        ),
    };
    if !restored.stays.is_empty() {
        out.push_str(&format!(
            " Files git never had stay as they are: {}.",
            restored
                .stays
                .iter()
                .take(5)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    out.push_str(" Anything it sent since isn't undone.");
    out
}

#[cfg(test)]
#[path = "rewind_code_tests.rs"]
mod tests;
