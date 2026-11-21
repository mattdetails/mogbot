use super::*;

fn msg(from: From, routine: bool, outside: bool) -> Inbound {
    Inbound {
        id: "m1".into(),
        text: "hello".into(),
        from,
        reply: false,
        routine,
        ticket: None,
        room: None,
        outside,
        resume: 0,
        typed: None,
        conversation: None,
    }
}

fn agent(name: &str) -> From {
    From::Agent {
        sender: AgentRef {
            id: name.to_lowercase(),
            name: name.into(),
        },
        hop: 1,
    }
}

#[test]
fn a_paused_agent_takes_the_users_words_and_the_apps_notes() {
    assert_eq!(fate(&msg(From::User, false, false)), Fate::Run);
    assert_eq!(fate(&msg(From::App, false, false)), Fate::Run);
}

#[test]
fn what_other_agents_send_is_held_for_resume() {
    assert_eq!(fate(&msg(agent("Mail"), false, false)), Fate::Hold);
    // An answer another agent gives is theirs too.
    let mut answer = msg(agent("Mail"), false, false);
    answer.reply = true;
    assert_eq!(fate(&answer), Fate::Hold);
}

#[test]
fn outside_text_is_held_not_run() {
    assert_eq!(fate(&msg(From::User, false, true)), Fate::Hold);
}

#[test]
fn a_routine_or_when_firing_is_refused_not_queued() {
    assert_eq!(fate(&msg(From::User, true, false)), Fate::Refuse);
    assert_eq!(fate(&msg(From::User, true, true)), Fate::Refuse);
    assert_eq!(fate(&msg(agent("Mail"), true, false)), Fate::Refuse);
}

#[test]
fn held_messages_survive_a_restart_and_come_back_in_order() {
    let _serial = store::tests_lock();
    let home = tempfile::tempdir().unwrap();
    store::set_root_for_tests(Some(home.path().to_path_buf()));
    std::fs::create_dir_all(store::agent_home("p1").unwrap()).unwrap();
    with_held("p1", |h| {
        let mut a = msg(agent("Mail"), false, false);
        a.id = "a".into();
        let mut b = msg(agent("Scout"), false, false);
        b.id = "b".into();
        h.extend([a, b]);
    });
    assert!(store::agent_home("p1").unwrap().join("held.json").exists());
    // A fresh process reads the file: drop the in-memory copy.
    HELD.lock().unwrap().as_mut().unwrap().remove("p1");
    assert_eq!(held_count("p1"), 2);
    let ids: Vec<String> = with_held("p1", |h| {
        std::mem::take(h).into_iter().map(|m| m.id).collect()
    });
    assert_eq!(ids, ["a", "b"]);
    assert!(
        !store::agent_home("p1").unwrap().join("held.json").exists(),
        "nothing held: no file"
    );
    store::set_root_for_tests(None);
}
