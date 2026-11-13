use super::*;
use chrono::FixedOffset;

const HOUR: i64 = 3_600_000;
// 2026-11-13 10:00 UTC; the clock is UTC+1, so it reads 11:00 AM (tests use the 12-hour clock).
const NOW: i64 = 1_794_564_000_000;

fn tz() -> FixedOffset {
    FixedOffset::east_opt(3600).unwrap()
}

fn window(used: f64, resets_in: i64) -> QuotaWindow {
    QuotaWindow {
        kind: "five_hour".into(),
        used_percent: Some(used),
        resets_at: Some(NOW + resets_in),
        window_minutes: None,
        limited: false,
        observed_at: NOW - HOUR,
    }
}

fn line(engine: Engine, id: &str, name: &str) -> AccountLine {
    AccountLine {
        engine,
        id: id.into(),
        name: name.into(),
        this_mac: false,
        signed_in: true,
        out: false,
        out_until: None,
        next: false,
        plan: None,
        windows: Vec::new(),
        learned: Vec::new(),
        pace: Vec::new(),
        check: None,
        same_as: None,
        maybe_same_as: None,
        org_name: None,
        spent: Vec::new(),
        changes: Vec::new(),
    }
}

fn account(id: &str, name: &str) -> Account {
    Account {
        id: id.into(),
        engine: Engine::Claude,
        name: name.into(),
        added_at: 0,
        limit: None,
    }
}

#[test]
fn what_is_left_is_the_tightest_current_window() {
    let mut weekly = window(70.0, 3 * 24 * HOUR);
    weekly.kind = "seven_day".into();
    assert_eq!(left_percent(&[window(38.0, HOUR), weekly], NOW), Some(30));
    // A window that has already reset says nothing about now.
    assert_eq!(left_percent(&[window(95.0, -HOUR)], NOW), None);
    assert_eq!(left_percent(&[], NOW), None);
}

#[test]
fn an_account_says_what_is_left_out_until_or_not_signed_in() {
    let mut a = line(Engine::Claude, "default", "team@axamo.co");
    a.windows = vec![window(62.0, HOUR)];
    assert_eq!(account_label(&a, &tz(), NOW), "team@axamo.co · 38% left");

    a.out = true;
    a.out_until = Some(NOW + 7 * HOUR);
    assert_eq!(
        account_label(&a, &tz(), NOW),
        "team@axamo.co · out until 6:00 PM"
    );
    a.out_until = None;
    assert_eq!(
        account_label(&a, &tz(), NOW),
        "team@axamo.co · out of usage"
    );

    let mut b = line(Engine::Claude, "x", "dz");
    b.signed_in = false;
    assert_eq!(account_label(&b, &tz(), NOW), "dz · not signed in");
    // No reading: just the name, never a guess.
    assert_eq!(
        account_label(&line(Engine::Claude, "y", "Work"), &tz(), NOW),
        "Work"
    );
}

#[test]
fn claude_accounts_come_first_in_your_order_and_codex_says_so() {
    let rows = account_rows(
        &[
            line(Engine::Codex, "c1", "Work"),
            line(Engine::Claude, "a", "dz"),
            line(Engine::Claude, "b", "team"),
            line(Engine::OpenCode, "o", "local"),
        ],
        &tz(),
        NOW,
    );
    let labels: Vec<_> = rows.iter().map(|r| r.label.as_str()).collect();
    assert_eq!(labels, ["dz", "team", "Codex · Work"]);
    // One engine alone: no engine named.
    let only = account_rows(&[line(Engine::Codex, "c1", "Work")], &tz(), NOW);
    assert_eq!(only[0].label, "Work");
}

#[test]
fn a_chat_head_gives_its_folder_and_first_typed_line() {
    let text = [
        r#"{"type":"summary","summary":"x"}"#,
        r#"{"type":"user","cwd":"/Users/me/site","message":{"content":"<command-name>/clear</command-name>"}}"#,
        r#"{"type":"user","cwd":"/Users/me/site","message":{"content":"fix   the\npricing table"}}"#,
    ]
    .join("\n");
    let (cwd, said) = chat_head(&text);
    assert_eq!(cwd, Some(PathBuf::from("/Users/me/site")));
    assert_eq!(said.as_deref(), Some("fix the pricing table"));
}

#[test]
fn a_chat_is_labelled_by_folder_time_and_what_you_said() {
    let label = chat_label(
        Path::new("/Users/me/acme-site"),
        Some("where did we stop last time with the pricing page"),
        NOW - HOUR,
        &tz(),
        NOW,
    );
    assert_eq!(
        label,
        "acme-site · 10:00 AM · “where did we stop last time wit…”"
    );
    assert_eq!(
        chat_label(Path::new("/Users/me/x"), None, NOW, &tz(), NOW),
        "x · 11:00 AM"
    );
}

#[test]
fn only_folders_you_work_in_are_offered() {
    let app = Path::new("/Users/me/Library/Application Support/App");
    assert!(users_folder(Path::new("/Users/me/ShipStudio/site"), app));
    assert!(!users_folder(&app.join("agents/a1"), app));
    assert!(!users_folder(
        Path::new("/Users/me/ShipStudio/.worktrees/t1"),
        app
    ));
    assert!(!users_folder(
        Path::new("/Users/me/.claude-mem/observer"),
        app
    ));
}

#[test]
fn a_chat_continues_on_other_signed_in_accounts_with_room_first() {
    let accounts = [
        (account("default", "team"), true),
        (account("a", "dz"), true),
        (account("b", "spare"), true),
        (account("c", "old"), false),
        (account("d", "legacy"), true),
    ];
    let lines = vec![
        AccountRow {
            engine: Engine::Claude,
            id: "a".into(),
            label: "dz · out until 18:00".into(),
            next: false,
        },
        AccountRow {
            engine: Engine::Claude,
            id: "b".into(),
            label: "spare · 80% left".into(),
            next: true,
        },
    ];
    // "legacy" can only run with a token a Terminal would have to be handed.
    let usable = |a: &Account| a.id != "d";
    let got = targets_for("default", &accounts, &lines, &usable);
    let labels: Vec<_> = got.iter().map(|t| t.label.as_str()).collect();
    assert_eq!(
        labels,
        [
            "Continue on spare · 80% left",
            "Continue on dz · out until 18:00"
        ]
    );
}

#[test]
fn the_terminal_command_sets_only_the_accounts_folder_and_quotes_everything() {
    let mac = account(wallet::THIS_MAC, "team");
    let cmd = resume_command(Path::new("/Users/me/it's here"), &mac, "s-1");
    assert!(cmd.starts_with(r"cd '/Users/me/it'\''s here' && env -u CLAUDE_CONFIG_DIR claude --resume 's-1' 'Continue where"));
    assert!(!cmd.contains("TOKEN"));
}
