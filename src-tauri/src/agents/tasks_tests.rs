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
    assert!(overload(&many, now).unwrap().contains("6 asks open"));
    let old: Vec<Task> = (0..3)
        .map(|i| task(&format!("job {i}"), None, now - 30 * H))
        .collect();
    assert!(overload(&old, now).unwrap().contains("oldest 30h"));
    let two_old: Vec<Task> = (0..2)
        .map(|i| task(&format!("job {i}"), None, now - 30 * H))
        .collect();
    assert!(overload(&two_old, now).is_none());
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
    assert!(!due_chase(&t, CHASE_AFTER_MS + 1));
    assert!(due_chase(&t, 2 * CHASE_AFTER_MS));
    t.chased = MAX_CHASES;
    assert!(!due_chase(&t, 10 * CHASE_AFTER_MS));
    assert!(out_of_nudges(&t, t.last_chased_at + CHASE_AFTER_MS));
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
        (0..6)
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
    assert!(text.contains("Apollo PM (Runs the Apollo project plan): 6 open"));
    assert!(text.contains("OVERLOADED"));
    assert!(text.contains("Apollo Finances (Keeps Apollo's budget): 1 open"));
    assert!(text.contains("Nothing open: Voice."));
    assert!(text.chars().count() <= BOARD_CAP + 300);
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
