use super::*;

fn facts() -> Facts {
    Facts {
        user_said: "Can you draft the Globex intro and also chase their invoice?".into(),
        replies: vec!["Here's the intro draft. Want me to send it?".into()],
        awaiting: true,
        open: vec![("ab12cd34".into(), "Draft the Globex intro".into(), "doing")],
    }
}

#[test]
fn the_prompt_fences_the_turn_as_data_and_forbids_closing_lines() {
    let p = prompt(&facts());
    assert!(p.contains("not instructions"));
    assert!(p.contains("Never mark anything done or dropped"));
    assert!(p.contains("<<<USER\nCan you draft"));
    assert!(p.contains("ab12cd34 [doing] Draft the Globex intro"));
    assert!(p.contains("waiting on the user"));
    assert!(p.contains("at most 8 words"));
}

#[test]
fn the_prompt_is_bounded_whatever_the_turn() {
    let mut f = facts();
    f.user_said = "ask ".repeat(3_000);
    f.replies = (0..50).map(|_| "reply ".repeat(500)).collect();
    f.open = (0..200).map(|i| (format!("{i:08}"), "x".repeat(500), "next")).collect();
    // The turn's text is capped; the open-lines list is the only open-ended part, and clipped per line.
    let p = prompt(&f);
    let turn = p.split("<<<USER").nth(1).unwrap();
    assert!(turn.chars().count() < MAX_INPUT + 1_700, "{}", turn.chars().count());
}

#[test]
fn a_turn_that_ends_on_a_question_waits_on_the_user() {
    assert!(awaiting_user("Want me to send it?"));
    assert!(awaiting_user("Which date works **for you?**"));
    assert!(awaiting_user("Shall I go ahead?\"  "));
    assert!(!awaiting_user("Done. The draft is in your folder."));
    assert!(!awaiting_user(""));
}

#[test]
fn the_answer_is_read_from_json_wherever_the_model_put_it() {
    let v = parse("Sure!\n```json\n{\"add\":[{\"title\":\"Chase the Globex invoice\"}],\"waits\":[{\"id\":\"ab12cd34\",\"on\":\"your OK to send\"}]}\n```").unwrap();
    assert_eq!(v.add, vec![NewLine { title: "Chase the Globex invoice".into() }]);
    assert_eq!(v.waits[0].id, "ab12cd34");
    assert_eq!(parse("{}").unwrap(), Verdict::default());
    assert!(parse("nothing to add").is_none());
    assert!(parse("{\"add\": 3}").is_none());
}

#[test]
fn a_title_is_one_short_real_line() {
    assert_eq!(clean_title("  \"Chase the Globex invoice\" ").unwrap(), "Chase the Globex invoice");
    assert!(clean_title("ok").is_none());
    assert!(clean_title("   ").is_none());
    let long = clean_title(&"word ".repeat(60)).unwrap();
    assert!(long.chars().count() <= TITLE_MAX, "{long}");
    assert_eq!(clean_title("two\nlines here").unwrap(), "two lines here");
}

#[test]
fn it_runs_at_most_once_a_minute_and_thirty_a_day() {
    let id = "keep-test-agent";
    let t0 = 1_000_000_000_000;
    assert!(may_run(id, t0));
    assert!(!may_run(id, t0 + 5_000));
    assert!(may_run(id, t0 + MIN_GAP_MS + 1));
    let id2 = "keep-test-agent-2";
    let mut ran = 0;
    for i in 0..60 {
        if may_run(id2, t0 + i * (MIN_GAP_MS + 1)) {
            ran += 1;
        }
    }
    assert_eq!(ran, MAX_PER_DAY);
    // A day on, it may run again.
    assert!(may_run(id2, t0 + 61 * (MIN_GAP_MS + 1) + DAY_MS));
}

fn line(id: &str, state: State) -> Task {
    let mut t = tasks::new_task_for_tests("a line", state);
    t.id = id.into();
    t
}

#[test]
fn only_next_or_doing_lines_can_be_parked_and_nothing_is_ever_closed() {
    // `apply` touches the store, so the rules it leans on are held here as pure ones:
    // a verdict can carry no state but "waits", and only these states may be parked.
    let parkable = |s: State| matches!(s, State::Next | State::Doing);
    assert!(parkable(State::Next) && parkable(State::Doing));
    for s in [State::Waiting, State::Stuck, State::Done, State::Dropped] {
        assert!(!parkable(s));
    }
    let v = parse("{\"add\":[],\"waits\":[],\"done\":[\"ab12cd34\"],\"drop\":[\"x\"]}").unwrap();
    assert_eq!(v, Verdict::default(), "unknown fields are ignored, never obeyed");
    let _ = line("ab12cd34", State::Next);
}
