//! Headless Chromes agents' scripts start and leave running.
//!
//! Observed (Julian, 2026-11-14): eleven headless Chromes from agents'
//! screenshot and render scripts (`--headless --user-data-dir=/tmp/…`), up to
//! five days old. Each was started in the background by a turn whose shell
//! then exited, so nothing was left to stop them.
//!
//! Only a Chrome an agent started is ever stopped (CTO review 2026-11-14:
//! "headless and old" alone would also kill the user's own Playwright or
//! Puppeteer runs, CI emulators, other apps' Chrome). Every [`EVERY`] the
//! app looks at the process table: a headless Chrome whose parents include
//! an agent's engine (its command names this app's agent-bridge folder) is
//! remembered, by pid and command line. One remembered that has since lost
//! its parent (adopted by launchd) and has run past [`OLDER_THAN`] is
//! stopped. A Chrome the app never saw under an agent is never touched.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::Duration;

/// How often to look: often enough to see a script's Chrome while its
/// parents are still alive.
pub const EVERY: Duration = Duration::from_secs(60);
/// How old an orphan must be before it's stopped.
pub const OLDER_THAN: Duration = Duration::from_secs(60 * 60);

/// One row of `ps -axo pid=,ppid=,etime=,command=`.
#[derive(Debug, Clone, PartialEq)]
pub struct Proc {
    pub pid: u32,
    pub ppid: u32,
    pub age: Duration,
    pub command: String,
}

pub fn parse_row(line: &str) -> Option<Proc> {
    let mut parts = line.split_whitespace();
    let pid = parts.next()?.parse().ok()?;
    let ppid = parts.next()?.parse().ok()?;
    let age = parse_etime(parts.next()?)?;
    let command = parts.collect::<Vec<_>>().join(" ");
    Some(Proc {
        pid,
        ppid,
        age,
        command,
    })
}

/// A headless Chrome's main process (never a Helper).
fn headless_chrome(command: &str) -> bool {
    [
        "/MacOS/Google Chrome ",
        "/MacOS/Chromium ",
        "/chrome-headless-shell ",
        "/chrome ",
    ]
    .iter()
    .any(|p| command.contains(p))
        && command
            .split_whitespace()
            .any(|a| a.starts_with("--headless"))
}

/// Whether one of `pid`'s parents is an agent's engine: its command line
/// holds `marker` (this app's agent-bridge folder, in every engine's
/// `--mcp-config` path and environment).
fn under_agent(pid: u32, table: &HashMap<u32, &Proc>, marker: &str) -> bool {
    let mut at = pid;
    for _ in 0..32 {
        let Some(p) = table.get(&at) else {
            return false;
        };
        if p.pid != pid && p.command.contains(marker) {
            return true;
        }
        if p.ppid <= 1 || p.ppid == at {
            return false;
        }
        at = p.ppid;
    }
    false
}

/// One look: the agents' Chromes to remember from now on (pid, command line)
/// and the pids to stop. Pure.
pub fn plan(
    rows: &[Proc],
    known: &HashSet<(u32, String)>,
    marker: &str,
    older_than: Duration,
) -> (HashSet<(u32, String)>, Vec<u32>) {
    let table: HashMap<u32, &Proc> = rows.iter().map(|p| (p.pid, p)).collect();
    let mut keep = HashSet::new();
    let mut stop = Vec::new();
    for p in rows.iter().filter(|p| headless_chrome(&p.command)) {
        let key = (p.pid, p.command.clone());
        // Same pid and command line as when it was seen under an agent:
        // the same process, not a reused pid.
        let ours = known.contains(&key) || under_agent(p.pid, &table, marker);
        if !ours {
            continue;
        }
        if p.ppid == 1 && p.age >= older_than {
            stop.push(p.pid);
        } else {
            keep.insert(key);
        }
    }
    (keep, stop)
}

/// `ps`'s elapsed time: `[[dd-]hh:]mm:ss`.
fn parse_etime(s: &str) -> Option<Duration> {
    let (days, rest) = match s.split_once('-') {
        Some((d, r)) => (d.parse::<u64>().ok()?, r),
        None => (0, s),
    };
    let nums: Vec<u64> = rest
        .split(':')
        .map(|n| n.parse().ok())
        .collect::<Option<_>>()?;
    let (h, m, sec) = match nums.as_slice() {
        [m, s] => (0, *m, *s),
        [h, m, s] => (*h, *m, *s),
        _ => return None,
    };
    Some(Duration::from_secs(((days * 24 + h) * 60 + m) * 60 + sec))
}

static KNOWN: Mutex<Option<HashSet<(u32, String)>>> = Mutex::new(None);

fn marker() -> String {
    crate::brand::app_support_dir()
        .join("agent-bridge")
        .display()
        .to_string()
}

/// One look now; stops what [`plan`] says. Returns how many it stopped.
pub fn sweep() -> usize {
    let Ok(out) = std::process::Command::new("ps")
        .args(["-axww", "-o", "pid=,ppid=,etime=,command="])
        .output()
    else {
        return 0;
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let rows: Vec<Proc> = text.lines().filter_map(parse_row).collect();
    let mut known = KNOWN.lock().unwrap_or_else(|e| e.into_inner());
    let (keep, stop) = plan(
        &rows,
        known.get_or_insert_with(HashSet::new),
        &marker(),
        OLDER_THAN,
    );
    *known = Some(keep);
    for pid in &stop {
        let _ = std::process::Command::new("kill")
            .arg(pid.to_string())
            .status();
    }
    if !stop.is_empty() {
        tracing::info!(
            count = stop.len(),
            "[Browsers] stopped headless Chromes agents' scripts left running"
        );
    }
    stop.len()
}

/// Look every [`EVERY`], on a thread of its own. Once per process.
pub fn spawn() {
    static STARTED: std::sync::Once = std::sync::Once::new();
    STARTED.call_once(|| {
        let _ = std::thread::Builder::new()
            .name("stray-browsers".into())
            .spawn(|| loop {
                sweep();
                std::thread::sleep(EVERY);
            });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOUR: Duration = Duration::from_secs(3600);
    const MARK: &str = "/Users/x/Library/Application Support/Mogbot/agent-bridge";
    const CHROME: &str = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

    fn row(pid: u32, ppid: u32, age: Duration, command: &str) -> Proc {
        Proc {
            pid,
            ppid,
            age,
            command: command.into(),
        }
    }

    fn engine() -> Proc {
        row(
            100,
            50,
            HOUR,
            &format!("/Users/x/.local/bin/claude --print --mcp-config {MARK}/mcp-1.json"),
        )
    }

    fn render(pid: u32, ppid: u32, age: Duration) -> Proc {
        row(
            pid,
            ppid,
            age,
            &format!("{CHROME} --headless=new --user-data-dir=/tmp/app-snap-9641"),
        )
    }

    #[test]
    fn an_agents_chrome_is_remembered_then_stopped_once_orphaned_and_old() {
        // Seen running under an agent: a shell, then node, then Chrome.
        let rows = vec![
            engine(),
            row(200, 100, HOUR, "/bin/zsh -c node snap.mjs &"),
            row(300, 200, HOUR, "node snap.mjs"),
            render(400, 300, Duration::from_secs(60)),
        ];
        let (known, stop) = plan(&rows, &HashSet::new(), MARK, HOUR);
        assert!(stop.is_empty(), "its script still runs");
        assert_eq!(known.len(), 1);
        // The turn and the script are gone; Chrome lives on, adopted by launchd.
        let later = vec![render(400, 1, Duration::from_secs(30 * 60))];
        let (known, stop) = plan(&later, &known, MARK, HOUR);
        assert!(stop.is_empty(), "not old enough yet");
        let much_later = vec![render(400, 1, 5 * HOUR)];
        let (_, stop) = plan(&much_later, &known, MARK, HOUR);
        assert_eq!(stop, vec![400]);
    }

    /// CTO review 2026-11-14: never on "headless and old" alone.
    #[test]
    fn a_headless_chrome_no_agent_started_survives() {
        // Orphaned, old, temp profile, but never seen under an agent: the
        // user's Playwright run, another app's, one from before the app ran.
        let theirs = vec![render(500, 1, 5 * 24 * HOUR)];
        let (known, stop) = plan(&theirs, &HashSet::new(), MARK, HOUR);
        assert!(stop.is_empty());
        assert!(known.is_empty());
        // Started by the user's own tool, still parented.
        let rows = vec![
            row(
                600,
                1,
                HOUR,
                "/usr/local/bin/node node_modules/.bin/playwright test",
            ),
            render(700, 600, 3 * HOUR),
        ];
        let (known, stop) = plan(&rows, &HashSet::new(), MARK, HOUR);
        assert!(stop.is_empty() && known.is_empty());
        // A pid an agent's Chrome had, now reused by someone else's: the
        // command line differs, so it isn't ours.
        let mut known = HashSet::new();
        known.insert((
            800u32,
            format!("{CHROME} --headless=new --user-data-dir=/tmp/app-snap-1"),
        ));
        let reused = vec![row(
            800,
            1,
            3 * HOUR,
            &format!("{CHROME} --headless --user-data-dir=/tmp/ci"),
        )];
        let (_, stop) = plan(&reused, &known, MARK, HOUR);
        assert!(stop.is_empty());
    }

    #[test]
    fn the_users_and_the_agents_browser_are_never_counted() {
        let rows = vec![
            engine(),
            row(900, 1, 5 * HOUR, CHROME),
            row(901, 100, 5 * HOUR, &format!("{CHROME} --user-data-dir={MARK}/../agent-browser/Agents --remote-debugging-pipe")),
        ];
        let (known, stop) = plan(&rows, &HashSet::new(), MARK, HOUR);
        assert!(stop.is_empty() && known.is_empty());
    }

    #[test]
    fn elapsed_times_read_as_ps_writes_them() {
        assert_eq!(parse_etime("12:30"), Some(Duration::from_secs(750)));
        assert_eq!(parse_etime("01:00:00"), Some(HOUR));
        assert_eq!(parse_etime("2-00:00:00"), Some(48 * HOUR));
        assert_eq!(parse_etime("x"), None);
    }
}
