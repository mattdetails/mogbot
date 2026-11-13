use super::*;
use crate::agents::wallet::Candidate;
use chrono::{TimeZone, Utc};

fn now() -> i64 {
    Utc.with_ymd_and_hms(2026, 11, 13, 13, 0, 0)
        .unwrap()
        .timestamp_millis()
}

fn account(id: &str, name: &str) -> Account {
    Account {
        id: id.to_string(),
        engine: Engine::Claude,
        name: name.to_string(),
        added_at: 0,
        limit: None,
    }
}

fn signed_in(a: Account) -> Candidate {
    Candidate {
        account: a,
        signed_in: true,
    }
}

/// Claude Code 2.1.310's own entry, as it wrote it (fields trimmed).
const LIMIT_ENTRY: &str = r#"{"type":"assistant","isApiErrorMessage":true,"apiError":"usage_limit_reached","error":"rate_limit","apiErrorStatus":429,"quotaLimits":{"status":"rejected","resetsAt":1793022600,"rateLimitType":"five_hour"},"message":{"role":"assistant","model":"<synthetic>","content":[{"type":"text","text":"You've hit your session limit · resets 4:40pm (Europe/Sarajevo)"}]}}"#;

#[test]
fn claude_codes_limit_entry_is_read_with_its_reset() {
    assert_eq!(limit_in(LIMIT_ENTRY), Some(Some(1_793_022_600_000)));
}

#[test]
fn other_api_errors_are_not_the_limit() {
    let long = r#"{"isApiErrorMessage":true,"apiError":"prompt_too_long","message":{"content":[{"type":"text","text":"Prompt is too long"}]}}"#;
    assert_eq!(limit_in(long), None);
    let blip = r#"{"isApiErrorMessage":true,"apiError":"rate_limit_error","message":{"content":[{"type":"text","text":"API Error: 429 rate limited"}]}}"#;
    assert_eq!(limit_in(blip), None);
}

#[test]
fn the_conversation_talking_about_limits_is_not_the_limit() {
    let said = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"You've hit your usage limit · resets 3pm"}]}}"#;
    assert_eq!(limit_in(said), None);
    let typed = r#"{"type":"user","message":{"content":"what does isApiErrorMessage mean when you've hit your limit?"}}"#;
    assert_eq!(limit_in(typed), None);
}

#[test]
fn an_older_claude_code_is_read_by_its_words() {
    let old = r#"{"isApiErrorMessage":true,"message":{"content":[{"type":"text","text":"Claude AI usage limit reached|1793022600"}]}}"#;
    assert_eq!(limit_in(old), Some(Some(1_793_022_600_000)));
}

#[test]
fn the_session_comes_from_the_tabs_argv() {
    let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    assert_eq!(
        session_arg(&args(&["--resume", "abc", "--add-dir", "/x"])),
        Some(("abc".to_string(), true))
    );
    assert_eq!(
        session_arg(&args(&["--session-id", "abc"])),
        Some(("abc".to_string(), false))
    );
    assert_eq!(
        session_arg(&args(&["--dangerously-skip-permissions"])),
        None
    );
}

#[test]
fn only_engines_with_a_plan_are_looked_after() {
    assert_eq!(engine_of("claude-code"), Some(Engine::Claude));
    assert_eq!(engine_of("codex"), Some(Engine::Codex));
    assert_eq!(engine_of("opencode"), None);
    assert_eq!(engine_of("terminal"), None);
}

#[test]
fn running_out_moves_to_the_next_account_with_the_continue_prompt() {
    let resets = now() + 3 * 60 * 60 * 1000;
    let from = Account {
        limit: Some(LimitHit {
            at: now(),
            resets_at: Some(resets),
        }),
        ..account("default", "Personal")
    };
    let candidates = [signed_in(from.clone()), signed_in(account("w1", "Work"))];
    let n = notice_for("tab-1", &from, &candidates, Mode::Auto, &Utc, now());
    assert_eq!(n.kind, NoticeKind::Switch);
    assert!(!n.ask);
    assert_eq!(n.to.as_deref(), Some("Work"));
    assert_eq!(n.prompt.as_deref(), Some(CONTINUE));
    assert!(
        n.line
            .starts_with("Switched to Work: Personal is out of usage until"),
        "{}",
        n.line
    );

    let asked = notice_for("tab-1", &from, &candidates, Mode::Ask, &Utc, now());
    assert!(asked.ask);
}

#[test]
fn every_account_out_says_when_the_first_is_back() {
    let out = |id: &str, name: &str, hours: i64| Account {
        limit: Some(LimitHit {
            at: now(),
            resets_at: Some(now() + hours * 60 * 60 * 1000),
        }),
        ..account(id, name)
    };
    let from = out("default", "Personal", 3);
    let candidates = [signed_in(from.clone()), signed_in(out("w1", "Work", 1))];
    let n = notice_for("tab-1", &from, &candidates, Mode::Auto, &Utc, now());
    assert_eq!(n.kind, NoticeKind::AllOut);
    assert_eq!(n.to, None);
    assert_eq!(n.prompt, None);
    assert!(
        n.line
            .starts_with("Both Claude Code accounts have reached their usage limit"),
        "{}",
        n.line
    );
}

#[test]
fn a_transcript_is_read_in_whole_lines_from_where_the_tab_started() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.jsonl");
    std::fs::write(&path, "{\"old\":1}\n").unwrap();
    let start = std::fs::metadata(&path).unwrap().len();
    assert_eq!(read_new(&path, start), None);

    let mut more = std::fs::read_to_string(&path).unwrap();
    more.push_str(LIMIT_ENTRY);
    more.push_str("\n{\"half\":");
    std::fs::write(&path, &more).unwrap();
    let (lines, to) = read_new(&path, start).unwrap();
    assert_eq!(lines, vec![LIMIT_ENTRY.to_string()]);
    assert_eq!(to, start + LIMIT_ENTRY.len() as u64 + 1);
}

#[test]
fn modes_are_read_from_their_words() {
    assert_eq!(Mode::parse("auto").unwrap(), Mode::Auto);
    assert_eq!(Mode::parse(" Ask ").unwrap(), Mode::Ask);
    assert_eq!(Mode::parse("off").unwrap(), Mode::Off);
    assert!(Mode::parse("sometimes").is_err());
}
