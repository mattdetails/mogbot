use super::*;
use serde_json::json;

fn args() -> Value {
    json!({
        "goal": "Get the pipeline to 20 qualified leads",
        "criteria": [
            { "text": "20 leads with a call booked", "target": 20, "unit": "leads" },
            { "text": "Each has a company and an owner" },
            { "text": "Inbox under 20", "kind": "reduce", "target": 20, "start": 220 }
        ],
        "shares": [ { "engine": "claude", "percent": 30 }, { "engine": "opencode", "hours": 24 } ],
        "end_date": "2026-11-30",
        "asks_first": ["Never email a client"],
        "updates": { "daily_at": "18:00", "each_milestone": true }
    })
}

#[test]
fn a_mission_starts_from_the_tools_arguments() {
    let m = from_args(&args(), 5).unwrap();
    assert_eq!(m.criteria.len(), 3);
    assert_eq!(m.criteria[0].kind, CriterionKind::Count);
    assert_eq!(m.criteria[1].kind, CriterionKind::Check);
    assert_eq!(m.criteria[2].kind, CriterionKind::Reduce);
    assert_eq!(m.criteria[2].start, Some(220.0));
    assert_eq!(m.shares[0].pct, 30.0);
    assert_eq!(m.shares[1].kind, ShareKind::Time);
    assert_eq!(m.shares[1].cap_ms, Some(24 * 3_600_000));
    assert!(m.end_at.is_some());
    assert_eq!(m.updates.daily_at, Some(18 * 60));
    assert!(
        m.updates.when_blocked,
        "blocked updates are on unless said otherwise"
    );
    assert_eq!(m.state, State::Starting);
}

#[test]
fn a_thin_agreement_is_refused_with_what_is_missing() {
    let mut a = args();
    a["criteria"] = json!([{ "text": "only one" }]);
    assert!(from_args(&a, 0).unwrap_err().contains("two to five"));
    let mut a = args();
    a["shares"] = json!([{ "engine": "claude" }]);
    assert!(from_args(&a, 0).unwrap_err().contains("percent"));
    let mut a = args();
    a["goal"] = json!(" ");
    assert!(from_args(&a, 0).is_err());
}

#[test]
fn progress_sets_the_number_and_the_status_follows_it() {
    let m = from_args(&args(), 0).unwrap();
    let m = progress(
        &m,
        &json!({ "criterion": "c1", "value": 11, "source": "Native OS · read 11:02 pm" }),
    )
    .unwrap();
    assert_eq!(m.criteria[0].status, Status::InProgress);
    assert_eq!(
        m.state,
        State::Running,
        "the first progress takes it out of starting"
    );
    assert_eq!(
        m.criteria[0].source.as_deref(),
        Some("Native OS · read 11:02 pm")
    );
    let m = progress(&m, &json!({ "criterion": "c1", "value": 20 }), 0).unwrap();
    assert_eq!(m.criteria[0].status, Status::Met);
    assert!(progress(&m, &json!({ "criterion": "nope" }), 0).is_err());
}

#[test]
fn verdicts_name_the_engine_that_checked() {
    let (by, v) = verdicts_from(&json!({
        "checked_by": "codex",
        "verdicts": [ { "criterion": "c1", "result": "met" }, { "criterion": "c2", "result": "couldnt_check", "evidence": "No access to Mail" } ]
    })).unwrap();
    assert_eq!(by, Engine::Codex);
    assert_eq!(v[1].result, Met::CouldntCheck);
    assert!(verdicts_from(&json!({ "verdicts": [] })).is_err());
    assert!(verdicts_from(&json!({ "checked_by": "codex", "verdicts": [] })).is_err());
}

#[test]
fn the_pause_card_offers_more_the_other_engine_and_a_stop() {
    let mut m = from_args(&args(), 0).unwrap();
    m.shares.insert(1, Share::usage(Engine::Codex, 50.0));
    m.state = State::PausedCap;
    m.paused_by = Some(Engine::Claude);
    let text = pause_text(&m, Some(Engine::Claude));
    let blocks = pause_blocks(&m, &text).unwrap().to_string();
    assert!(blocks.contains("Add 10% of Claude Code"));
    assert!(blocks.contains("Finish with Codex"));
    assert!(blocks.contains("Stop here"));
    assert!(blocks.contains(&format!("mission {}", m.id)));
}

#[test]
fn clocks_and_dates_parse_or_are_ignored() {
    assert_eq!(clock("17:30"), Some(17 * 60 + 30));
    assert_eq!(clock("25:00"), None);
    assert!(end_of("2026-11-30").is_some());
    assert!(end_of("tomorrow").is_none());
}

#[test]
fn the_users_calls_are_refused_without_the_user() {
    for a in ["start", "add_more", "stop", "pause", "resume", "accept"] {
        let e = act(a, &json!({}), false, 0).unwrap_err();
        assert!(e.contains("the user's call"), "{a}");
    }
    // Reading and reporting need no one.
    assert!(act("list", &json!({}), false, 0).is_ok());
}

#[test]
fn a_blocked_mission_can_name_the_app_to_reconnect() {
    let m = from_args(&args(), 0).unwrap();
    let m = mark_blocked(
        &m,
        &json!({ "what": "Cant read Native OS", "app": "Native OS" }),
    )
    .unwrap();
    assert_eq!(
        m.blocked.as_ref().unwrap().app.as_deref(),
        Some("Native OS")
    );
}

#[test]
fn sleep_is_said_in_hours_or_minutes() {
    assert_eq!(sleep_phrase(40 * 60_000), "40 minutes");
    assert_eq!(sleep_phrase(70 * 60_000), "an hour");
    assert_eq!(sleep_phrase(8 * 3_600_000), "8 hours");
}
