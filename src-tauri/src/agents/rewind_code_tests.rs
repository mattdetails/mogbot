//! Going back in the code too (child of rewind_code.rs).
use super::*;
use std::path::PathBuf;
use std::process::Command;

fn sh(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args(["-c", "user.email=t@t", "-c", "user.name=t"])
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A project with one commit, and its projects root beside it.
fn project() -> (tempfile::TempDir, PathBuf, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("ShipStudio");
    let repo = root.join("acme-site");
    std::fs::create_dir_all(&repo).unwrap();
    sh(&repo, &["init", "-q", "-b", "main"]);
    sh(&repo, &["config", "user.email", "t@t"]);
    sh(&repo, &["config", "user.name", "t"]);
    std::fs::write(repo.join("index.html"), "<h1>Hello</h1>\n").unwrap();
    std::fs::write(repo.join(".gitignore"), "node_modules/\n.env\n").unwrap();
    sh(&repo, &["add", "-A"]);
    sh(&repo, &["commit", "-qm", "init"]);
    (dir, root, repo)
}

const AGENT: &str = "id-acme";

async fn copy_of(repo: &Path, root: &Path) -> TaskCopy {
    task::create(repo, root, AGENT, "Acme", "blue")
        .await
        .unwrap()
        .expect("a git project gets a copy")
}

/// Where the copy stands, as a turn's start notes it.
async fn noted(copy: &TaskCopy) -> Option<String> {
    let tree = super::super::project::snapshot(Path::new(&copy.path))
        .await
        .unwrap();
    exact_head(copy, &tree).await
}

/// A turn's end: what it left, committed.
async fn turn_ends(copy: &TaskCopy) {
    task::commit_pending(Path::new(&copy.path), &copy.branch, "Acme: turn", None)
        .await
        .unwrap();
}

fn read(path: impl AsRef<Path>) -> String {
    std::fs::read_to_string(path).unwrap()
}

fn cp(messages: &[&str], conversation: &str, copy: &str, head: Option<&str>) -> CodePoint {
    CodePoint {
        ts: 1,
        messages: messages.iter().map(|m| m.to_string()).collect(),
        conversation: conversation.into(),
        copy: copy.into(),
        head: head.map(str::to_string),
    }
}

#[test]
fn the_point_is_the_turn_that_started_with_the_message() {
    let points = vec![
        cp(&["m1"], "first", "c1", Some("a1")),
        cp(&["m2", "m3"], "first", "c1", Some("a2")),
        cp(&["m4"], "first", "c1", None),
        cp(&["m5"], "first", "c1", Some("a5")),
    ];
    assert_eq!(
        find(&points, "m1", "first", "c1").unwrap().head.as_deref(),
        Some("a1")
    );
    assert_eq!(
        find(&points, "m2", "first", "c1").unwrap().head.as_deref(),
        Some("a2")
    );
    // Batched behind m2: undoing to its turn's start would undo m2's work too.
    assert_eq!(find(&points, "m3", "first", "c1"), Err(NoPoint::Unknown));
    // Its turn began with unsaved work in the copy: no commit was noted.
    assert_eq!(find(&points, "m4", "first", "c1"), Err(NoPoint::Unknown));
    // Never noted (sent before this build): never guessed by time.
    assert_eq!(find(&points, "m0", "first", "c1"), Err(NoPoint::Unknown));
}

#[test]
fn the_latest_turn_that_answered_a_message_wins() {
    let points = vec![
        cp(&["m1"], "first", "c1", Some("a1")),
        cp(&["m1"], "first", "c1", None),
    ];
    assert_eq!(find(&points, "m1", "first", "c1"), Err(NoPoint::Unknown));
}

#[test]
fn another_copy_or_another_conversation_since_offers_nothing() {
    let points = vec![
        cp(&["m1"], "first", "c1", Some("a1")),
        cp(&["m2"], "first", "c1", Some("a2")),
        cp(&["o1"], "other", "c1", Some("a3")),
        cp(&["m3"], "first", "c1", Some("a4")),
    ];
    // Kept or discarded since: the open copy is another one.
    assert_eq!(find(&points, "m1", "first", "c2"), Err(NoPoint::OtherCopy));
    // "other" worked in the same copy after m1 and m2: undoing would undo it.
    assert_eq!(find(&points, "m1", "first", "c1"), Err(NoPoint::Shared));
    assert_eq!(find(&points, "m2", "first", "c1"), Err(NoPoint::Shared));
    // After it, nobody else did.
    assert!(find(&points, "m3", "first", "c1").is_ok());
    // Another conversation's own copy doesn't count.
    let separate = vec![
        cp(&["m1"], "first", "c1", Some("a1")),
        cp(&["o1"], "other", "c9", Some("b1")),
    ];
    assert!(find(&separate, "m1", "first", "c1").is_ok());
}

#[tokio::test]
async fn a_copy_goes_back_and_what_was_undone_is_kept() {
    let (_d, root, repo) = project();
    let copy = copy_of(&repo, &root).await;
    let path = PathBuf::from(&copy.path);
    // Before the first turn: the copy as it was made.
    let before = noted(&copy).await.expect("a clean copy is exact");
    assert_eq!(before, copy.base);
    std::fs::write(path.join("index.html"), "<h1>Blue</h1>\n").unwrap();
    std::fs::write(path.join("new.css"), "h1 { color: blue }\n").unwrap();
    turn_ends(&copy).await;
    // The next turn left something unsaved, and a secret git never takes.
    std::fs::write(path.join("index.html"), "<h1>Bluer</h1>\n").unwrap();
    std::fs::write(path.join(".env.local"), "OPENAI_API_KEY=sk-abc\n").unwrap();
    let users_head = sh(&repo, &["rev-parse", "main"]);

    let restored = restore_copy(AGENT, &copy, &before).await.unwrap();
    assert_eq!(restored.project, "acme-site");
    assert_eq!(restored.undone, 2, "the turn's commit and the unsaved work");
    assert_eq!(restored.stays, vec![".env.local".to_string()]);
    assert_eq!(read(path.join("index.html")), "<h1>Hello</h1>\n");
    assert!(!path.join("new.css").exists());
    assert_eq!(read(path.join(".env.local")), "OPENAI_API_KEY=sk-abc\n");
    assert_eq!(sh(&path, &["rev-parse", "HEAD"]), before);
    assert_eq!(
        sh(&path, &["symbolic-ref", "HEAD"]),
        format!("refs/heads/{}", copy.branch),
        "still on its own branch"
    );
    // Nothing is lost: the undone work is one ref away.
    let kept = restored.kept.clone().unwrap();
    assert!(kept.starts_with(&format!("{UNDONE_REFS}/{}/", copy.id)));
    assert_eq!(
        sh(&repo, &["show", &format!("{kept}:index.html")]),
        "<h1>Bluer</h1>"
    );
    // The user's own project never moved.
    assert_eq!(sh(&repo, &["rev-parse", "main"]), users_head);
    assert_eq!(read(repo.join("index.html")), "<h1>Hello</h1>\n");

    let said = line(&restored);
    assert!(
        said.contains("Its copy of acme-site is back to how it was then: 2 saved changes undone")
    );
    assert!(said.contains(&kept) && said.contains("not deleted"));
    assert!(said.contains("Files git never had stay as they are: .env.local."));
    assert!(said.ends_with("Anything it sent since isn't undone."));

    // The copy going (as after Keep) leaves what a rewind kept…
    task::remove(&copy, task::Branch::Force).await.unwrap();
    assert_eq!(
        sh(&repo, &["for-each-ref", "--format=%(refname)", UNDONE_REFS]),
        kept
    );
    // …and Discard, which throws the copy's work away, takes it too.
    forget_undone(&repo, &copy.id).await;
    assert_eq!(
        sh(&repo, &["for-each-ref", "--format=%(refname)", UNDONE_REFS]),
        ""
    );
}

#[tokio::test]
async fn unsaved_work_at_a_turns_start_notes_no_point() {
    let (_d, root, repo) = project();
    let copy = copy_of(&repo, &root).await;
    std::fs::write(Path::new(&copy.path).join("index.html"), "half done\n").unwrap();
    assert_eq!(noted(&copy).await, None);
    turn_ends(&copy).await;
    assert!(noted(&copy).await.is_some());
}

#[tokio::test]
async fn nothing_since_then_changes_nothing() {
    let (_d, root, repo) = project();
    let copy = copy_of(&repo, &root).await;
    let before = noted(&copy).await.unwrap();
    let restored = restore_copy(AGENT, &copy, &before).await.unwrap();
    assert_eq!(restored.undone, 0);
    assert_eq!(restored.kept, None);
    assert_eq!(
        line(&restored),
        "Its copy of acme-site had no code changes since then. Anything it sent since isn't undone."
    );
}

/// Every refusal leaves the copy and its branch exactly as they were.
#[tokio::test]
async fn a_copy_moved_locked_by_another_rewritten_or_mid_merge_is_never_touched() {
    let (_d, root, repo) = project();
    let copy = copy_of(&repo, &root).await;
    let path = PathBuf::from(&copy.path);
    let before = noted(&copy).await.unwrap();
    std::fs::write(path.join("index.html"), "turn one\n").unwrap();
    turn_ends(&copy).await;
    let head = sh(&path, &["rev-parse", "HEAD"]);
    let refs = || sh(&repo, &["for-each-ref", "--format=%(refname)", UNDONE_REFS]);

    // Held for another agent: left alone.
    let err = restore_copy("id-someone-else", &copy, &before)
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("isn't held for this agent"), "{err}");
    assert_eq!(sh(&path, &["rev-parse", "HEAD"]), head);

    // Moved to the user's branch: the same refusal as Keep's.
    sh(&repo, &["branch", "release"]);
    sh(&path, &["checkout", "-q", "release"]);
    let err = restore_copy(AGENT, &copy, &before)
        .await
        .unwrap_err()
        .to_string();
    assert_eq!(err, task::OFF_BRANCH);
    assert_eq!(sh(&repo, &["rev-parse", "release"]), copy.base);
    sh(&path, &["checkout", "-q", &copy.branch]);

    // History rewritten since: the point isn't in it any more.
    let elsewhere = sh(&path, &["commit-tree", "-m", "orphan", "HEAD^{tree}"]);
    let err = restore_copy(AGENT, &copy, &elsewhere)
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("history changed"), "{err}");

    // In the middle of a merge (a Keep that hit an overlap).
    std::fs::write(repo.join("index.html"), "the user's edit\n").unwrap();
    sh(&repo, &["commit", "-qam", "user"]);
    let merged = Command::new("git")
        .current_dir(&path)
        .args(["-c", "user.email=t@t", "-c", "user.name=t", "merge", "main"])
        .output()
        .unwrap();
    assert!(!merged.status.success(), "the overlap stops the merge");
    let err = restore_copy(AGENT, &copy, &before)
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("in the middle of a merge"), "{err}");
    assert!(read(path.join("index.html")).contains("<<<<<<<"));
    sh(&path, &["merge", "--abort"]);

    assert_eq!(sh(&path, &["rev-parse", "HEAD"]), head);
    assert_eq!(read(path.join("index.html")), "turn one\n");
    assert_eq!(refs(), "", "nothing was kept: nothing was undone");
}

fn bound_agent(name: &str, project: &Path) -> store::Agent {
    let agent = store::create(store::NewAgent {
        name: name.into(),
        role: String::new(),
        instructions: String::new(),
        shape: None,
        color: None,
        is_main: false,
    })
    .unwrap();
    let path = project.to_string_lossy().to_string();
    store::update(&agent.id, |a| a.project = Some(path)).unwrap()
}

/// The whole way through, as a rewind runs it: noted at a turn's start,
/// offered, restored; then a kept copy offers nothing.
#[tokio::test]
async fn offered_and_restored_only_in_the_copy_it_was_noted_in() {
    let (_d, root, repo) = project();
    let home = tempfile::tempdir().unwrap();
    let _serial = store::tests_lock();
    store::set_root_for_tests(Some(home.path().to_path_buf()));
    let agent = bound_agent("Acme", &repo);
    let (copy, _) = task::prepare_in(&agent.id, "blue", &root, |_| {})
        .await
        .unwrap()
        .unwrap();
    let path = PathBuf::from(&copy.path);
    let tree = super::super::project::snapshot(&path).await.unwrap();
    note(&agent.id, "first", &["m1".to_string()], &copy, &tree).await;
    std::fs::write(path.join("index.html"), "<h1>Blue</h1>\n").unwrap();
    turn_ends(&copy).await;

    // Nothing noted for that one; m1 offers the turn's commit.
    assert_eq!(offer(&agent.id, "first", "m0").await.unwrap(), None);
    assert_eq!(
        offer(&agent.id, "first", "m1").await.unwrap(),
        Some(CodeOffer {
            project: "acme-site".into(),
            commits: 1,
            unsaved: false
        })
    );
    let restored = restore(&agent.id, "first", "m1").await.unwrap();
    assert_eq!(restored.undone, 1);
    assert_eq!(read(path.join("index.html")), "<h1>Hello</h1>\n");
    // Back where it was: nothing left to undo, so nothing is offered.
    assert_eq!(offer(&agent.id, "first", "m1").await.unwrap(), None);

    // Kept (or discarded): the agent holds no copy, nothing is touched.
    store::update(&agent.id, |a| a.copy = None).unwrap();
    assert_eq!(offer(&agent.id, "first", "m1").await.unwrap(), None);
    let err = restore(&agent.id, "first", "m1")
        .await
        .unwrap_err()
        .to_string();
    assert_eq!(err, NoPoint::OtherCopy.sentence());
    store::set_root_for_tests(None);
}
