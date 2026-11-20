use super::*;

const H: i64 = 3_600_000;

fn task(title: &str, from: Option<&str>, created: i64) -> Task {
    new_task(
        title.to_string(),
        if from.is_some() {
            Source::Agent
        } else {
            Source::User
        },
        from.map(|n| AgentRef {
            id: n.to_lowercase(),
            name: n.to_string(),
        }),
        created,
    )
}

fn load(name: &str, role: &str, open: Vec<Task>, now: i64) -> Load {
    let why = overload(&open, now);
    Load {
        agent_id: name.to_lowercase(),
        name: name.into(),
        role: role.into(),
        doing: None,
        stuck: open.iter().filter(|t| t.state == State::Stuck).count(),
        overloaded: why.is_some(),
        overloaded_why: why,
        open,
        recent: vec![],
    }
}

#[test]
fn a_title_is_the_first_sentence_on_one_line() {
    assert_eq!(
        title_of("Update the Apollo budget sheet. Then ping Cade.\nMore."),
        "Update the Apollo budget sheet."
    );
    assert!(title_of(&"x".repeat(400)).chars().count() <= TITLE_CHARS);
    assert_eq!(title_of("  \n  "), "");
}

#[test]
fn the_same_ask_in_other_words_is_alike_and_a_different_one_isnt() {
    assert!(
        likeness(
            "Update Apollo budget sheet for November",
            "please update the Apollo budget sheet"
        ) >= SAME
    );
    assert!(
        likeness(
            "Update Apollo budget sheet",
            "Draft the Fisher Farms launch email"
        ) < 0.2
    );
    assert_eq!(likeness("ok", "ok"), 0.0);
}

#[test]
fn overload_is_a_plain_rule() {
    let now = 100 * H;
    let few: Vec<Task> = (0..2)
        .map(|i| task(&format!("job {i}"), None, now - H))
        .collect();
    assert!(overload(&few, now).is_none());
    let many: Vec<Task> = (0..OVERLOAD_OPEN)
        .map(|i| task(&format!("job {i}"), None, now - H))
        .collect();
    assert!(overload(&many, now).unwrap().contains("10 to do"));
    // One line open over a day with no movement is enough.
    let stale = vec![task("old one", None, now - 30 * H)];
    assert!(overload(&stale, now).unwrap().contains("no movement"));
    // A line that waits on the user is theirs to move.
    let mut waiting = task("waits", None, now - 30 * H);
    waiting.state = State::Waiting;
    assert!(overload(&[waiting], now).is_none());
}

#[test]
fn ages_read_plainly() {
    assert_eq!(age(10 * 60_000), "10m");
    assert_eq!(age(5 * H), "5h");
    assert_eq!(age(72 * H), "3d");
}

#[test]
fn a_nudge_waits_then_stops_after_its_limit() {
    let mut t = task("Send the invoice", Some("Chief of Staff"), 0);
    assert!(!due_chase(&t, CHASE_AFTER_MS - 1));
    assert!(due_chase(&t, CHASE_AFTER_MS));
    t.chased = 1;
    t.last_chased_at = CHASE_AFTER_MS;
    // Chased at most once a day.
    assert!(!due_chase(&t, 2 * CHASE_AFTER_MS));
    assert!(due_chase(&t, CHASE_AFTER_MS + CHASE_AGAIN_MS));
    t.chased = MAX_CHASES;
    assert!(!due_chase(&t, 10 * CHASE_AFTER_MS));
    assert!(out_of_nudges(&t, t.last_chased_at + CHASE_AGAIN_MS));
    t.state = State::Waiting;
    assert!(!due_chase(&t, 100 * H));
}

#[test]
fn the_users_own_asks_wait_longer() {
    let t = task("Follow up with Wade", None, 0);
    assert!(!due_chase(&t, CHASE_AFTER_MS));
    assert!(due_chase(&t, CHASE_USER_AFTER_MS));
}

#[test]
fn the_board_names_jobs_load_and_whos_free() {
    let now = 50 * H;
    let busy = load(
        "Apollo PM",
        "Runs the Apollo project plan",
        (0..10)
            .map(|i| task(&format!("task {i} apollo"), Some("Chief"), now - 5 * H))
            .collect(),
        now,
    );
    let light = load(
        "Apollo Finances",
        "Keeps Apollo's budget",
        vec![task("Reconcile October", None, now - H)],
        now,
    );
    let free = load("Voice", "Writes as the user", vec![], now);
    let text = board(&[busy, light, free], now).unwrap();
    assert!(text.contains("Apollo PM (Runs the Apollo project plan): 10 open"));
    assert!(text.contains("OVERLOADED"));
    assert!(text.contains("Apollo Finances (Keeps Apollo's budget): 1 open"));
    assert!(text.contains("Nothing open: Voice."));
    assert!(text.chars().count() <= BOARD_CAP + 300);
}

#[test]
fn one_line_is_doing_at_a_time_and_a_drop_needs_a_reason() {
    let a = task("one", None, 0);
    let b = task("two", None, 0);
    let mut tasks = vec![a, b];
    tasks[0].state = State::Doing;
    // The pure part of `set`: promoting another demotes the first.
    for other in tasks.iter_mut().filter(|t| t.state == State::Doing) {
        other.state = State::Next;
    }
    tasks[1].state = State::Doing;
    assert_eq!(tasks.iter().filter(|t| t.state == State::Doing).count(), 1);
}

#[test]
fn tasks_are_kept_one_json_line_each() {
    let t = task("A line", Some("Chief"), 5);
    let line = serde_json::to_string(&t).unwrap();
    assert!(!line.contains('\n'));
    let back: Task = serde_json::from_str(&line).unwrap();
    assert_eq!(back, t);
    assert!(line.contains("\"state\":\"next\""));
}

#[test]
fn an_empty_board_says_nothing() {
    assert!(board(&[load("Voice", "x", vec![], 0)], 0).is_none());
}

#[test]
fn an_agents_own_list_is_in_its_briefing_and_bounded() {
    assert!(own_section(&[], 0).is_none());
    let many: Vec<Task> = (0..40)
        .map(|i| {
            task(
                &format!("an ask number {i} with some words in it"),
                Some("Chief"),
                0,
            )
        })
        .collect();
    let s = own_section(&many, 3 * H).unwrap();
    assert!(s.contains("from Chief"));
    assert!(s.contains("3h ago"));
    assert!(s.chars().count() <= OWN_CAP + 120);
    assert!(s.contains("…more"));
}

#[test]
fn finished_tasks_age_out_and_the_list_is_bounded() {
    let now = 10 * 24 * H;
    let mut old = task("old", None, 0);
    old.state = State::Done;
    old.updated_at = 0;
    let mut tasks = vec![old, task("open one", None, 0)];
    prune(&mut tasks, now);
    assert_eq!(tasks.len(), 1);
    let mut lots: Vec<Task> = (0..KEEP + 10)
        .map(|i| {
            let mut t = task(&format!("t{i}"), None, now);
            t.state = State::Done;
            t.updated_at = now - i as i64;
            t
        })
        .collect();
    prune(&mut lots, now);
    assert_eq!(lots.len(), KEEP);
}

#[test]
fn an_assignment_is_refused_for_yourself_outside_text_a_long_chain_and_a_full_list() {
    let ok = |outside, hop, n| check_assign("mail", "lead", "Lead Gen", outside, hop, n);
    assert!(ok(false, true, 0).is_ok());
    assert!(ok(false, true, MAX_ASSIGNED - 1).is_ok());
    assert!(ok(true, true, 0).unwrap_err().contains("outside"));
    assert!(ok(false, false, 0).unwrap_err().contains("too long"));
    assert!(ok(false, true, MAX_ASSIGNED)
        .unwrap_err()
        .contains("Lead Gen"));
    assert!(check_assign("a", "a", "A", false, true, 0)
        .unwrap_err()
        .contains("task_add"));
}

#[test]
fn the_assignees_chat_gets_one_centred_line_naming_who_and_what() {
    assert_eq!(
        assigned_line("Mail", "Lead Gen", "Chase the Globex invoice. Then log it."),
        "Mail added a task for Lead Gen · Chase the Globex invoice."
    );
}

#[test]
fn handing_back_reaches_the_assigner_only_for_a_teammates_line() {
    let theirs = task("Chase the Globex invoice", Some("Mail"), 0);
    let body = hand_back_body(&theirs, "dropped", "Globex isn't a client of ours.").unwrap();
    assert!(body.starts_with("Handed back: \"Chase the Globex invoice\" — dropped."));
    assert!(body.ends_with("Globex isn't a client of ours."));
    assert!(hand_back_body(&theirs, "waiting", "needs the PO number")
        .unwrap()
        .contains("waiting on the user"));
    // Done, doing and next aren't a hand-back, and the user's own lines have no assigner.
    for s in ["done", "doing", "next"] {
        assert!(hand_back_body(&theirs, s, "x").is_none());
    }
    assert!(hand_back_body(&task("mine", None, 0), "dropped", "x").is_none());
}

#[test]
fn the_header_line_counts_once_and_hides_when_there_is_nothing() {
    assert!(counts(&[], None).is_none());
    let mut doing = task("Drafting intros", None, 0);
    doing.state = State::Doing;
    let mut waits = task("Pick a date", None, 0);
    waits.state = State::Waiting;
    let mut stuck = task("Chase", Some("Mail"), 0);
    stuck.state = State::Stuck;
    let open = vec![
        doing,
        task("a", None, 0),
        task("b", Some("Mail"), 0),
        stuck,
        waits,
    ];
    let c = counts(&open, None).unwrap();
    assert_eq!(
        c,
        Counts {
            doing: Some("Drafting intros".into()),
            to_do: 3,
            waits: 1
        }
    );
    // A running turn's own status wins as the words.
    assert_eq!(
        counts(&open, Some("Reading the inbox"))
            .unwrap()
            .doing
            .as_deref(),
        Some("Reading the inbox")
    );
    // Working with nothing on the list still shows what it is doing.
    let idle = counts(&[], Some("Reading the inbox")).unwrap();
    assert_eq!((idle.to_do, idle.waits), (0, 0));
    // Serialised as the clients read it.
    let v = serde_json::to_value(&c).unwrap();
    assert_eq!(v["toDo"], 3);
    assert_eq!(v["waits"], 1);
}

#[test]
fn the_assign_tool_is_listed_with_its_schema_and_the_prompt_names_it() {
    let schema = assign_schema();
    let required = schema["required"].as_array().unwrap();
    assert!(required.contains(&serde_json::json!("agent")));
    assert!(required.contains(&serde_json::json!("title")));
    assert!(ASSIGN_DESCRIPTION.contains("aren't woken"));
}
