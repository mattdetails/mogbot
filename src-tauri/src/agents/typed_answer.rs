//! "Approve it", typed: the user's own message answering the card in front
//! of them.
//!
//! When the user types a plain yes ("approve it", "yes do it", "allow") into
//! a chat with exactly one open card, that card is allowed as their answer,
//! and the chat says so ("Allowed from your message"). Before this, the
//! agent got the message, couldn't answer its own card, and said so.
//!
//! **Provenance.** Only the user's own send (`agents_send`, desk or phone)
//! reaches here. Text from another agent, a routine, an import or another
//! assistant goes through other paths and never answers a card. The match is
//! the whole message, so "don't approve it" or "approve it after lunch" is
//! a message, not an answer. Sign-ins, secrets, a session's question and an
//! import's own cards are never answered this way: each has its own control.

use super::store::Approval;

/// The note the chat gets.
pub const LINE: &str = "Allowed from your message";

/// Whole messages that say yes to the card in front of them.
const YES: &[&str] = &[
    "approve",
    "approve it",
    "approve that",
    "approve this",
    "approved",
    "allow",
    "allow it",
    "allow that",
    "allow this",
    "allowed",
    "accept",
    "accept it",
    "yes",
    "yes please",
    "yes do it",
    "yes approve it",
    "yes allow it",
    "yes go ahead",
    "yep",
    "yeah",
    "yeah do it",
    "do it",
    "go ahead",
    "go for it",
    "ok do it",
    "okay do it",
    "sure",
    "confirm",
    "confirmed",
    "ship it",
];

/// Whether the whole message is a plain yes.
pub fn approves(text: &str) -> bool {
    let cleaned: String = text
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
        .collect();
    let words: Vec<&str> = cleaned.split_whitespace().collect();
    let words: Vec<&str> = match words.as_slice() {
        // "approve it please", "yes, approve it pls"
        [rest @ .., "please" | "pls" | "plz" | "thanks"] if !rest.is_empty() => rest.to_vec(),
        _ => words,
    };
    YES.contains(&words.join(" ").as_str())
}

/// How long a typed yes stays an answer: past this (a message held,
/// queued or resent from a phone's outbox), it's a message, not an Allow.
pub const YES_FRESH_MS: i64 = 60_000;

/// How far a phone's clock may trail the Mac's and its yes still answer a
/// card asked just before it.
pub const CLOCK_GRACE_MS: i64 = 5_000;

/// Whether a yes written at `written` still answers at `now`. A clock a
/// little ahead (the phone's) still counts.
pub fn fresh(written: i64, now: i64) -> bool {
    now - written <= YES_FRESH_MS
}

/// The one card a typed yes answers: the only open card in the chat, and
/// one Allow can answer.
pub fn the_card(open: &[Approval]) -> Option<&Approval> {
    match open {
        [only]
            if only.login.is_none()
                && only.secret.is_none()
                && only.prompt.is_none()
                && only.connector.is_none()
                // Step in is a button on the desk, never a plain Allow.
                && only.step_in.is_none() =>
        {
            Some(only)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// CTO review 2026-11-14: a yes held, queued or restored from a phone's
    /// outbox could allow whatever card was open when it finally arrived.
    #[test]
    fn a_yes_answers_only_while_fresh() {
        let written = 1_000_000;
        assert!(fresh(written, written));
        assert!(fresh(written, written + YES_FRESH_MS));
        assert!(!fresh(written, written + YES_FRESH_MS + 1));
        // Hours later from an outbox: a message, never an Allow.
        assert!(!fresh(written, written + 3 * 60 * 60 * 1000));
        // A phone clock a little ahead of the Mac's still counts.
        assert!(fresh(written + 2_000, written));
    }

    #[test]
    fn a_plain_yes_is_an_answer_and_anything_else_is_a_message() {
        for t in [
            "Approve it",
            "approve it.",
            "Yes, do it!",
            "allow",
            "yes please",
            "Approve it please",
            "go ahead",
        ] {
            assert!(approves(t), "{t}");
        }
        for t in [
            "don't approve it",
            "approve it after lunch",
            "no",
            "why is it asking?",
            "approve the other one",
            "",
            "yes but change the name first",
        ] {
            assert!(!approves(t), "{t}");
        }
    }

    #[test]
    fn only_the_single_open_card_and_never_a_login_or_secret() {
        let card = |id: &str| {
            super::super::mcp::new_card(id.into(), "Change settings?".into(), "x".into(), None)
        };
        let one = vec![card("a")];
        assert_eq!(the_card(&one).map(|a| a.request_id.as_str()), Some("a"));
        assert!(the_card(&[card("a"), card("b")]).is_none());
        assert!(the_card(&[]).is_none());
        let mut secret = card("s");
        secret.secret = Some(super::super::secrets::Request {
            name: "FICTIONAL_KEY".into(),
            purpose: "x".into(),
            kind: super::super::secrets::Kind::ApiKey,
            fields: Vec::new(),
            reference: String::new(),
            quiet: false,
        });
        assert!(the_card(&[secret]).is_none());
    }
}
