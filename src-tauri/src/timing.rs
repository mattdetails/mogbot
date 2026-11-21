//! How long the moments people wait on take, in the log.
//!
//! Two moments matter most: opening the window (the chat list and the open
//! chat read from the Mac) and pressing Send (the message stored, then its
//! turn started). None of it was timed, so a wait nobody could see in the
//! log was a wait nobody could fix. Every line here has the target
//! `app_lib::timing`, which the log's filter (`app_lib=info`) keeps; a
//! target outside `app_lib` (the turn's own timing was `agents::timing`)
//! is dropped before it reaches the file.
//!
//! What is logged, and when (so the log doesn't grow with every read):
//! - the first overview after launch, always, with how long after launch;
//! - any read that took [`SLOW`] or more, with its size;
//! - once a minute per kind, how many reads, their mean and the slowest;
//! - every send: stored, then taken for a turn (and how long it waited for
//!   a slot), then its engine spawned;
//! - the registry lock waited on, or held, for [`SLOW`] or more.

use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

/// A wait worth a line of its own.
pub const SLOW: Duration = Duration::from_millis(50);
/// How often each kind's summary line is written.
const ROLLUP: Duration = Duration::from_secs(60);

static LAUNCH: LazyLock<Instant> = LazyLock::new(Instant::now);
static FIRST_OVERVIEW: AtomicBool = AtomicBool::new(true);

/// Start the launch clock: first thing in `run`.
pub fn launch() {
    LazyLock::force(&LAUNCH);
}

pub fn ms(d: Duration) -> u64 {
    d.as_millis().min(u128::from(u64::MAX)) as u64
}

/// The size of `value` as JSON, what crossing to the window or the phone
/// costs. Serializes it, so only asked for a line that is written.
pub fn json_bytes<T: serde::Serialize + ?Sized>(value: &T) -> usize {
    struct Count(usize);
    impl Write for Count {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0 += buf.len();
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut count = Count(0);
    let _ = serde_json::to_writer(&mut count, value);
    count.0
}

#[derive(Default)]
struct Roll {
    reads: u64,
    total_ms: u64,
    max_ms: u64,
    since: Option<Instant>,
}

static ROLLS: LazyLock<Mutex<HashMap<&'static str, Roll>>> = LazyLock::new(Default::default);

/// What a summary line says, when one is due.
struct Due {
    reads: u64,
    mean_ms: u64,
    max_ms: u64,
}

/// Count one read of `kind`; the minute's summary when it is due.
fn roll(kind: &'static str, took_ms: u64, now: Instant) -> Option<Due> {
    let mut rolls = ROLLS.lock().unwrap_or_else(|e| e.into_inner());
    let roll = rolls.entry(kind).or_default();
    let since = *roll.since.get_or_insert(now);
    roll.reads += 1;
    roll.total_ms += took_ms;
    roll.max_ms = roll.max_ms.max(took_ms);
    if now.duration_since(since) < ROLLUP {
        return None;
    }
    let due = Due {
        reads: roll.reads,
        mean_ms: roll.total_ms / roll.reads.max(1),
        max_ms: roll.max_ms,
    };
    *roll = Roll {
        since: Some(now),
        ..Roll::default()
    };
    Some(due)
}

/// One overview read (the chat list, desk and phone alike): `engines` is
/// the part spent asking the engines' CLIs, `views` the registry's part.
pub fn overview(
    took: Duration,
    engines: Duration,
    views: Duration,
    agents: usize,
    bytes: impl FnOnce() -> usize,
) {
    let took_ms = ms(took);
    let first = FIRST_OVERVIEW.swap(false, Ordering::Relaxed);
    let due = roll("overview", took_ms, Instant::now());
    if first || took >= SLOW {
        tracing::info!(
            target: "app_lib::timing",
            took_ms,
            engines_ms = ms(engines),
            views_ms = ms(views),
            agents,
            bytes = bytes(),
            after_launch_ms = first.then(|| ms(LAUNCH.elapsed())),
            "{}",
            if first { "[Timing] first overview" } else { "[Timing] slow overview" }
        );
    }
    if let Some(due) = due {
        summary("overview", due);
    }
}

/// One read of a chat's page.
pub fn messages(agent: &str, took: Duration, lines: usize, bytes: impl FnOnce() -> usize) {
    let took_ms = ms(took);
    let due = roll("messages", took_ms, Instant::now());
    if took >= SLOW {
        tracing::info!(
            target: "app_lib::timing",
            agent,
            took_ms,
            lines,
            bytes = bytes(),
            "[Timing] slow chat read"
        );
    }
    if let Some(due) = due {
        summary("messages", due);
    }
}

fn summary(kind: &'static str, due: Due) {
    tracing::info!(
        target: "app_lib::timing",
        kind,
        reads = due.reads,
        mean_ms = due.mean_ms,
        max_ms = due.max_ms,
        "[Timing] reads in the last minute"
    );
}

/// Sends waiting for their turn: agent → (message, when it was stored).
static SENT: LazyLock<Mutex<HashMap<String, Sent>>> = LazyLock::new(Default::default);
/// A send waiting for its turn: the message, and when it was stored.
type Sent = (String, Instant);
/// Turns taken from the queue, waiting for their engine: agent → (the
/// send it answers, if one, and when the turn was taken).
type Taken = HashMap<String, (Option<Sent>, Instant)>;
static TAKEN: LazyLock<Mutex<Taken>> = LazyLock::new(Default::default);

/// The user's message is in the log: `took` since the send arrived.
pub fn send_stored(agent: &str, message: &str, took: Duration) {
    tracing::info!(
        target: "app_lib::timing",
        agent,
        message,
        took_ms = ms(took),
        "[Timing] send stored"
    );
    // The oldest send not yet answered is the one a turn starts for.
    SENT.lock()
        .unwrap_or_else(|e| e.into_inner())
        .entry(agent.to_string())
        .or_insert_with(|| (message.to_string(), Instant::now()));
}

/// A turn was taken from the agent's queue after `slot_wait` waiting for a
/// free slot (and memory).
pub fn turn_taken(agent: &str, slot_wait: Duration) {
    let sent = SENT.lock().unwrap_or_else(|e| e.into_inner()).remove(agent);
    if sent.is_some() || slot_wait >= SLOW {
        tracing::info!(
            target: "app_lib::timing",
            agent,
            message = sent.as_ref().map(|(m, _)| m.as_str()),
            since_stored_ms = sent.as_ref().map(|(_, at)| ms(at.elapsed())),
            slot_wait_ms = ms(slot_wait),
            "[Timing] turn taken"
        );
    }
    TAKEN
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(agent.to_string(), (sent, Instant::now()));
}

/// The turn's engine process is running.
pub fn turn_spawned(agent: &str) {
    let Some((sent, taken)) = TAKEN
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(agent)
    else {
        return;
    };
    let prep = taken.elapsed();
    if sent.is_some() || prep >= SLOW {
        tracing::info!(
            target: "app_lib::timing",
            agent,
            message = sent.as_ref().map(|(m, _)| m.as_str()),
            since_stored_ms = sent.as_ref().map(|(_, at)| ms(at.elapsed())),
            prep_ms = ms(prep),
            "[Timing] turn spawned"
        );
    }
}

/// The registry lock, waited on for `waited` (held from `holder` meanwhile).
pub fn lock_waited(
    at: impl std::fmt::Display,
    waited: Duration,
    holder: Option<impl std::fmt::Display>,
) {
    if waited >= SLOW {
        tracing::warn!(
            target: "app_lib::timing",
            at = %at,
            waited_ms = ms(waited),
            holder = holder.map(|h| h.to_string()),
            "[Timing] waited for the agents list"
        );
    }
}

/// The registry lock, held for `held` from `at`.
pub fn lock_held(at: impl std::fmt::Display, held: Duration) {
    if held >= SLOW {
        tracing::warn!(
            target: "app_lib::timing",
            at = %at,
            held_ms = ms(held),
            "[Timing] held the agents list"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_summary_is_due_once_a_minute_and_starts_again() {
        let kind = "test-roll";
        let t0 = Instant::now();
        assert!(roll(kind, 10, t0).is_none());
        assert!(roll(kind, 30, t0 + Duration::from_secs(30)).is_none());
        let due = roll(kind, 20, t0 + ROLLUP).expect("due after a minute");
        assert_eq!((due.reads, due.mean_ms, due.max_ms), (3, 20, 30));
        // The next minute counts from scratch.
        assert!(roll(kind, 5, t0 + ROLLUP + Duration::from_secs(1)).is_none());
        let due = roll(kind, 7, t0 + ROLLUP * 2).expect("due again");
        assert_eq!((due.reads, due.max_ms), (2, 7));
    }

    #[test]
    fn json_bytes_is_the_serialized_length() {
        let v = serde_json::json!({ "a": [1, 2, 3], "b": "hé" });
        assert_eq!(json_bytes(&v), serde_json::to_vec(&v).unwrap().len());
    }

    #[test]
    fn a_send_is_followed_to_its_turn() {
        let agent = "timing-test-agent";
        send_stored(agent, "m1", Duration::from_millis(3));
        // A second send while the first waits: the turn answers the first.
        send_stored(agent, "m2", Duration::from_millis(3));
        assert_eq!(
            SENT.lock().unwrap().get(agent).map(|(m, _)| m.clone()),
            Some("m1".to_string())
        );
        turn_taken(agent, Duration::ZERO);
        assert!(SENT.lock().unwrap().get(agent).is_none());
        assert!(TAKEN.lock().unwrap().contains_key(agent));
        turn_spawned(agent);
        assert!(!TAKEN.lock().unwrap().contains_key(agent));
        // A turn nobody sent for (a routine) still clears cleanly.
        turn_taken(agent, Duration::ZERO);
        turn_spawned(agent);
        assert!(!TAKEN.lock().unwrap().contains_key(agent));
    }
}
