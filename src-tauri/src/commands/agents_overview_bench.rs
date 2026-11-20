//! What one rebuild of the Agents overview costs, part by part. `agents://registry`
//! fires on every registry write and each one rebuilds it (the desk at most
//! every 120 ms, a paired phone every 150 ms), so with a team at work this
//! runs several times a second.
//!
//! cargo test --release --lib overview_cost -- --ignored --nocapture
//! PERF_AGENTS_ROOT=<a copy of an agents folder> uses real data instead of
//! the 40 seeded agents. Never point it at a live app's folder.

use super::*;
use crate::agents::{store, tasks};
use std::time::Instant;

fn seed(root: &std::path::Path, n: usize) {
    store::set_root_for_tests(Some(root.to_path_buf()));
    for i in 0..n {
        let a = store::create(store::NewAgent {
            name: format!("Agent {i}"),
            role: "Does one job well, and says what it did".into(),
            instructions: "Be brief. ".repeat(200),
            shape: None,
            color: None,
            is_main: i == 0,
        })
        .unwrap();
        for t in 0..8 {
            tasks::add(
                &a.id,
                &format!("Task {t} for agent {i}"),
                tasks::Source::User,
                None,
            );
        }
    }
}

fn time<T>(label: &str, runs: u32, mut f: impl FnMut() -> T) -> f64 {
    let _ = f();
    let start = Instant::now();
    for _ in 0..runs {
        std::hint::black_box(f());
    }
    let us = start.elapsed().as_secs_f64() * 1e6 / runs as f64;
    println!("{label:<44} {us:>10.1} µs");
    us
}

#[test]
#[ignore]
fn overview_cost() {
    let _serial = store::tests_lock();
    let home = tempfile::tempdir().unwrap();
    // Every app-support read (policy, wallet, defaults…) lands in an empty home.
    unsafe { std::env::set_var("HOME", home.path()) };
    let seeded = tempfile::tempdir().unwrap();
    let root = match std::env::var("PERF_AGENTS_ROOT") {
        Ok(p) => {
            store::set_root_for_tests(Some(p.into()));
            "real copy"
        }
        Err(_) => {
            seed(seeded.path(), 40);
            "40 seeded"
        }
    };
    let n = store::list().unwrap().len();
    println!("\noverview cost, {root}: {n} agents");
    let runs = 200;
    time("store::list (cached)", runs, || store::list().unwrap());
    let reg = store::agents_root().unwrap().join("agents.json");
    let bytes = std::fs::read(&reg).unwrap();
    let rewrite = time("rewrite agents.json (same bytes)", runs, || {
        std::fs::write(&reg, &bytes).unwrap()
    });
    let after = time("store::list after a write (incl. rewrite)", runs, || {
        std::fs::write(&reg, &bytes).unwrap();
        store::list().unwrap()
    });
    println!(
        "{:<44} {:>10.1} µs",
        "  => re-parse after a write",
        after - rewrite
    );
    // The app's own write (a chat line's preview, unread…), then the next read.
    let first = store::list().unwrap()[0].id.clone();
    time("store::update (app's own write)", 50, || {
        store::update(&first, |a| a.muted = !a.muted).unwrap()
    });
    // Only what follows the write is timed: the overview a chat line causes.
    let (mut list_us, mut view_us) = (0.0, 0.0);
    for _ in 0..50 {
        store::update(&first, |a| a.muted = !a.muted).unwrap();
        let t = Instant::now();
        std::hint::black_box(store::list().unwrap());
        list_us += t.elapsed().as_secs_f64() * 1e6;
        store::update(&first, |a| a.muted = !a.muted).unwrap();
        let t = Instant::now();
        std::hint::black_box(serde_json::to_vec(&agent_views().unwrap()).unwrap());
        view_us += t.elapsed().as_secs_f64() * 1e6;
    }
    println!(
        "{:<44} {:>10.1} µs",
        "  first store::list after own write",
        list_us / 50.0
    );
    println!(
        "{:<44} {:>10.1} µs",
        "  OVERVIEW after own write (views+json)",
        view_us / 50.0
    );
    time("policy::load", runs, crate::agents::policy::load);
    time("account_counts", runs, account_counts);
    let agents = store::list().unwrap();
    let counts = account_counts();
    time("per agent: status_with_work (all)", runs, || {
        agents
            .iter()
            .map(|a| runner::status_with_work(&a.id))
            .count()
    });
    time("per agent: tasks::counts_of (all)", runs, || {
        agents.iter().map(|a| tasks::counts_of(&a.id, None)).count()
    });
    time("per agent: ran_on (all)", runs, || {
        agents.iter().map(|a| ran_on(a, &counts)).count()
    });
    time("per agent: starters::load (all)", runs, || {
        agents.iter().map(|a| agents::starters::load(&a.id)).count()
    });
    time("per agent: agent_home (all)", runs, || {
        agents
            .iter()
            .map(|a| store::agent_home(&a.id).unwrap())
            .count()
    });
    time("rest (defaults, level, folders…)", runs, || {
        (
            agents::defaults::saved(),
            agents::independence::level(),
            agents::import_choice::choice(),
            agents::clock::hour24(),
            agents::folders::view(),
        )
    });
    time("agent_views, whole", runs, || agent_views().unwrap());
    let views = agent_views().unwrap();
    time("serialize to JSON (the IPC payload)", runs, || {
        serde_json::to_vec(&views).unwrap()
    });
    println!(
        "payload {} KB",
        serde_json::to_vec(&views).unwrap().len() / 1024
    );
    store::set_root_for_tests(None);
}

/// What the store keeps after its own write is what's on disk, and a write
/// from outside (a hand edit, another build) is read afresh.
#[test]
fn own_writes_are_kept_and_outside_writes_still_read() {
    let _serial = store::tests_lock();
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path(), 2);
    let id = store::list().unwrap()[1].id.clone();
    store::update(&id, |a| a.name = "Renamed".into()).unwrap();
    assert_eq!(store::get(&id).unwrap().name, "Renamed");
    let path = dir.path().join("agents.json");
    let raw = std::fs::read_to_string(&path).unwrap();
    std::fs::write(&path, raw.replace("\"Renamed\"", "\"Outside\"")).unwrap();
    assert_eq!(store::get(&id).unwrap().name, "Outside");
    // Its task counts follow the file too.
    tasks::add(&id, "One more", tasks::Source::User, None);
    let before = tasks::counts_of(&id, None);
    tasks::add(&id, "And another", tasks::Source::User, None);
    assert_ne!(tasks::counts_of(&id, None), before);
    store::set_root_for_tests(None);
}
