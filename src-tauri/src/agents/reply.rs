//! Reply to a message: the whole-message version of quoting selected text.
//!
//! A send may name the message it answers (`replyTo`, its id). The Mac fills
//! the rest from the stored original, never from what the client says, so a
//! client can't make a message quote words that were never said. An id that
//! isn't in the log sends the message through with no reply. The agent is
//! told `Replying to <name>: "<excerpt>"` above the user's text
//! ([`prompt_line`]); the chat log keeps only the reference, so it is never
//! shown twice.

use serde::{Deserialize, Serialize};

use super::store::{AgentMessage, MessageKind};

/// The longest excerpt kept, in characters, the cut mark included.
pub const EXCERPT_MAX: usize = 200;

/// What kind of thing was replied to; the clients word it ("Attachment ·
/// name", "Link · domain").
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReplyKind {
    Message,
    Attachment,
    File,
    Link,
    Card,
}

/// The message a reply answers, as it was when the reply was sent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplyRef {
    /// The original's id.
    pub id: String,
    /// "you" for the user's own message, otherwise the agent's name.
    pub name: String,
    /// The original's text (at most [`EXCERPT_MAX`] characters, cut on a
    /// word); for an attachment, file or link its name or domain; for a
    /// card its title.
    pub excerpt: String,
    pub kind: ReplyKind,
}

/// `text` on one line, at most [`EXCERPT_MAX`] characters, cut on a word.
pub fn excerpt(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= EXCERPT_MAX {
        return flat;
    }
    let room = EXCERPT_MAX - 1;
    let head: String = flat.chars().take(room).collect();
    // Back to the last whole word, unless the first word alone is longer.
    let cut = match flat.chars().nth(room) {
        Some(c) if !c.is_whitespace() => head
            .rfind(' ')
            .map(|i| head[..i].to_string())
            .unwrap_or(head),
        _ => head,
    };
    format!("{}…", cut.trim_end())
}

/// The host of a lone URL, without `www.`; `None` when `text` is anything else.
fn domain_of(text: &str) -> Option<String> {
    let t = text.trim();
    if t.split_whitespace().count() != 1 {
        return None;
    }
    let rest = t
        .strip_prefix("https://")
        .or_else(|| t.strip_prefix("http://"))?;
    let host = rest.split(['/', '?', '#']).next()?.trim();
    let host = host.strip_prefix("www.").unwrap_or(host);
    (!host.is_empty()).then(|| host.to_string())
}

/// The reference to the message `id` in `log`, written by `agent_name`'s
/// chat; `None` for an id that isn't there.
pub fn build(log: &[AgentMessage], id: &str, agent_name: &str) -> Option<ReplyRef> {
    let m = log.iter().find(|m| m.id == id)?;
    let name = if m.kind == MessageKind::User {
        "you".to_string()
    } else {
        agent_name.to_string()
    };
    let (kind, said) = if let Some(card) = &m.result {
        (ReplyKind::Card, card.title.clone())
    } else if let Some(a) = &m.approval {
        (ReplyKind::Card, a.title.clone())
    } else if m.text.trim().is_empty() && !m.attachments.is_empty() {
        let first = &m.attachments[0];
        let kind = if first.mime.starts_with("image/") {
            ReplyKind::Attachment
        } else {
            ReplyKind::File
        };
        (kind, first.name.clone())
    } else if let Some(domain) = domain_of(&m.text) {
        (ReplyKind::Link, domain)
    } else {
        (ReplyKind::Message, m.text.clone())
    };
    Some(ReplyRef {
        id: m.id.clone(),
        name,
        excerpt: excerpt(&said),
        kind,
    })
}

/// What the agent is told above the user's words.
pub fn prompt_line(r: &ReplyRef) -> String {
    format!("Replying to {}: \"{}\"", r.name, r.excerpt)
}

#[cfg(test)]
#[path = "reply_tests.rs"]
mod tests;
