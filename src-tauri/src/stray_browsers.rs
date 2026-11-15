//! Headless Chromes left running by agents' scripts.
//!
//! Observed (Julian, 2026-11-14): eleven headless Chromes from agents'
//! screenshot and render scripts (`--headless --user-data-dir=/tmp/…`), some
//! five days old, still running. Each started in the background by a turn
//! whose shell then exited, so nothing was left to stop them: they hold
//! memory and debugging ports, and agents found and poked them later. The
//! app's own browsers (the agents' browser, the user's Chrome) are never
//! headless with a temporary profile, so they are never touched.
//!
//! Every [`EVERY`], a headless Chrome whose profile is in a temporary folder,
//! whose parent is gone (adopted by launchd) and that has run longer than
//! [`OLDER_THAN`] is stopped.

use std::time::Duration;

/// How often to look.
pub const EVERY: Duration = Duration::from_secs(15 * 60);
/// How old an orphan must be before it's stopped: a render a script started
/// and is still using is never this old.
pub const OLDER_THAN: Duration = Duration::from_secs(60 * 60);

/// Temporary folders a script's throwaway profile lives in.
const TEMP_ROOTS: &[&str] = &[
    "/tmp/",
    "/private/tmp/",
    "/var/folders/",
    "/private/var/folders/",
];

/// One `ps -axo pid=,ppid=,etime=,command=` line that is a stray: its pid.
pub fn stray(line: &str, older_than: Duration) -> Option<u32> {
    let mut parts = line.split_whitespace();
    let pid: u32 = parts.next()?.parse().ok()?;
    let ppid: u32 = parts.next()?.parse().ok()?;
    let age = parse_etime(parts.next()?)?;
    let command: Vec<&str> = parts.collect();
    // The program's path has spaces ("Google Chrome.app/…/Google Chrome"),
    // so it's found in the line, followed by a space: never a Helper.
    let line = command.join(" ");
    let chrome = [
        "/MacOS/Google Chrome ",
        "/MacOS/Chromium ",
        "/chrome-headless-shell ",
        "/chrome ",
    ]
    .iter()
    .any(|p| line.contains(p));
    let headless = command.iter().any(|a| a.starts_with("--headless"));
    // A profile path with spaces splits across words: its first word starts
    // with the root, which is all that matters here.
    let temp_profile = command.iter().any(|a| {
        a.strip_prefix("--user-data-dir=")
            .is_some_and(|dir| TEMP_ROOTS.iter().any(|root| dir.starts_with(root)))
    });
    (chrome && headless && temp_profile && ppid == 1 && age >= older_than).then_some(pid)
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

/// Stop every stray now. Returns how many.
pub fn sweep() -> usize {
    let Ok(out) = std::process::Command::new("ps")
        .args(["-axo", "pid=,ppid=,etime=,command="])
        .output()
    else {
        return 0;
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let pids: Vec<u32> = text.lines().filter_map(|l| stray(l, OLDER_THAN)).collect();
    for pid in &pids {
        let _ = std::process::Command::new("kill")
            .arg(pid.to_string())
            .status();
    }
    if !pids.is_empty() {
        tracing::info!(
            count = pids.len(),
            "[Browsers] stopped headless Chromes left running by scripts"
        );
    }
    pids.len()
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
    const CHROME: &str = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

    #[test]
    fn an_old_orphaned_headless_chrome_on_a_temp_profile_is_a_stray() {
        let line = format!("4274 1 04-21:54:20 {CHROME} --headless=new --remote-debugging-port=9641 --user-data-dir=/tmp/app-snap-9641 --hide-scrollbars");
        assert_eq!(stray(&line, HOUR), Some(4274));
        let line = format!("45343 1 2-02:55:37 {CHROME} --headless=new --user-data-dir=/var/folders/c7/x/T/chp-56NvFA about:blank");
        assert_eq!(stray(&line, HOUR), Some(45343));
    }

    #[test]
    fn browsers_that_belong_to_someone_are_left_alone() {
        // The user's Chrome.
        assert_eq!(stray(&format!("4123 1 05-10:00:00 {CHROME}"), HOUR), None);
        // The agents' browser: a real profile, not headless.
        let agents = format!("60706 1 03:00:00 {CHROME} --user-data-dir=/Users/x/Library/Application Support/Mogbot/agent-browser/Agents --remote-debugging-pipe");
        assert_eq!(stray(&agents, HOUR), None);
        // A script still running it (its parent is alive).
        let owned = format!("500 499 02:00:00 {CHROME} --headless=new --user-data-dir=/tmp/r");
        assert_eq!(stray(&owned, HOUR), None);
        // Young: a render that may still be in use.
        let young = format!("501 1 12:30 {CHROME} --headless=new --user-data-dir=/tmp/r");
        assert_eq!(stray(&young, HOUR), None);
        // Headless on a real profile someone chose.
        let kept =
            format!("502 1 05:00:00 {CHROME} --headless --user-data-dir=/Users/x/profiles/scraper");
        assert_eq!(stray(&kept, HOUR), None);
        // Not Chrome.
        assert_eq!(
            stray(
                "503 1 05:00:00 /usr/bin/python3 --headless --user-data-dir=/tmp/x",
                HOUR
            ),
            None
        );
    }

    #[test]
    fn elapsed_times_read_as_ps_writes_them() {
        assert_eq!(parse_etime("12:30"), Some(Duration::from_secs(750)));
        assert_eq!(parse_etime("01:00:00"), Some(HOUR));
        assert_eq!(parse_etime("2-00:00:00"), Some(48 * HOUR));
        assert_eq!(parse_etime("x"), None);
    }
}
