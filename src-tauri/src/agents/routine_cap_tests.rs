//! The routines cap: off by default, stops only unattended work, said once
//! when reached and once when back under, lifts as older days leave the week.

use super::*;
use crate::agents::schedule;
use crate::agents::store;
use crate::agents::usage::UsageTotals;

fn day(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

fn agent() -> store::Agent {
    serde_json::from_value(serde_json::json!({
        "id": "a", "name": "Research", "shape": 0, "color": "red", "createdAt": 0
    }))
    .unwrap()
}

fn turn(tokens: u64) -> UsageTotals {
    UsageTotals {
        turns: 1,
        input_tokens: tokens,
        ..Default::default()
    }
}

/// An agent that used `per_day` tokens on each of `days`.
fn used(days: &[(&str, u64)]) -> store::Agent {
    let mut a = agent();
    for (d, n) in days {
        a.usage.record(&turn(*n), day(d));
    }
    a
}

/// A routine every two hours.
fn routine(id: &str) -> schedule::CheckIn {
    let mut c: schedule::CheckIn = serde_json::from_value(serde_json::json!({
        "id": id, "note": "Morning brief", "nextAt": 0, "createdAt": 0
    }))
    .unwrap();
    c.repeat = Some(schedule::Repeat::Every { minutes: 120 });
    c
}

const ROUTINE: Work = Work::Scheduled {
    repeats: true,
    manual: false,
};

#[test]
fn off_by_default_and_old_entries_load() {
    // A registry entry from before the cap: no field, no cap, nothing stopped.
    let a = used(&[("2026-11-19", 50_000_000)]);
    assert_eq!(a.routine_cap, None);
    for work in [ROUTINE, Work::When { manual: false }, Work::UserMessage] {
        assert!(!stops(&a, work, day("2026-11-19")), "{work:?}");
    }
    assert_eq!(status(&a, day("2026-11-19")), None);
    // Nothing is written for an agent without one.
    assert!(!serde_json::to_string(&a).unwrap().contains("routineCap"));
    // And one with a cap reads back as it was written.
    let mut capped = agent();
    set(&mut capped, Some(2_000_000));
    let json = serde_json::to_value(&capped).unwrap();
    assert_eq!(json["routineCap"]["tokens"], 2_000_000);
    let back: store::Agent = serde_json::from_value(json).unwrap();
    assert_eq!(back.routine_cap, capped.routine_cap);
}

#[test]
fn reached_cap_stops_routines_but_never_the_users_own_messages() {
    let today = day("2026-11-19");
    let mut a = used(&[("2026-11-17", 1_500_000), ("2026-11-19", 600_000)]);
    set(&mut a, Some(2_000_000));
    assert_eq!(week_tokens(&a.usage, today), 2_100_000);
    // Unattended work stops.
    assert!(stops(&a, ROUTINE, today));
    assert!(stops(&a, Work::When { manual: false }, today));
    // The user's own message, Run now, Check now and a one-time reminder run.
    assert!(!stops(&a, Work::UserMessage, today));
    for work in [
        Work::Scheduled {
            repeats: true,
            manual: true,
        },
        Work::Scheduled {
            repeats: false,
            manual: false,
        },
        Work::When { manual: true },
    ] {
        assert!(!stops(&a, work, today), "{work:?}");
    }
    // Under the cap, nothing stops.
    set(&mut a, Some(3_000_000));
    assert!(!stops(&a, ROUTINE, today));
    // Exactly at the cap is reached.
    set(&mut a, Some(2_100_000));
    assert!(stops(&a, ROUTINE, today));
}

#[test]
fn it_lifts_as_older_days_leave_the_week() {
    let today = day("2026-11-19");
    let a = used(&[
        ("2026-11-14", 1_000_000),
        ("2026-11-17", 1_500_000),
        ("2026-11-19", 600_000),
    ]);
    // 3.1M this week; with a 2M cap it is under once the 14th and 17th have
    // left: the 17th leaves the week on the 24th (the 18th..24th).
    assert_eq!(
        lifts_on(2_000_000, &a.usage, today),
        Some(day("2026-11-24"))
    );
    // With a 3M cap, the 14th leaving (on the 21st) is enough.
    assert_eq!(
        lifts_on(3_000_000, &a.usage, today),
        Some(day("2026-11-21"))
    );
    // And on that day the stored week says so, without a write.
    let mut capped = a.clone();
    set(&mut capped, Some(3_000_000));
    assert!(stops(&capped, ROUTINE, today));
    assert!(!stops(&capped, ROUTINE, day("2026-11-21")));
    let s = status(&capped, today).unwrap();
    assert!(s.reached);
    assert_eq!(s.used, 3_100_000);
    assert_eq!(s.lifts_on.as_deref(), Some("2026-11-21"));
}

#[test]
fn said_once_when_reached_and_once_when_back_under() {
    let today = day("2026-11-19");
    let mut a = used(&[("2026-11-19", 2_500_000)]);
    a.check_ins.push(routine("r"));
    set(&mut a, Some(2_000_000));
    let Some(Change::Reached { line }) = settle(&mut a, today, 10) else {
        panic!("not said");
    };
    assert!(line.contains("2.5M tokens this week"), "{line}");
    assert!(line.contains("cap of 2M"), "{line}");
    assert!(line.contains("Your own messages to it still run"), "{line}");
    assert!(line.contains("raise or clear the cap"), "{line}");
    assert_eq!(a.routine_cap.as_ref().unwrap().reached_at, Some(10));
    // Not again while it stays reached, nor when the cap moves but holds.
    assert_eq!(settle(&mut a, today, 20), None);
    set(&mut a, Some(2_400_000));
    assert_eq!(settle(&mut a, today, 30), None);
    // Raising it past the week is back under: said once.
    set(&mut a, Some(5_000_000));
    let Some(Change::Back { line }) = settle(&mut a, today, 40) else {
        panic!("not said");
    };
    assert!(line.contains("run again"), "{line}");
    assert_eq!(a.routine_cap.as_ref().unwrap().reached_at, None);
    assert_eq!(settle(&mut a, today, 50), None);
}

#[test]
fn no_line_for_an_agent_with_nothing_unattended() {
    let mut a = used(&[("2026-11-19", 2_500_000)]);
    set(&mut a, Some(1_000));
    assert_eq!(settle(&mut a, day("2026-11-19"), 1), None);
    // A paused routine doesn't count either.
    let mut r = routine("r");
    r.paused = true;
    a.check_ins.push(r);
    assert_eq!(settle(&mut a, day("2026-11-19"), 1), None);
}

#[test]
fn the_week_refilling_lifts_it_with_a_line() {
    // Reached on the 19th; by the 26th every day it had has left the week.
    let mut a = used(&[("2026-11-19", 2_500_000)]);
    a.check_ins.push(routine("r"));
    set(&mut a, Some(2_000_000));
    assert!(matches!(
        settle(&mut a, day("2026-11-19"), 1),
        Some(Change::Reached { .. })
    ));
    assert_eq!(settle(&mut a, day("2026-11-25"), 2), None);
    assert!(matches!(
        settle(&mut a, day("2026-11-26"), 3),
        Some(Change::Back { .. })
    ));
    assert!(!stops(&a, ROUTINE, day("2026-11-26")));
}

#[test]
fn words_and_numbers() {
    assert_eq!(parse("2M"), Ok(Some(2_000_000)));
    assert_eq!(parse("1.5m tokens"), Ok(Some(1_500_000)));
    assert_eq!(parse("500k"), Ok(Some(500_000)));
    assert_eq!(parse("2,000,000"), Ok(Some(2_000_000)));
    assert_eq!(parse("off"), Ok(None));
    assert_eq!(parse("0"), Ok(None));
    assert!(parse("20%").is_err());
    assert!(parse("lots").is_err());
    assert!(parse("99999b").is_err());
    assert_eq!(checked(0), Ok(None));
    assert_eq!(tokens_short(2_000_000), "2M");
    assert_eq!(tokens_short(2_500_000), "2.5M");
    assert_eq!(tokens_short(300_400), "300k");
    assert_eq!(tokens_short(900), "900");
    let today = day("2026-11-19"); // a Thursday
    assert_eq!(day_words(day("2026-11-20"), today), "tomorrow");
    assert_eq!(day_words(day("2026-11-24"), today), "on Tue");
    assert_eq!(day_words(day("2026-11-26"), today), "on Nov 26");
    // Raising or clearing gives routines more room; setting or lowering doesn't.
    let cap = RoutineCap {
        tokens: 1_000,
        reached_at: None,
    };
    assert!(loosens(Some(&cap), None));
    assert!(loosens(Some(&cap), Some(2_000)));
    assert!(!loosens(Some(&cap), Some(500)));
    assert!(!loosens(None, Some(500)));
    assert!(!loosens(None, None));
}

/// The tick's path, on a scratch registry: a routine due past the cap moves
/// on to its next time with a "Skipped" row saying why; Run now still runs.
#[test]
fn a_due_routine_past_the_cap_is_skipped_with_its_reason() {
    let _serial = store::tests_lock();
    let dir = tempfile::tempdir().unwrap();
    store::set_root_for_tests(Some(dir.path().to_path_buf()));
    let made = store::create(store::NewAgent {
        name: "Research".into(),
        role: String::new(),
        instructions: String::new(),
        shape: None,
        color: None,
        is_main: false,
    })
    .unwrap();
    let now = store::now_ms();
    let tz = chrono::Local;
    let c = schedule::create_in(&tz, &made.id, "every 2 hours", "Check the inbox", now)
        .unwrap()
        .check_in;
    let today = crate::agents::usage::today();
    store::update(&made.id, |a| {
        a.usage.record(&turn(3_000_000), today);
        set(a, Some(2_000_000));
        if let Some(x) = a.check_ins.iter_mut().find(|x| x.id == c.id) {
            x.next_at = now - 60_000;
        }
    })
    .unwrap();
    let agents = store::list().unwrap();
    let firing = schedule::plan(&tz, &agents, now).fire.expect("due");
    // Run now isn't stopped.
    let mut manual = firing.clone();
    manual.manual = true;
    assert!(!schedule::skip_over_cap(&agents, &manual, today));
    // Its own time is.
    assert!(schedule::skip_over_cap(&agents, &firing, today));
    let after = store::get(&made.id).unwrap();
    let x = after.check_ins.iter().find(|x| x.id == c.id).unwrap();
    assert!(x.next_at > now, "moved on to its next time");
    let row = x.runs.last().expect("a row");
    assert_eq!(row.outcome, crate::agents::runs::Outcome::Skipped);
    assert_eq!(
        row.detail.as_deref(),
        Some("Skipped: past its routines cap (3M of 2M tokens this week).")
    );
    // Nothing is due now: it waits for its next time.
    assert!(schedule::plan(&tz, &store::list().unwrap(), now)
        .fire
        .is_none());
    // Cleared, the same routine would run.
    store::update(&made.id, |a| set(a, None)).unwrap();
    let agents = store::list().unwrap();
    assert!(!schedule::skip_over_cap(&agents, &firing, today));
    store::set_root_for_tests(None);
}

/// A "When…" routine past the cap gets one "Skipped" row per time the cap
/// is reached, not one a minute.
#[test]
fn a_when_routine_gets_one_skipped_row_per_reach() {
    use crate::agents::runs::{Outcome, Run};
    let row = |at: i64, outcome: Outcome| Run {
        at,
        outcome,
        attempt: 1,
        detail: None,
        retry_at: None,
        sign_in: Vec::new(),
        manual: false,
        step: 0,
    };
    assert!(crate::agents::watch::capped_row_due(&[], 100));
    assert!(crate::agents::watch::capped_row_due(
        &[row(50, Outcome::Skipped), row(120, Outcome::Ran)],
        100
    ));
    assert!(!crate::agents::watch::capped_row_due(
        &[row(150, Outcome::Skipped)],
        100
    ));
}
