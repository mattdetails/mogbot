//! # Logging Infrastructure
//!
//! Structured logging using the `tracing` ecosystem.
//! Logs are written to daily rotating files in the app's log directory.

use std::path::PathBuf;
use std::sync::OnceLock;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{
    fmt::{self},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};

// Hold the guard to keep the non-blocking writer alive
static LOG_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

// Hold the Sentry guard for the lifetime of the process so events get flushed on exit.
static SENTRY_GUARD: OnceLock<sentry::ClientInitGuard> = OnceLock::new();

/// Crash reporting is off unless brand.json names a Sentry DSN of our own.
const SENTRY_DSN: Option<&str> = crate::brand::telemetry::SENTRY_DSN;

/// Initialize Sentry. Must be called before `init_logging()` so the
/// `sentry_tracing` layer can forward events. Skipped in debug builds unless
/// the `SENTRY_FORCE=1` env var is set.
pub fn init_sentry() {
    let Some(dsn) = SENTRY_DSN else {
        return;
    };
    let force = std::env::var("SENTRY_FORCE").ok().as_deref() == Some("1");
    let enabled = !cfg!(debug_assertions) || force;
    if !enabled {
        return;
    }

    let environment = if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    };

    // `ClientOptions` is non-exhaustive, so it's built from the default and
    // then filled in rather than with a struct literal.
    let mut options = sentry::ClientOptions::default();
    options.release = Some(env!("CARGO_PKG_VERSION").into());
    options.environment = Some(environment.into());
    options.send_default_pii = false;
    options.before_send = Some(std::sync::Arc::new(|mut event| {
        scrub_event(&mut event);
        Some(event)
    }));
    options.before_breadcrumb = Some(std::sync::Arc::new(|mut breadcrumb| {
        if let Some(msg) = breadcrumb.message.as_mut() {
            *msg = scrub_string(msg);
        }
        Some(breadcrumb)
    }));
    let guard = sentry::init((dsn, options));
    let _ = SENTRY_GUARD.set(guard);
}

/// Everything that leaves this machine in a report or to Sentry goes through
/// this: local paths (user names, project and client folders) and credentials
/// (URL userinfo, tokens, `Bearer …`, `password=…`). A git error can carry
/// `https://x-access-token:ghp_…@github.com`, and reports are filed as
/// issues on a public repo.
pub(crate) fn scrub_string(s: &str) -> String {
    // Strip local paths so Sentry doesn't see usernames or project folder names.
    let mut out = s.to_string();
    for prefix in ["/Users/", "/home/", "/Volumes/", "/private/", "C:/Users/"] {
        out = regex_lite_replace(&out, prefix, &format!("{prefix}<redacted>"));
    }
    out = regex_lite_replace(&out, "C:\\Users\\", "C:\\Users\\<redacted>");
    redact_secrets(&out)
}

const REDACTED: &str = "<redacted>";

/// A label whose value is a credential or an account identifier
/// (`token=…`, `"password": …`, `Authorization: …`).
pub(crate) fn is_sensitive_label(label: &str) -> bool {
    let label = label
        .trim_matches(|c: char| matches!(c, '"' | '\'' | '{' | '}' | '[' | ']' | ',' | '-'))
        .to_ascii_lowercase();
    matches!(
        label.as_str(),
        "token"
            | "access_token"
            | "refresh_token"
            | "api_key"
            | "api-key"
            | "apikey"
            | "secret"
            | "client_secret"
            | "password"
            | "passwd"
            | "authorization"
            | "cookie"
            | "set-cookie"
            | "x-api-key"
            | "username"
            | "user"
            | "user_id"
            | "email"
    ) || [
        "_token",
        "_secret",
        "_password",
        "_key",
        "_email",
        "-token",
        "-key",
    ]
    .iter()
    .any(|suffix| label.ends_with(suffix))
}

/// A word that is itself a credential: a known token prefix, an AWS access
/// key id, or a JWT. `word` as written (case matters for AWS ids).
pub(crate) fn looks_like_secret(word: &str) -> bool {
    let lower = word.to_ascii_lowercase();
    let prefixed = [
        "ghp_",
        "github_pat_",
        "gho_",
        "ghu_",
        "ghs_",
        "ghr_",
        "glpat-",
        "sk-ant-",
        "sk-proj-",
        "sk_live_",
        "sk_test_",
        "rk_live_",
        "xoxa-",
        "xoxb-",
        "xoxp-",
        "xoxr-",
        "xoxs-",
        "xoxe-",
        "xapp-",
        "npm_",
    ]
    .iter()
    .any(|p| lower.starts_with(p) && lower.len() > p.len() + 3);
    // OpenAI-style `sk-…`: long enough not to catch an ordinary word.
    let sk = lower.starts_with("sk-") && word.len() >= 20;
    let aws = (word.starts_with("AKIA") || word.starts_with("ASIA"))
        && word.len() == 20
        && word
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit());
    let jwt = word.starts_with("eyJ") && word.matches('.').count() == 2 && word.len() >= 30;
    prefixed || sk || aws || jwt
}

/// Credentials out of `s`, keeping its layout (lines, spacing) so a stack
/// stays readable. Pure.
pub(crate) fn redact_secrets(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut redact_next = false;
    // A bare label ("password") only means a value follows when the next
    // word is its separator ("password = x"); "User report: …" is prose.
    let mut label_before = false;
    for piece in s.split_inclusive(char::is_whitespace) {
        let word = piece.trim_end_matches(char::is_whitespace);
        let space = &piece[word.len()..];
        if word.is_empty() {
            out.push_str(space);
            continue;
        }
        let word = strip_userinfo(word);
        let lower = word.to_ascii_lowercase();
        if label_before && matches!(word.as_str(), "=" | ":") {
            // "password = x": the separator stands alone; the next word is
            // the value.
            label_before = false;
            redact_next = true;
            out.push_str(&word);
            out.push_str(space);
            continue;
        }
        label_before = false;
        if redact_next && !matches!(word.as_str(), "=" | ":") {
            out.push_str(REDACTED);
            out.push_str(space);
            redact_next = matches!(lower.as_str(), "bearer" | "basic" | "token");
            continue;
        }
        redact_next = false;
        // label=value / label:value in one word.
        if let Some(at) = word.find(['=', ':']) {
            if is_sensitive_label(&word[..at]) && !word[at + 1..].starts_with("//") {
                let value = word[at + 1..].trim_matches(|c| c == '"' || c == '\'');
                out.push_str(&word[..=at]);
                if value.is_empty() || value == "," {
                    redact_next = true;
                } else {
                    out.push_str(REDACTED);
                }
                out.push_str(space);
                continue;
            }
        }
        let core = word.trim_matches(|c: char| {
            matches!(
                c,
                '"' | '\'' | ',' | ';' | '(' | ')' | '[' | ']' | '{' | '}' | '<' | '>' | '`'
            )
        });
        if !core.is_empty() && looks_like_secret(core) {
            out.push_str(&word.replacen(core, REDACTED, 1));
        } else {
            out.push_str(&word);
            redact_next = redact_next && matches!(word.as_str(), "=" | ":")
                || matches!(lower.as_str(), "bearer" | "basic");
            label_before = is_sensitive_label(core) && core.len() == word.len();
        }
        out.push_str(space);
    }
    out
}

/// `scheme://user:pass@host/…` → `scheme://<redacted>@host/…`.
fn strip_userinfo(word: &str) -> String {
    let mut out = String::with_capacity(word.len());
    let mut rest = word;
    while let Some(i) = rest.find("://") {
        let (head, tail) = rest.split_at(i + 3);
        out.push_str(head);
        let authority_end = tail.find(['/', '?', '#']).unwrap_or(tail.len());
        match tail[..authority_end].rfind('@') {
            Some(at) => {
                out.push_str(REDACTED);
                out.push_str(&tail[at..authority_end]);
            }
            None => out.push_str(&tail[..authority_end]),
        }
        rest = &tail[authority_end..];
    }
    out.push_str(rest);
    out
}

fn regex_lite_replace(input: &str, prefix: &str, replacement: &str) -> String {
    // Replace `<prefix><username>/<folders…>/<file>` with
    // `<replacement>/…/<file>`: the user name and every folder under it go
    // (project and client names live there), the file name stays because
    // it's what makes a report useful. The path runs to whitespace or a
    // quote. Avoids a full regex crate dependency.
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(idx) = rest.find(prefix) {
        out.push_str(&rest[..idx]);
        out.push_str(replacement);
        let after = &rest[idx + prefix.len()..];
        let end = after
            .find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ')' || c == ',')
            .unwrap_or(after.len());
        let path = &after[..end];
        let sep = if prefix.contains('\\') { '\\' } else { '/' };
        let parts: Vec<&str> = path.split(sep).collect();
        // parts[0] is the user name; then folders; the last is the file.
        match parts.len() {
            0 | 1 => {}
            2 => {
                out.push(sep);
                out.push_str(parts[1]);
            }
            n => {
                out.push(sep);
                out.push('…');
                out.push(sep);
                out.push_str(parts[n - 1]);
            }
        }
        rest = &after[end..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod scrub_tests {
    use super::{redact_secrets, scrub_string};

    /// CTO review 2026-11-14: reports only lost home paths; a git error's
    /// token went out as written, into issues on a public repo.
    #[test]
    fn credentials_never_leave_in_a_report() {
        let cases = [
            (
                "fatal: unable to access 'https://x-access-token:ghp_abcdefghijklmnop1234@github.com/o/r.git/': 403",
                "fatal: unable to access 'https://<redacted>@github.com/o/r.git/': 403",
            ),
            ("Authorization: Bearer abc.def.ghi", "Authorization: <redacted> <redacted>"),
            ("header Bearer s3cr3tvalue here", "header Bearer <redacted> here"),
            ("key sk-ant-api03-AAAAAAAAAAAAAAAA failed", "key <redacted> failed"),
            ("OPENAI sk-abcdefghijklmnopqrstuvwx", "OPENAI <redacted>"),
            ("slack xoxb-1234-5678-abcdef bad", "slack <redacted> bad"),
            ("pat github_pat_11ABCDEFG0123456789_x", "pat <redacted>"),
            ("aws AKIAIOSFODNN7EXAMPLE denied", "aws <redacted> denied"),
            (
                "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl",
                "jwt <redacted>",
            ),
            ("password=hunter2 next", "password=<redacted> next"),
            ("{\"token\":\"abc123\"}", "{\"token\":<redacted>"),
            ("api_key: \"zzz\"", "api_key: <redacted>"),
            ("password = hunter2 ok", "password = <redacted> ok"),
            ("User report: The phone drops", "User report: The phone drops"),
        ];
        for (input, want) in cases {
            assert_eq!(scrub_string(input), want, "{input}");
        }
        // Ordinary text and its layout are left alone.
        let plain = "git push failed:\n  remote rejected main (sk- prefix test)\n\tat line 4";
        assert_eq!(redact_secrets(plain), plain);
        assert_eq!(
            scrub_string("see https://github.com/o/r and task-list skill"),
            "see https://github.com/o/r and task-list skill"
        );
    }

    #[test]
    fn more_local_paths_are_scrubbed() {
        assert_eq!(
            scrub_string("in /Volumes/Work/clients/acme/app.ts"),
            "in /Volumes/<redacted>/…/app.ts"
        );
        assert_eq!(
            scrub_string("tmp /private/var/folders/xy/T/x.log"),
            "tmp /private/<redacted>/…/x.log"
        );
        assert_eq!(
            scrub_string("at C:/Users/julian/proj/main.rs"),
            "at C:/Users/<redacted>/…/main.rs"
        );
    }

    #[test]
    fn user_names_and_folders_go_the_file_name_stays() {
        assert_eq!(
            scrub_string("failed at /Users/julian/ShipStudio/acme-client/src/page.tsx: boom"),
            "failed at /Users/<redacted>/…/page.tsx: boom"
        );
        assert_eq!(scrub_string("in /Users/julian"), "in /Users/<redacted>");
        assert_eq!(
            scrub_string("'/Users/julian/notes.md'"),
            "'/Users/<redacted>/notes.md'"
        );
        assert_eq!(
            scrub_string(r"C:\Users\pat\Work\Client\a.txt"),
            r"C:\Users\<redacted>\…\a.txt"
        );
        assert_eq!(
            scrub_string("/home/pat/x/y (os error 2)"),
            "/home/<redacted>/…/y (os error 2)"
        );
        assert_eq!(scrub_string("nothing here"), "nothing here");
    }
}

fn scrub_event(event: &mut sentry::protocol::Event<'static>) {
    if let Some(msg) = event.message.as_mut() {
        *msg = scrub_string(msg);
    }
    for exception in event.exception.values.iter_mut() {
        if let Some(value) = exception.value.as_mut() {
            *value = scrub_string(value);
        }
    }
    for breadcrumb in event.breadcrumbs.values.iter_mut() {
        if let Some(msg) = breadcrumb.message.as_mut() {
            *msg = scrub_string(msg);
        }
    }
}

/// Get the log directory path
pub(crate) fn get_log_dir() -> PathBuf {
    crate::brand::logs_dir()
}

/// Initialize the logging system
///
/// Sets up:
/// - Daily rotating log files
/// - JSON formatted logs for easy parsing
/// - Console output in debug builds
/// - Environment-based log level filtering
pub fn init_logging() -> Result<(), String> {
    let log_dir = get_log_dir();

    // File logging is best-effort: a full disk (or a log directory we can't
    // create or open) must not take the whole app down at startup. Both the
    // directory creation and the appender build used to abort — the appender
    // via `rolling::daily`'s internal panic — leaving the user with a crash
    // instead of a running app (issue #827). Fall back to no file layer; Sentry
    // and admin-agent reporting below still work.
    let file_writer = match std::fs::create_dir_all(&log_dir).and_then(|()| {
        tracing_appender::rolling::Builder::new()
            .rotation(tracing_appender::rolling::Rotation::DAILY)
            .filename_prefix(crate::brand::log_file_prefix())
            // Uncapped rotation was an unbounded-disk-growth bug: daily files
            // were never deleted, so the log directory grew forever (measured
            // at ~45MB/day per running instance before the span-close noise
            // cut below). Two weeks is generous for support/debugging and
            // now costs single-digit MB/day per file after that cut.
            .max_log_files(14)
            .build(&log_dir)
            .map_err(std::io::Error::other)
    }) {
        Ok(appender) => {
            let (non_blocking, guard) = tracing_appender::non_blocking(appender);
            // Store the guard to keep the writer alive
            LOG_GUARD
                .set(guard)
                .map_err(|_| "Logging already initialized")?;
            Some(non_blocking)
        }
        Err(e) => {
            eprintln!(
                "{}: file logging disabled ({}): {e}",
                crate::brand::NAME,
                log_dir.display()
            );
            None
        }
    };

    // Create the file layer with JSON formatting. `Option<Layer>` is itself a
    // layer, so the disabled case is a no-op rather than a separate build path.
    //
    // No `with_span_events(FmtSpan::CLOSE)` here (deliberately — it used to be
    // on). Every `#[tracing::instrument]`'d command emits one INFO-level
    // "close" record per call with a busy/idle duration, and on a real
    // release-build log this was measured at 91.5% of all lines and 90.2% of
    // all bytes (112,417 of 122,916 lines; ~41MB of a 45MB daily file) —
    // almost entirely microsecond-scale entries like
    // `get_dashboard_projects`/`list_accounts`/`snapshot_status` that nobody
    // reads. Turning it off removes that volume without touching a single
    // `info!`/`warn!`/`error!` call site: those keep firing at their own
    // level with the same span context (the span's fields still populate the
    // "span" object on every event via `with_current_span` below) because
    // this only stops the *synthetic* close record, not span creation. The
    // actual diagnostic signal — ~10.5k lines/day of real messages — is
    // unaffected.
    let file_layer = file_writer.map(|writer| {
        fmt::layer()
            .json()
            .with_writer(writer)
            .with_current_span(true)
            .with_target(true)
            .with_file(true)
            .with_line_number(true)
    });

    // Create environment filter
    // Default to info level, can be overridden with RUST_LOG env var
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("app_lib=info,warn"));

    // Build the subscriber
    let subscriber = tracing_subscriber::registry().with(filter).with(file_layer);

    // In debug builds, also log to console
    #[cfg(debug_assertions)]
    let subscriber = subscriber.with(fmt::layer().with_target(true).with_level(true).compact());

    // Forward tracing events to Sentry. The layer is a no-op if Sentry wasn't
    // initialized (e.g. debug builds without SENTRY_FORCE=1), so it's safe to
    // attach unconditionally.
    let subscriber = subscriber.with(sentry_tracing::layer());

    // Forward error-level events to the admin agent (docs/error-reporting.md).
    // Also a no-op outside production builds and gated/throttled internally.
    let subscriber = subscriber.with(crate::error_reporting::AdminAgentLayer);

    subscriber.init();

    tracing::info!(
        log_dir = %log_dir.display(),
        version = env!("CARGO_PKG_VERSION"),
        "Logging initialized"
    );

    Ok(())
}

/// Get the current log file path (for debugging/support)
#[tauri::command]
pub fn get_log_path() -> String {
    get_log_dir().to_string_lossy().to_string()
}

/// Log a message from the frontend
#[tauri::command]
pub fn log_frontend_event(level: String, message: String, context: Option<serde_json::Value>) {
    let ctx = context.map(|c| c.to_string()).unwrap_or_default();

    match level.as_str() {
        "error" => tracing::error!(source = "frontend", context = %ctx, "{}", message),
        "warn" => tracing::warn!(source = "frontend", context = %ctx, "{}", message),
        "debug" => tracing::debug!(source = "frontend", context = %ctx, "{}", message),
        _ => tracing::info!(source = "frontend", context = %ctx, "{}", message),
    }
}
