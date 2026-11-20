use super::*;
use crate::agents::attachments::Attachment;

fn msg(id: &str, kind: MessageKind, text: &str) -> AgentMessage {
    serde_json::from_value(serde_json::json!({
        "id": id, "agentId": "a1", "ts": 1, "kind": match kind {
            MessageKind::User => "user", _ => "agent" }, "text": text
    }))
    .unwrap()
}

fn file(name: &str, mime: &str) -> Attachment {
    Attachment {
        name: name.into(),
        path: format!("attachments/x/{name}"),
        mime: mime.into(),
        size: 3,
    }
}

#[test]
fn a_message_is_quoted_by_who_said_it() {
    let log = vec![
        msg("m1", MessageKind::User, "Draft the intro"),
        msg("m2", MessageKind::Agent, "Here it is"),
    ];
    let mine = build(&log, "m1", "Lead Gen").unwrap();
    assert_eq!((mine.name.as_str(), mine.kind), ("you", ReplyKind::Message));
    let theirs = build(&log, "m2", "Lead Gen").unwrap();
    assert_eq!(theirs.name, "Lead Gen");
    assert_eq!(theirs.excerpt, "Here it is");
}

#[test]
fn an_unknown_id_is_no_reply() {
    assert!(build(&[msg("m1", MessageKind::User, "hi")], "nope", "x").is_none());
}

#[test]
fn every_kind_is_told_from_what_is_stored() {
    let mut image = msg("a", MessageKind::User, "");
    image.attachments = vec![file("shot.png", "image/png")];
    let mut doc = msg("b", MessageKind::User, "");
    doc.attachments = vec![file("intros.pdf", "application/pdf")];
    let link = msg("c", MessageKind::Agent, "https://www.example.com/a/b?x=1");
    let mut card = msg("d", MessageKind::Agent, "text the card shows");
    card.approval = Some(crate::agents::mcp::new_card(
        "r".into(),
        "Run a command".into(),
        "ls".into(),
        None,
    ));
    let with_text = {
        let mut m = msg("e", MessageKind::User, "see attached");
        m.attachments = vec![file("intros.pdf", "application/pdf")];
        m
    };
    let log = vec![image, doc, link, card, with_text];
    let k = |id: &str| build(&log, id, "A").map(|r| (r.kind, r.excerpt)).unwrap();
    assert_eq!(k("a"), (ReplyKind::Attachment, "shot.png".into()));
    assert_eq!(k("b"), (ReplyKind::File, "intros.pdf".into()));
    assert_eq!(k("c"), (ReplyKind::Link, "example.com".into()));
    assert_eq!(k("d"), (ReplyKind::Card, "Run a command".into()));
    // Words with a file are a message: the words are what was said.
    assert_eq!(k("e"), (ReplyKind::Message, "see attached".into()));
}

#[test]
fn an_excerpt_is_one_line_cut_on_a_word_within_200() {
    let long = "word ".repeat(80);
    let e = excerpt(&long);
    assert!(e.chars().count() <= EXCERPT_MAX, "{}", e.chars().count());
    assert!(e.ends_with("word…"), "{e}");
    assert_eq!(excerpt("a\n\n  b\tc"), "a b c");
    // A single huge word is cut where it must be.
    let huge = excerpt(&"x".repeat(500));
    assert_eq!(huge.chars().count(), EXCERPT_MAX);
    // Exactly at the limit is untouched.
    assert_eq!(
        excerpt(&"y".repeat(EXCERPT_MAX)).chars().count(),
        EXCERPT_MAX
    );
}

#[test]
fn the_reference_round_trips_and_is_camel_case() {
    let r = ReplyRef {
        id: "m1".into(),
        name: "you".into(),
        excerpt: "hi".into(),
        kind: ReplyKind::Link,
    };
    let v = serde_json::to_value(&r).unwrap();
    assert_eq!(
        v,
        serde_json::json!({ "id": "m1", "name": "you", "excerpt": "hi", "kind": "link" })
    );
    assert_eq!(serde_json::from_value::<ReplyRef>(v).unwrap(), r);
    // On a message: serialised `replyTo`, absent when none, and an old log reads fine.
    let mut m = msg("m2", MessageKind::User, "ok");
    assert!(serde_json::to_value(&m).unwrap().get("replyTo").is_none());
    m.reply_to = Some(r.clone());
    let v = serde_json::to_value(&m).unwrap();
    assert_eq!(v["replyTo"]["kind"], "link");
    assert_eq!(
        serde_json::from_value::<AgentMessage>(v).unwrap().reply_to,
        Some(r)
    );
    let old = r#"{"id":"o","agentId":"a1","ts":1,"kind":"user","text":"old"}"#;
    assert!(serde_json::from_str::<AgentMessage>(old)
        .unwrap()
        .reply_to
        .is_none());
}

#[test]
fn the_agent_is_told_who_and_what() {
    let r = ReplyRef {
        id: "m1".into(),
        name: "Lead Gen".into(),
        excerpt: "Here it is".into(),
        kind: ReplyKind::Message,
    };
    assert_eq!(prompt_line(&r), "Replying to Lead Gen: \"Here it is\"");
}
