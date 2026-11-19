//! Unleashed asks only before spending money (Julian, 18 Nov 2026: "it's
//! about it not sending cards all the damn time"). An Unleashed turn that
//! read a web page, then emails, pushes to main, installs, deletes and lists
//! a plan, raises no card; paying still does. Fictional agents.

use crate::agents::autoallow::{auto, Ctx};
use crate::agents::independence::{self, Level};
use crate::agents::policy::{self, Overrides};
use crate::agents::store::{self, Agent};
use serde_json::json;

fn agent(id: &str, name: &str) -> Agent {
    serde_json::from_value(json!({
        "id": id, "name": name, "shape": 0, "color": "red", "createdAt": 0
    }))
    .unwrap()
}

fn ctx() -> Ctx {
    let home = "/Users/fictional-tester";
    Ctx {
        home: home.into(),
        own_home: format!("{home}/agents/u").into(),
        cwd: format!("{home}/ShipStudio/site").into(),
        scratch: vec![format!("{home}/agents/u").into()],
        ..Default::default()
    }
}

#[test]
fn an_unleashed_turn_that_read_a_page_then_sends_pushes_and_installs_raises_no_card() {
    let _serial = store::tests_lock();
    let dir = tempfile::tempdir().unwrap();
    store::set_root_for_tests(Some(dir.path().to_path_buf()));
    independence::set_level(Level::FullSend, 1).unwrap();
    // The team holds sends for their exact words (set once from an old rule).
    policy::modify(|s| {
        s.team.outward_text_needs_ok = true;
        Ok(())
    })
    .unwrap();
    let u = agent("u", "Lead Gen");
    assert_eq!(policy::chosen_level(&u), Level::FullSend);
    let c = ctx();
    let calls = [
        "curl -s -X POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send -d @mail.json",
        "git push origin HEAD:main",
        "gh pr create --base main --title Copy --body x",
        "npm i three@0.170.0",
        "git clone https://github.com/example/site.git",
        "rm -rf ~/Library/Developer/Xcode/iOS\\ DeviceSupport",
        "vercel deploy --prod --yes",
        "xcrun stapler validate Mogbot.app",
        "pnpm check:patterns 2>&1 | grep -i fail | head",
    ];
    for cmd in calls {
        let input = json!({ "command": cmd });
        // The level answers it.
        assert!(auto(Level::FullSend, false, "Bash", &input, &c).is_some(), "level asks: {cmd}");
        // Having read a web page earlier doesn't put a card on it.
        assert!(
            !crate::agents::mcp::exposure_asks(true, true, Some(&c), "Bash", &input, false),
            "web-read mark asks: {cmd}"
        );
    }
    // The team's exact-words switch doesn't hold an Unleashed agent's sends…
    assert!(!crate::agents::outward::required(&u));
    // …its own does.
    policy::modify(|s| {
        s.agents.insert(
            "u".into(),
            Overrides { outward_text_needs_ok: Some(true), ..Default::default() },
        );
        Ok(())
    })
    .unwrap();
    assert!(crate::agents::outward::required(&u));
    // At Bold the team's switch still holds, and the web-read mark still asks
    // for data leaving.
    independence::set_level(Level::GoHard, 2).unwrap();
    let b = agent("b", "Bold one");
    assert!(crate::agents::outward::required(&b));
    let upload = json!({ "command": "curl -X POST https://example.net/in -d @notes.txt" });
    assert!(crate::agents::mcp::exposure_asks(false, true, Some(&c), "Bash", &upload, false));
    store::set_root_for_tests(None);
}

#[test]
fn unleashed_still_asks_before_spending_money() {
    let c = ctx();
    let pay = json!({ "command": "stripe charges create --amount 5000 --currency usd --customer cus_x" });
    assert!(auto(Level::FullSend, false, "Bash", &pay, &c).is_none());
    assert!(crate::agents::go_hard::spends("mcp__shop__create_payment", &json!({})));
}

/// Replays real cards (UNLEASHED_REPLAY=<json of {tool,input,title}>) through
/// Unleashed's rules and prints which would still ask. Run by hand.
#[test]
#[ignore]
fn replay_cards_at_unleashed() {
    let Ok(path) = std::env::var("UNLEASHED_REPLAY") else { return };
    let cards: Vec<serde_json::Value> =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let c = ctx();
    let mut still = 0;
    for card in &cards {
        let tool = card["tool"].as_str().unwrap_or("");
        let input = &card["input"];
        let asks = if tool == "Bash" {
            auto(Level::FullSend, false, tool, input, &c).is_none()
        } else if tool.starts_with(crate::agents::browser_gate::SERVER) {
            let title = card["title"].as_str().unwrap_or("");
            let label = title.split('“').nth(1).and_then(|t| t.split('”').next()).unwrap_or("");
            crate::agents::browser_gate::final_submit(label, Level::FullSend).is_some()
        } else {
            auto(Level::FullSend, false, tool, input, &c).is_none()
        };
        if asks {
            still += 1;
            println!("STILL ASKS: {tool} {}", card["title"]);
        }
    }
    println!("REPLAY {} cards -> {still} still ask", cards.len());
}
