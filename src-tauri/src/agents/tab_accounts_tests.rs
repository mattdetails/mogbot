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

/* ------------------------------------------------- the chip's choice */

fn line(id: &str, name: &str) -> crate::agents::inventory::AccountLine {
    crate::agents::inventory::AccountLine {
        engine: Engine::Claude,
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

#[test]
fn a_chosen_account_is_used_once_then_the_wallet_decides_again() {
    let candidates = vec![
        signed_in(account("a", "Personal")),
        signed_in(account("b", "Work")),
    ];
    set_preference("chip-tab-1", "b");
    let first = preferred_or_chosen("chip-tab-1", &candidates, now()).unwrap();
    assert_eq!(first.id, "b");
    // Taken: the next start is the wallet's own pick, the first in order.
    let next = preferred_or_chosen("chip-tab-1", &candidates, now()).unwrap();
    assert_eq!(next.id, "a");
}

#[test]
fn a_chosen_account_that_isnt_signed_in_is_ignored_and_dropped() {
    let mut out = signed_in(account("b", "Work"));
    out.signed_in = false;
    let candidates = vec![signed_in(account("a", "Personal")), out];
    set_preference("chip-tab-2", "b");
    assert_eq!(
        preferred_or_chosen("chip-tab-2", &candidates, now())
            .unwrap()
            .id,
        "a"
    );
    assert!(!prefer().contains_key("chip-tab-2"));
}

#[test]
fn the_chip_lists_signed_in_claude_accounts_and_marks_the_current_one() {
    let mut codex = line("c", "Codex");
    codex.engine = Engine::Codex;
    let mut gone = line("x", "Old");
    gone.signed_in = false;
    let mut out = line("b", "Work");
    out.out = true;
    let view = view_of(
        &[line("a", "Personal"), out, codex, gone],
        Some("a"),
        &Utc,
        now(),
    );
    assert_eq!(view.current.as_deref(), Some("Personal"));
    let ids: Vec<&str> = view.accounts.iter().map(|a| a.id.as_str()).collect();
    assert_eq!(ids, ["a", "b"]);
    assert!(view.accounts[0].current && !view.accounts[1].current);
    assert!(view.accounts[1].out);
    assert!(view.accounts[1].label.starts_with("Work · out"));
}

#[test]
fn one_account_offers_no_chip() {
    let view = view_of(&[line("a", "Personal")], Some("a"), &Utc, now());
    assert!(view.accounts.is_empty() && view.current.is_none());
}

#[test]
fn moving_a_tab_restarts_it_with_its_conversation() {
    let n = chosen_notice("chip-tab-3", "Work");
    assert_eq!(n.kind, NoticeKind::Switch);
    assert!(!n.ask);
    assert_eq!(n.to.as_deref(), Some("Work"));
    assert_eq!(n.prompt.as_deref(), Some(CONTINUE));
    assert_eq!(n.line, "Continuing on Work…");
}

/* ------------------------------------- the 5-hour and weekly figures, the offer */

fn window(kind: &str, used: f64, resets_in_ms: i64) -> crate::agents::quota::QuotaWindow {
    crate::agents::quota::QuotaWindow {
        kind: kind.into(),
        used_percent: Some(used),
        resets_at: Some(now() + resets_in_ms),
        window_minutes: None,
        limited: false,
        observed_at: now(),
    }
}

fn pace(kind: &str, reaches_in_ms: i64, resets_in_ms: i64) -> crate::agents::forecast::Pace {
    crate::agents::forecast::Pace {
        estimate: true,
        kind: kind.into(),
        resets_at: now() + resets_in_ms,
        reaches_at: now() + reaches_in_ms,
        readings: 4,
        span_minutes: 40,
    }
}

const HOUR: i64 = 60 * 60 * 1000;

#[test]
fn each_account_says_its_5_hour_and_weekly_room_apart() {
    let mut work = line("a", "Work");
    work.windows = vec![
        window("five_hour", 60.0, 2 * HOUR),
        window("seven_day", 39.0, 72 * HOUR),
    ];
    let view = view_of(&[work, line("b", "Personal")], Some("a"), &Utc, now());
    assert_eq!(view.accounts[0].session_left, Some(40));
    assert_eq!(view.accounts[0].week_left, Some(61));
    // The one figure is still the tighter one.
    assert_eq!(view.accounts[0].left_percent, Some(40));
    assert_eq!(view.accounts[1].session_left, None);
}

fn nearly_out_work() -> crate::agents::inventory::AccountLine {
    let mut work = line("a", "Work");
    work.windows = vec![window("five_hour", 80.0, 3 * HOUR)];
    work.pace = vec![pace("five_hour", HOUR, 3 * HOUR)];
    work
}

fn roomy(id: &str, name: &str, used: f64) -> crate::agents::inventory::AccountLine {
    let mut l = line(id, name);
    l.windows = vec![window("five_hour", used, 4 * HOUR)];
    l
}

#[test]
fn a_run_out_before_the_refill_offers_the_roomiest_other_account() {
    let lines = [
        nearly_out_work(),
        roomy("b", "Personal", 50.0),
        roomy("c", "Spare", 10.0),
    ];
    let s = suggestion_of(&lines, Some("a"), &Utc, now()).expect("an offer");
    assert!(s.estimate);
    assert_eq!(s.to_id, "c");
    assert!(s.line.starts_with("At this pace Work runs out at "));
    assert!(s
        .line
        .contains("before its 5-hour limit refills (an estimate)"));
    assert!(s.line.ends_with("Spare has 90% left."));
    // And the chip carries it.
    assert!(view_of(&lines, Some("a"), &Utc, now()).suggest.is_some());
}

#[test]
fn no_offer_below_75_used_or_when_it_lasts_until_the_refill() {
    let mut light = nearly_out_work();
    light.windows = vec![window("five_hour", 60.0, 3 * HOUR)];
    let other = roomy("b", "Personal", 10.0);
    assert!(suggestion_of(&[light, other.clone()], Some("a"), &Utc, now()).is_none());

    let mut lasts = nearly_out_work();
    lasts.pace = vec![pace("five_hour", 4 * HOUR, 3 * HOUR)];
    assert!(suggestion_of(&[lasts, other.clone()], Some("a"), &Utc, now()).is_none());

    let mut no_pace = nearly_out_work();
    no_pace.pace.clear();
    assert!(suggestion_of(&[no_pace, other], Some("a"), &Utc, now()).is_none());
}

#[test]
fn no_offer_without_a_roomy_other_account() {
    let tight = roomy("b", "Personal", 80.0);
    assert!(suggestion_of(&[nearly_out_work(), tight], Some("a"), &Utc, now()).is_none());
    let mut same = roomy("b", "Personal", 0.0);
    same.same_as = Some("Work".into());
    assert!(suggestion_of(&[nearly_out_work(), same], Some("a"), &Utc, now()).is_none());
    let mut out = roomy("b", "Personal", 0.0);
    out.out = true;
    assert!(suggestion_of(&[nearly_out_work(), out], Some("a"), &Utc, now()).is_none());
    let unread = line("b", "Personal");
    assert!(suggestion_of(&[nearly_out_work(), unread], Some("a"), &Utc, now()).is_none());
}
