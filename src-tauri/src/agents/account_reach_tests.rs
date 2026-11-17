use super::*;
use crate::agents::apps::{App, Source};
use crate::agents::capabilities::Line;
use serde_json::json;

fn write(path: &Path, v: &Value) {
    std::fs::write(path, serde_json::to_vec(v).unwrap()).unwrap();
}

fn read(path: &Path) -> Value {
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// A fictional HOME: this Mac's `.claude.json` and an added account's.
fn fixture() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
    let home = tempfile::tempdir().unwrap();
    let native = home.path().join(".claude.json");
    let dir = home.path().join(".mogbot/accounts/acct1/claude");
    std::fs::create_dir_all(&dir).unwrap();
    write(
        &native,
        &json!({
            "oauthAccount": { "emailAddress": "sam@example.test" },
            "mcpServers": {
                "figma": { "type": "http", "url": "https://mcp.figma.example/mcp" },
                "notes": { "type": "stdio", "command": "notes-mcp", "args": [] }
            },
            "projects": { "/x": { "mcpServers": { "local-only": {} } } }
        }),
    );
    let target = dir.join(".claude.json");
    write(
        &target,
        &json!({
            "oauthAccount": { "emailAddress": "personal@example.test" },
            "userID": "u-2",
            "mcpServers": { "own": { "type": "http", "url": "https://own.example" } }
        }),
    );
    (home, native, target)
}

#[test]
fn this_macs_servers_are_merged_in_and_nothing_else_is_touched() {
    let (_home, native, target) = fixture();
    let done = sync_servers(&native, &target).unwrap();
    assert_eq!(done.added, ["figma", "notes", "local-only (/x)"]);
    let got = read(&target);
    // Its own login and keys are as they were; this Mac's aren't copied.
    assert_eq!(got["oauthAccount"]["emailAddress"], "personal@example.test");
    assert_eq!(got["userID"], "u-2");
    // A project's servers go to that project, not to user scope.
    assert!(got["projects"]["/x"]["mcpServers"]["local-only"].is_object());
    let servers = got["mcpServers"].as_object().unwrap();
    assert_eq!(servers.len(), 3);
    assert_eq!(servers["figma"]["url"], "https://mcp.figma.example/mcp");
    assert_eq!(servers["own"]["url"], "https://own.example");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&target).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }
    // A second sync has nothing to do and writes nothing.
    let before = std::fs::metadata(&target).unwrap().modified().unwrap();
    assert!(!sync_servers(&native, &target).unwrap().changed());
    assert_eq!(
        std::fs::metadata(&target).unwrap().modified().unwrap(),
        before
    );
}

/// Seen 2026-11-14: a turn on an added account had no preview server, which
/// this Mac registers for one project only (`projects[path].mcpServers`).
#[test]
fn a_projects_own_servers_follow_and_go_when_this_mac_drops_them() {
    let (_home, native, target) = fixture();
    let mut t = read(&target);
    t["projects"] = json!({
        "/x": { "hasTrustDialogAccepted": true, "mcpServers": { "theirs": {} } }
    });
    write(&target, &t);
    sync_servers(&native, &target).unwrap();
    let got = read(&target);
    let x = &got["projects"]["/x"];
    assert_eq!(x["hasTrustDialogAccepted"], true, "its other settings kept");
    assert!(x["mcpServers"]["local-only"].is_object());
    assert!(x["mcpServers"]["theirs"].is_object());
    // This Mac drops the project's server: ours goes, theirs stays.
    let mut n = read(&native);
    n["projects"] = json!({});
    write(&native, &n);
    let done = sync_servers(&native, &target).unwrap();
    assert_eq!(done.removed, ["local-only (/x)"]);
    let x = &read(&target)["projects"]["/x"];
    assert!(x["mcpServers"].get("local-only").is_none());
    assert!(x["mcpServers"]["theirs"].is_object());
    // User-scope servers untouched by that.
    assert!(read(&target)["mcpServers"]["figma"].is_object());
    assert!(!sync_servers(&native, &target).unwrap().changed());
}

#[test]
fn a_change_on_this_mac_follows_and_only_synced_servers_are_removed() {
    let (_home, native, target) = fixture();
    sync_servers(&native, &target).unwrap();
    write(
        &native,
        &json!({ "mcpServers": { "figma": { "type": "http", "url": "https://new.example/mcp" } } }),
    );
    let done = sync_servers(&native, &target).unwrap();
    assert_eq!(done.updated, ["figma"]);
    assert_eq!(done.removed, ["notes", "local-only (/x)"]);
    let servers = read(&target)["mcpServers"].as_object().unwrap().clone();
    assert_eq!(servers["figma"]["url"], "https://new.example/mcp");
    assert!(
        servers.contains_key("own"),
        "the account's own server stays"
    );
    assert!(!servers.contains_key("notes"));
}

/// The account already had a server by the same name as one of this Mac's
/// (both set up Figma by hand). The sync never put it there, so this Mac
/// dropping Figma later must not take it off the account: it used to be
/// recorded as synced the first time and removed the next.
#[test]
fn a_server_the_account_already_had_is_never_taken_off_it() {
    let (_home, native, target) = fixture();
    let figma = json!({ "type": "http", "url": "https://mcp.figma.example/mcp" });
    let mut config = read(&target);
    config["mcpServers"]["figma"] = figma.clone();
    write(&target, &config);
    let done = sync_servers(&native, &target).unwrap();
    assert_eq!(done.added, ["notes", "local-only (/x)"]);
    // This Mac drops Figma and Notes.
    write(&native, &json!({ "mcpServers": {} }));
    let done = sync_servers(&native, &target).unwrap();
    assert_eq!(done.removed, ["notes", "local-only (/x)"]);
    let servers = read(&target)["mcpServers"].as_object().unwrap().clone();
    assert_eq!(
        servers.get("figma"),
        Some(&figma),
        "the account's own Figma stays"
    );
    assert!(servers.contains_key("own"));
}

#[test]
fn a_missing_account_file_is_started_and_a_broken_one_left_alone() {
    let (_home, native, target) = fixture();
    std::fs::remove_file(&target).unwrap();
    assert_eq!(sync_servers(&native, &target).unwrap().added.len(), 3);
    assert_eq!(read(&target)["mcpServers"].as_object().unwrap().len(), 2);
    std::fs::write(&target, "{ not json").unwrap();
    assert!(sync_servers(&native, &target).is_err());
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "{ not json");
}

#[test]
fn servers_needing_a_sign_in_on_the_account_are_named_once() {
    let app = |name: &str, status: &str, source: Source| App {
        name: name.into(),
        target: "https://x.example".into(),
        status: status.into(),
        source,
    };
    let apps = vec![
        app("figma", "needs_auth", Source::User),
        app("webflow", "needs_auth", Source::User),
        app("notes", "connected", Source::User),
        app("claude.ai Gmail", "needs_auth", Source::ClaudeAi),
    ];
    let line = needs_auth_line("Personal", "Riley", &apps).unwrap();
    assert!(
        line.starts_with("On Personal, Figma and Webflow need a one-time sign-in"),
        "{line}"
    );
    assert!(line.contains("Take over Riley, type /mcp"), "{line}");
    assert!(needs_auth_line("Personal", "Riley", &apps[2..]).is_none());
}

#[test]
fn the_chrome_server_runs_without_the_accounts_variables() {
    let v = chrome_server(Path::new("/opt/claude"));
    let args: Vec<&str> = v["args"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect();
    assert_eq!(v["command"], "/usr/bin/env");
    for var in ["CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN"] {
        assert!(args.windows(2).any(|w| w == ["-u", var]), "{var}");
    }
    assert_eq!(
        &args[args.len() - 2..],
        ["/opt/claude", "--claude-in-chrome-mcp"]
    );
    assert_ne!(
        CHROME_SERVER, "claude-in-chrome",
        "Claude Code drops that name"
    );
}

fn caps(lines: &[(&str, &str)]) -> Capabilities {
    Capabilities {
        seen_at: 1,
        lines: lines
            .iter()
            .map(|(w, d)| Line {
                what: w.to_string(),
                detail: d.to_string(),
            })
            .collect(),
    }
}

#[test]
fn a_switch_names_the_connectors_the_account_lacks_and_the_way_in_meanwhile() {
    let before = caps(&[
        ("Chrome", "Browse in your Chrome: open pages."),
        ("Connectors", "Gmail, Google Calendar and Figma"),
    ]);
    let now = caps(&[
        ("Chrome", "Browse in your Chrome: open pages."),
        ("Connectors", "Figma"),
    ]);
    let line = lost_line("Personal", &before, &now, true).unwrap();
    assert_eq!(
        line,
        "Gmail and Google Calendar aren't reachable on Personal. If they're a claude.ai connector, turn them on at claude.ai/settings/connectors while signed in as Personal; agents use them in your Chrome meanwhile."
    );
    let one = lost_line(
        "Personal",
        &before,
        &caps(&[("Connectors", "Google Calendar and Figma")]),
        false,
    )
    .unwrap();
    assert!(
        one.starts_with(
            "Gmail isn't reachable on Personal. If it's a claude.ai connector, turn it on"
        ),
        "{one}"
    );
    assert!(one.contains("or connect them here"), "{one}");
    assert!(
        one.contains("Your Chrome isn't reachable on Personal"),
        "{one}"
    );
    // One needing a sign-in there is a sign-in, never "turn it on in
    // claude.ai" (seen 2026-11-14: Figma, Webflow and Sanity blamed on
    // claude.ai). Nothing lost, no line.
    let signed_out = caps(&[
        ("Chrome", "Browse."),
        ("Connectors", "Figma"),
        (
            "Needs sign-in",
            "Gmail and Google Calendar. Connect them in Claude Code to use them here.",
        ),
    ]);
    let line = lost_line("Personal", &before, &signed_out, true).unwrap();
    assert_eq!(
        line,
        "On Personal, Gmail and Google Calendar need a one-time sign-in: their logins are kept per Claude account."
    );
    assert!(lost_line("Personal", &before, &before, true).is_none());
}

/// Agents failing over to the same account at once each sync it before
/// their turn. Found in review (2026-11-08): every sync wrote the same
/// `.claude.json.tmp`, so one rename could move another's half-written file
/// over the account's config (its login) and the other's rename failed.
#[test]
fn syncs_at_once_keep_the_accounts_config_whole() {
    let (_home, native, target) = fixture();
    for round in 0..20 {
        // A server that changes each round, so every sync writes.
        let mut n = read(&native);
        n["mcpServers"]["round"] =
            json!({ "type": "http", "url": format!("https://r{round}.example") });
        n["mcpServers"]["pad"] = json!({ "type": "stdio", "command": "x".repeat(200_000) });
        write(&native, &n);
        let results: Vec<std::io::Result<Synced>> = std::thread::scope(|s| {
            let handles: Vec<_> = (0..8)
                .map(|_| s.spawn(|| sync_servers(&native, &target)))
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });
        for r in &results {
            assert!(r.is_ok(), "round {round}: {r:?}");
        }
        let got = read(&target);
        assert_eq!(got["oauthAccount"]["emailAddress"], "personal@example.test");
        assert_eq!(
            got["mcpServers"]["round"]["url"],
            format!("https://r{round}.example")
        );
        assert!(got["mcpServers"]["own"].is_object());
    }
}
