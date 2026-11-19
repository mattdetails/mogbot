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
    assert_eq!(s.at, 18 * 60);
}

#[test]
fn it_posts_once_at_its_time_and_not_before() {
    let s = Settings::default();
    let st = State::default();
    assert_eq!(decide(&s, &st, &Local, at_local(17, 59), 0), Step::Nothing);
    assert!(matches!(
        decide(&s, &st, &Local, at_local(18, 1), 0),
        Step::Post { .. }
    ));
    let done = State {
        settled_day: Some("2026-11-19".into()),
        last_posted_at: 1,
    };
    assert_eq!(
        decide(&s, &done, &Local, at_local(18, 30), 0),
        Step::Nothing
    );
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
    let now = at_local(18, 40);
    assert_eq!(
        decide(&s, &State::default(), &Local, now, now - 30 * MINUTE_MS),
        Step::Nothing
    );
    assert!(matches!(
        decide(&s, &State::default(), &Local, now, now - 90 * MINUTE_MS),
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
        decide(&s, &State::default(), &Local, at_local(18, 40), 0),
        Step::Nothing
    );
}

#[test]
fn the_message_says_what_closed_what_waits_and_is_short() {
    let f = Facts {
        closed: vec![("Finance".into(), 6), ("Research".into(), 1)],
        open: 4,
        waiting: 1,
        stuck: vec![("Recruiter".into(), "Reply to candidates".into())],
        overloaded: vec!["Finance".into()],
    };
    let t = compose(&f);
    assert!(t.starts_with("End of day. Today · 7 done, 1 waits on you."));
    assert!(t.contains("Finance 6 and Research 1."));
    assert!(t.contains("4 asks are still open"));
    assert!(t.contains("1 stuck, starting with Recruiter's \"Reply to candidates\""));
    assert!(t.contains("Finance busy."));
    // The question lives in the chips, not the text.
    assert!(!t.contains('?'));
}

#[test]
fn the_chips_are_the_three_answers() {
    let v = question_blocks("End of day. Today · 2 done.")
        .unwrap()
        .to_string();
    assert!(v.contains("Did anything today miss the mark?"));
    for chip in ["All good", "Something missed", "Not tonight"] {
        assert!(v.contains(chip), "{chip}");
    }
}

#[test]
fn a_day_with_nothing_posts_nothing() {
    assert!(empty_day(&Facts::default()));
    assert!(!empty_day(&Facts {
        open: 1,
        ..Facts::default()
    }));
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
