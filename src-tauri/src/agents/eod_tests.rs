use super::*;
use chrono::{Local, TimeZone};

fn at_local(h: u32, m: u32) -> i64 {
    Local
        .with_ymd_and_hms(2026, 11, 19, h, m, 0)
        .unwrap()
        .timestamp_millis()
}

#[test]
fn it_is_on_at_half_past_five_until_turned_off() {
    let s = Settings::default();
    assert!(s.on);
    assert_eq!(s.at, 17 * 60 + 30);
}

#[test]
fn it_posts_once_at_its_time_and_not_before() {
    let s = Settings::default();
    let st = State::default();
    assert_eq!(decide(&s, &st, &Local, at_local(17, 29), 0), Step::Nothing);
    assert!(matches!(
        decide(&s, &st, &Local, at_local(17, 31), 0),
        Step::Post { .. }
    ));
    let done = State {
        settled_day: Some("2026-11-19".into()),
        last_posted_at: 1,
    };
    assert_eq!(decide(&s, &done, &Local, at_local(18, 0), 0), Step::Nothing);
}

#[test]
fn a_night_missed_is_skipped_not_posted_late() {
    let s = Settings::default();
    assert!(matches!(
        decide(&s, &State::default(), &Local, at_local(22, 0), 0),
        Step::Missed { .. }
    ));
}

#[test]
fn it_waits_while_the_user_is_mid_conversation() {
    let s = Settings::default();
    let now = at_local(17, 40);
    assert_eq!(
        decide(&s, &State::default(), &Local, now, now - 2 * MINUTE_MS),
        Step::Nothing
    );
    assert!(matches!(
        decide(&s, &State::default(), &Local, now, now - 20 * MINUTE_MS),
        Step::Post { .. }
    ));
}

#[test]
fn off_posts_nothing() {
    let s = Settings {
        on: false,
        at: DEFAULT_AT,
    };
    assert_eq!(
        decide(&s, &State::default(), &Local, at_local(17, 40), 0),
        Step::Nothing
    );
}

#[test]
fn the_message_says_what_closed_what_is_open_and_asks_once() {
    let f = Facts {
        closed: vec![("Finance".into(), 3), ("Research".into(), 1)],
        open: 4,
        stuck: vec![("Recruiter".into(), "Reply to candidates".into())],
        overloaded: vec!["Finance".into()],
    };
    let t = compose(&f);
    assert!(t.starts_with(HEAD));
    assert!(t.contains("closed 4 asks today (Finance 3 and Research 1)"));
    assert!(t.contains("4 asks are still open"));
    assert!(t.contains("1 stuck, starting with Recruiter's \"Reply to candidates\""));
    assert!(t.contains("Finance overloaded"));
    assert_eq!(t.matches('?').count(), 1);
}

#[test]
fn a_quiet_day_still_asks_its_question() {
    let t = compose(&Facts::default());
    assert!(t.contains("Nothing is open on any agent's list."));
    assert!(t.ends_with("chase tomorrow?"));
}

#[test]
fn the_tool_reads_times_and_switches() {
    let now = Settings::default();
    assert!(!wanted(&serde_json::json!({"off": true}), &now).unwrap().on);
    let n = wanted(
        &serde_json::json!({"at": "18:15"}),
        &Settings { on: false, at: 0 },
    )
    .unwrap();
    assert!(n.on);
    assert_eq!(n.at, 18 * 60 + 15);
    assert!(wanted(&serde_json::json!({"at": "25:00"}), &now).is_err());
    assert!(wanted(&serde_json::json!({"at": "soon"}), &now).is_err());
}
