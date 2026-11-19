use super::*;

const H: i64 = 3_600_000;

fn crit(id: &str, kind: CriterionKind, target: Option<f64>, value: Option<f64>) -> Criterion {
    Criterion {
        id: id.into(),
        text: id.into(),
        kind,
        target,
        start: None,
        value,
        unit: None,
        status: Status::InProgress,
        source: None,
        note: None,
    }
}

fn mission(shares: Vec<Share>) -> Mission {
    let mut m = Mission::new(
        "Get the pipeline to 20 qualified leads",
        vec![
            crit("leads", CriterionKind::Count, Some(20.0), Some(11.0)),
            crit("owner", CriterionKind::Check, None, None),
        ],
        shares,
        0,
    );
    m.state = State::Running;
    m
}

fn read(pct: f64, at: i64) -> Reading {
    Reading {
        used_percent: pct,
        resets_at: Some(10_000 * H),
        observed_at: at,
    }
}

#[test]
fn the_first_reading_is_a_baseline_and_later_ones_add_the_rise() {
    let s = Share::usage(Engine::Claude, 30.0);
    assert!(s.unread());
    let s = observe(&s, read(40.0, 1));
    assert_eq!(s.used_pct, 0.0, "the baseline spends nothing");
    assert!(!s.unread());
    let s = observe(&s, read(46.0, 2));
    let s = observe(&s, read(51.0, 3));
    assert_eq!(s.used_pct, 11.0);
    assert!(!s.over());
}

#[test]
fn a_refill_carries_what_was_spent_and_counts_the_new_reading() {
    let s = observe(&Share::usage(Engine::Claude, 30.0), read(90.0, 1));
    let s = observe(&s, read(95.0, 2));
    // The window refilled: it now reads 8 from a new reset time.
    let refilled = Reading {
        used_percent: 8.0,
        resets_at: Some(20_000 * H),
        observed_at: 3,
    };
    let s = observe(&s, refilled);
    assert_eq!(s.used_pct, 5.0 + 8.0);
    // A reading that only fell (no new reset time) is treated the same way.
    let s2 = observe(
        &observe(&Share::usage(Engine::Codex, 30.0), read(50.0, 1)),
        read(3.0, 2),
    );
    assert_eq!(s2.used_pct, 3.0);
}

#[test]
fn time_shares_ignore_readings() {
    let s = Share::time(Engine::OpenCode, 24 * H);
    assert_eq!(observe(&s, read(99.0, 1)), s);
    assert!(!s.unread());
    assert!(!s.over());
    let mut spent = s.clone();
    spent.spent_ms = 24 * H;
    assert!(spent.over());
}

#[test]
fn a_running_mission_pauses_at_its_share_and_says_which_engine() {
    let m = mission(vec![
        Share::usage(Engine::Claude, 30.0),
        Share::usage(Engine::Codex, 50.0),
    ]);
    let (m, c) = tick(
        &m,
        &[
            (Engine::Claude, read(10.0, 1)),
            (Engine::Codex, read(20.0, 1)),
        ],
        H,
    );
    assert_eq!(c, Change::None);
    assert_eq!(m.state, State::Running);
    // Claude rises 31 points: a little over the 30, since the step finished first.
    let (m, c) = tick(
        &m,
        &[
            (Engine::Claude, read(41.0, 2)),
            (Engine::Codex, read(25.0, 2)),
        ],
        2 * H,
    );
    assert_eq!(c, Change::PausedAtCap(Some(Engine::Claude)));
    assert_eq!(m.state, State::PausedCap);
    assert_eq!(m.paused_by, Some(Engine::Claude));
    assert_eq!(m.shares[0].used_pct, 31.0);
}

#[test]
fn a_paused_or_finished_mission_keeps_its_numbers_but_never_pauses_again() {
    let mut m = mission(vec![Share::usage(Engine::Claude, 30.0)]);
    m.state = State::Ready;
    let (m, c) = tick(&m, &[(Engine::Claude, read(5.0, 1))], H);
    assert_eq!(c, Change::None);
    assert_eq!(m.state, State::Ready);
    assert!(m.shares[0].read_at.is_some());
}

#[test]
fn a_time_cap_and_an_end_date_pause_too() {
    let mut m = mission(vec![Share::time(Engine::OpenCode, 5 * H)]);
    m.shares[0].spent_ms = 5 * H;
    let (m1, c) = tick(&m, &[], 6 * H);
    assert_eq!(c, Change::PausedAtCap(Some(Engine::OpenCode)));
    assert_eq!(m1.state, State::PausedCap);
    let mut m = mission(vec![Share::usage(Engine::Claude, 30.0)]);
    m.end_at = Some(2 * H);
    let (m2, c) = tick(&m, &[], 3 * H);
    assert_eq!(c, Change::PausedAtCap(None));
    assert_eq!(m2.paused_by, None);
}

#[test]
fn a_time_cap_counts_awake_time_not_the_nights_a_mac_slept() {
    let mut m = mission(vec![Share::time(Engine::OpenCode, 24 * H)]);
    m.heartbeat_at = Some(0);
    // A normal minute is charged.
    let (m, slept) = beat(&m, 60_000);
    assert_eq!(m.shares[0].spent_ms, 60_000);
    assert_eq!(slept, None);
    // Eight hours asleep: charged one awake step, and said.
    let (m, slept) = beat(&m, 60_000 + 8 * H);
    assert_eq!(m.shares[0].spent_ms, 60_000 + AWAKE_STEP_MS);
    assert_eq!(slept, Some((60_000, 60_000 + 8 * H)));
    assert_eq!(m.heartbeat_at, Some(60_000 + 8 * H));
    // A paused mission isn't charged or stamped.
    let mut p = m.clone();
    p.state = State::Paused;
    let (p2, none) = beat(&p, 90 * H);
    assert_eq!(p2, p);
    assert_eq!(none, None);
}

#[test]
fn adding_more_carries_on_only_when_no_share_is_still_over() {
    let mut m = mission(vec![
        Share::usage(Engine::Claude, 30.0),
        Share::usage(Engine::Codex, 10.0),
    ]);
    m.shares[0].used_pct = 31.0;
    m.shares[1].used_pct = 12.0;
    m.state = State::PausedCap;
    let m = add_more(&m, Engine::Claude, 10.0);
    assert_eq!(m.shares[0].pct, 40.0);
    assert_eq!(m.state, State::PausedCap, "Codex is still over");
    let m = add_more(&m, Engine::Codex, 10.0);
    assert_eq!(m.state, State::Running);
    assert_eq!(m.paused_by, None);
}

#[test]
fn the_pause_says_about_and_where_it_got_to() {
    let m = mission(vec![Share::usage(Engine::Claude, 30.0)]);
    let t = pause_text(&m, Some(Engine::Claude));
    assert!(t.contains("about all of Claude Code's 30%"));
    assert!(t.contains("0 of 2 criteria met"));
    assert!(t.ends_with("Add more or stop?"));
    assert!(pause_text(&m, None).contains("end date"));
}

#[test]
fn a_criterion_is_met_by_its_own_number_in_either_direction() {
    assert!(crit("a", CriterionKind::Count, Some(20.0), Some(20.0)).is_met());
    assert!(!crit("a", CriterionKind::Count, Some(20.0), Some(19.0)).is_met());
    // A goal that goes DOWN: inbox under 20.
    assert!(crit("b", CriterionKind::Reduce, Some(20.0), Some(15.0)).is_met());
    assert!(!crit("b", CriterionKind::Reduce, Some(20.0), Some(142.0)).is_met());
    let mut holding = crit("c", CriterionKind::Check, None, None);
    assert!(!holding.is_met());
    holding.status = Status::Holding;
    assert!(holding.is_met());
}

#[test]
fn the_judge_sets_status_and_the_mission_waits_for_the_user() {
    let m = mission(vec![Share::usage(Engine::Claude, 30.0)]);
    let m = judged(
        &m,
        Engine::Codex,
        vec![
            Verdict {
                criterion: "leads".into(),
                result: Met::Met,
                evidence: Some("Native OS shows 20".into()),
            },
            Verdict {
                criterion: "owner".into(),
                result: Met::CouldntCheck,
                evidence: None,
            },
        ],
        9,
    );
    assert_eq!(m.state, State::Ready);
    assert_eq!(m.criteria[0].status, Status::Met);
    assert_eq!(m.criteria[1].status, Status::CouldntCheck);
    assert!(judge_was_independent(&m, &[Engine::Claude]));
    assert!(!judge_was_independent(&m, &[Engine::Codex]));
}

#[test]
fn a_mission_needs_a_goal_two_to_five_criteria_and_a_sane_share() {
    let c = |n| {
        (0..n)
            .map(|i| crit(&format!("c{i}"), CriterionKind::Check, None, None))
            .collect::<Vec<_>>()
    };
    let share = vec![Share::usage(Engine::Claude, 30.0)];
    assert!(check("Goal", &c(3), &share).is_ok());
    assert!(check("  ", &c(3), &share).is_err());
    assert!(check("Goal", &c(1), &share).is_err());
    assert!(check("Goal", &c(6), &share).is_err());
    assert!(check("Goal", &c(3), &[]).is_err());
    assert!(check("Goal", &c(3), &[Share::usage(Engine::Claude, 0.0)]).is_err());
    assert!(check("Goal", &c(3), &[Share::time(Engine::OpenCode, H)]).is_ok());
}

#[test]
fn the_chief_is_told_only_of_open_missions() {
    let done = {
        let mut m = mission(vec![Share::usage(Engine::Claude, 30.0)]);
        m.state = State::Done;
        m
    };
    assert!(briefing(&[done.clone()]).is_none());
    let mut paused = mission(vec![Share::usage(Engine::Claude, 30.0)]);
    paused.state = State::PausedCap;
    let b = briefing(&[done, paused]).unwrap();
    assert!(b.contains("paused at its share, waiting on the user"));
    assert!(b.contains("0 of 2 criteria met"));
}

#[test]
fn events_are_newest_first_and_bounded() {
    let mut m = mission(vec![Share::usage(Engine::Claude, 30.0)]);
    for i in 0..(EVENTS_KEPT + 5) {
        m.push_event("Scout", &format!("step {i}"), i as i64);
    }
    assert_eq!(m.events.len(), EVENTS_KEPT);
    assert_eq!(m.events[0].text, format!("step {}", EVENTS_KEPT + 4));
}

fn counted(value: f64) -> Mission {
    let mut m = mission(vec![Share::usage(Engine::Claude, 30.0)]);
    m.criteria[0].value = Some(value);
    m
}

#[test]
fn a_day_estimate_needs_two_readings_and_fifteen_percent() {
    let day = 24 * H;
    // 4 of 20 (20%), one day in: about five days in all.
    let mut m = counted(4.0);
    m.progress_log = vec![ProgressPoint { at: 1, value: 2.0 }];
    assert_eq!(estimate_days(&m, day), None, "one reading is not enough");
    m.progress_log.push(ProgressPoint { at: 2, value: 4.0 });
    assert_eq!(estimate_days(&m, day), Some(5));
    // Under 15% done: no estimate, never a guess.
    let mut slow = counted(2.0);
    slow.progress_log = m.progress_log.clone();
    assert_eq!(estimate_days(&slow, day), None);
}

#[test]
fn the_estimate_is_never_less_than_the_day_it_is_and_is_fixed_once_made() {
    let day = 24 * H;
    // Nearly done at day 3: the estimate can't say fewer than 3 days.
    let mut m = counted(19.0);
    m.progress_log = vec![
        ProgressPoint { at: 1, value: 10.0 },
        ProgressPoint { at: 2, value: 19.0 },
    ];
    assert_eq!(estimate_days(&m, 2 * day + H), Some(3));
    let fixed = with_estimate(&m, 2 * day + H);
    assert_eq!(fixed.estimated_days, Some(3));
    // A later, slower reading does not move it: running past is said, not hidden.
    let mut later = fixed.clone();
    later.criteria[0].value = Some(19.0);
    assert_eq!(with_estimate(&later, 9 * day).estimated_days, Some(3));
}

#[test]
fn a_goal_that_goes_down_measures_the_distance_covered() {
    let mut m = counted(0.0);
    m.criteria[0].kind = CriterionKind::Reduce;
    m.criteria[0].start = Some(220.0);
    m.criteria[0].target = Some(20.0);
    m.criteria[0].value = Some(120.0);
    assert_eq!(first_progress(&m), Some(0.5));
    m.criteria[0].value = Some(220.0);
    assert_eq!(first_progress(&m), Some(0.0));
}

#[test]
fn readings_log_only_a_changed_number_and_stay_bounded() {
    let mut m = counted(3.0);
    m = log_reading(&m, 1);
    m = log_reading(&m, 2);
    assert_eq!(
        m.progress_log.len(),
        1,
        "the same number is not a new reading"
    );
    for i in 0..100 {
        m.criteria[0].value = Some(i as f64 + 10.0);
        m = log_reading(&m, 10 + i);
    }
    assert!(m.progress_log.len() <= 60);
}
