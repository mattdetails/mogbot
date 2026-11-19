//! The Mac's one WebSocket to the relay (docs/relay.md, "Mac ↔ relay").
//!
//! While the phone server is on: sign in (the relay's challenge, signed with
//! the identity key), then carry every phone's channel over the one socket.
//! A dropped link comes back with a capped, jittered backoff; a ping goes
//! every 10 s and 25 s of silence counts as dead; after the Mac wakes the
//! link is made again at once, since the old socket is almost always gone.

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message;

use super::super::Companion;
use super::channel::{self, Out};
use super::{crypto, mac_url, parse_account, Account, Command, Link};

/// A ping this often keeps the link (and the relay's view of it) alive.
#[cfg(not(test))]
pub const PING_EVERY: Duration = Duration::from_secs(10);
#[cfg(test)]
pub const PING_EVERY: Duration = Duration::from_millis(100);
/// Nothing at all from the relay for this long: the link is dead.
#[cfg(not(test))]
pub const DEAD_AFTER: Duration = Duration::from_secs(25);
#[cfg(test)]
pub const DEAD_AFTER: Duration = Duration::from_millis(450);
/// Connecting and each step of signing in must take no longer than this.
const STEP_TIMEOUT: Duration = Duration::from_secs(6);
/// The backoff between attempts, doubling from the first to the last.
const BACKOFF_MIN: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(8);
/// How often the wall clock is compared with the monotonic one, and how far
/// apart they must drift to mean the Mac slept.
const WAKE_TICK: Duration = Duration::from_secs(5);
const WOKE_AFTER: Duration = Duration::from_secs(15);
/// Channels at once (the relay allows 24; a few to spare for ones closing).
const MAX_CHANNELS: usize = 32;
/// Payloads queued for one channel before it's taken as stuck and closed.
const CHANNEL_QUEUE: usize = 256;
/// The largest message from the relay (a phone payload is at most 256 KiB).
const MAX_MESSAGE: usize = 1024 * 1024;

/// A resumable channel is acked every this many frames, each way.
const ACK_EVERY: u32 = 8;
/// Frames the relay hasn't acked, per channel, before the channel is let go.
const MAX_UNACKED_BYTES: usize = 4 * 1024 * 1024;
/// Longer than the relay keeps phones for a Mac that went (30 s), so channels
/// the relay has let go aren't held here.
const RESUME_KEEP: Duration = Duration::from_secs(40);

/// Where to sign in and what to serve HTTP from.
#[derive(Debug, Clone)]
pub struct Config {
    /// `wss://host` (or a local `ws://`).
    pub base: String,
    /// The loopback companion server, for HTTP over a channel. `None`: HTTP
    /// requests get a 404 (tests that don't start a server).
    pub port: Option<u16>,
}

/// Why a session ended.
#[derive(Debug, PartialEq, Eq)]
enum Ended {
    /// Asked to stop.
    Stopped,
    /// It had signed in, so the next attempt starts from the shortest wait.
    WasUp,
    /// It never got as far as ready.
    Failed,
    /// The Mac woke: reconnect now.
    Woke,
}

/// Keep the link to `cfg.base` until `stop` fires.
pub async fn run(c: Arc<Companion>, cfg: Config, link: Arc<Link>, mut stop: oneshot::Receiver<()>) {
    let mut backoff = BACKOFF_MIN;
    link.set_running();
    changed(&c);
    let mut chans = Chans::new();
    let mut lost: Option<Instant> = None;
    loop {
        // Channels kept across a blip are let go once the relay would have.
        if lost.is_some_and(|t| t.elapsed() > RESUME_KEEP) {
            chans.open.clear();
            lost = None;
        }
        let ended = session(&c, &cfg, &link, &mut stop, &mut chans).await;
        if ended != Ended::Failed {
            lost = Some(Instant::now());
        }
        if ended == Ended::Stopped {
            chans.open.clear();
            link.set_off();
            changed(&c);
            return;
        }
        if link.set_down() {
            tracing::info!(?ended, "[Relay] link down");
            changed(&c);
        }
        let wait = match ended {
            Ended::Stopped => return,
            Ended::Woke => Duration::ZERO,
            Ended::WasUp => {
                backoff = BACKOFF_MIN;
                jitter(backoff)
            }
            Ended::Failed => {
                let wait = jitter(backoff);
                backoff = (backoff * 2).min(BACKOFF_MAX);
                wait
            }
        };
        if wait.is_zero() {
            continue;
        }
        tokio::select! {
            _ = &mut stop => {
                link.set_off();
                changed(&c);
                return;
            }
            woke = sleep_or_wake(wait) => if woke {
                tracing::info!("[Relay] Mac woke; reconnecting now");
                backoff = BACKOFF_MIN;
            },
        }
    }
}

/// Between half and all of `d`, so many Macs dropped at once don't come
/// back in step.
fn jitter(d: Duration) -> Duration {
    let mut b = [0u8; 4];
    let r = if getrandom::getrandom(&mut b).is_ok() {
        u32::from_le_bytes(b)
    } else {
        u32::MAX / 2
    };
    let ms = d.as_millis() as u64;
    Duration::from_millis(ms / 2 + (r as u64 % (ms / 2 + 1)))
}

/// Sleep `d`, or less if the Mac wakes meanwhile (true).
async fn sleep_or_wake(d: Duration) -> bool {
    let until = Instant::now() + d;
    loop {
        let left = until.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return false;
        }
        if woke_during(left.min(WAKE_TICK)).await {
            return true;
        }
    }
}

/// Sleep `d` and say whether the wall clock moved far more than that (the
/// monotonic clock stops while the Mac sleeps).
async fn woke_during(d: Duration) -> bool {
    let before = SystemTime::now();
    tokio::time::sleep(d).await;
    let wall = SystemTime::now().duration_since(before).unwrap_or_default();
    wall >= d + WOKE_AFTER
}

/// The desk and the phones hear the routes changed.
fn changed(c: &Arc<Companion>) {
    c.backend.changed();
    let c = c.clone();
    tokio::spawn(async move {
        super::super::router::refresh_status(&c).await;
    });
}

type Ws =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// The next text message, within the step timeout.
async fn next_text(ws: &mut Ws) -> Option<String> {
    tokio::time::timeout(STEP_TIMEOUT, async {
        loop {
            match ws.next().await? {
                Ok(Message::Text(t)) => return Some(t),
                Ok(Message::Ping(_) | Message::Pong(_)) => continue,
                _ => return None,
            }
        }
    })
    .await
    .ok()?
}

/// Connect and sign in. `None` for anything short of `ready`; with it, the
/// account the relay has this Mac's key linked to.
async fn sign_in(c: &Companion, base: &str) -> Option<(Ws, String, Option<Account>, bool)> {
    let Some(identity) = c.registry.identity() else {
        tracing::warn!("[Relay] no identity key yet (Keychain locked?); trying again later");
        return None;
    };
    let fingerprint = identity.fingerprint();
    let url = mac_url(base, &fingerprint);
    let config = WebSocketConfig {
        max_message_size: Some(MAX_MESSAGE),
        max_frame_size: Some(MAX_MESSAGE),
        ..Default::default()
    };
    tls_ready();
    let connect = tokio_tungstenite::connect_async_with_config(&url, Some(config), false);
    let (mut ws, _) = match tokio::time::timeout(STEP_TIMEOUT, connect).await {
        Ok(Ok(ok)) => ok,
        Ok(Err(e)) => {
            tracing::debug!("[Relay] couldn't connect: {e}");
            return None;
        }
        Err(_) => {
            tracing::debug!("[Relay] connecting timed out");
            return None;
        }
    };
    let challenge: Value = serde_json::from_str(&next_text(&mut ws).await?).ok()?;
    if challenge["t"] != "challenge" {
        return None;
    }
    // Asks for the resumable framing; a relay that doesn't know it answers
    // `ready` without `resume` and everything stays as it was.
    let auth = crypto::login_auth(&identity, challenge["nonce"].as_str()?)?;
    let mut auth_v: Value = serde_json::from_str(&auth).ok()?;
    auth_v["resume"] = json!(1);
    let auth = auth_v.to_string();
    ws.send(Message::Text(auth)).await.ok()?;
    let ready: Value = serde_json::from_str(&next_text(&mut ws).await?).ok()?;
    if ready["t"] != "ready" {
        tracing::warn!("[Relay] the relay didn't accept this Mac's sign-in");
        return None;
    }
    let account = parse_account(&ready["account"]);
    let resume = ready["resume"] == true;
    Some((ws, fingerprint, account, resume))
}

struct Open {
    tx: mpsc::Sender<Vec<u8>>,
    generation: u64,
    /// Bytes queued for the channel and not yet taken.
    queued: Arc<AtomicUsize>,
    /// Resumable framing (docs/relay.md, "Resuming"): the sequence of the
    /// next payload to the phone, the frames the relay hasn't acked, how far
    /// they have been written to the current socket, and the last sequence
    /// taken from the phone.
    next: u32,
    sent_upto: u32,
    unacked: VecDeque<(u32, Vec<u8>)>,
    unacked_bytes: usize,
    rx: u32,
}

/// What outlives a socket: the channels and the queue their tasks write to.
struct Chans {
    open: HashMap<u32, Open>,
    generation: u64,
    out_tx: mpsc::Sender<Out>,
    out_rx: mpsc::Receiver<Out>,
}

impl Chans {
    fn new() -> Self {
        let (out_tx, out_rx) = mpsc::channel::<Out>(CHANNEL_QUEUE);
        Chans {
            open: HashMap::new(),
            generation: 0,
            out_tx,
            out_rx,
        }
    }
}

/// A resumable frame: channel, sequence, payload.
fn seq_frame(ch: u32, seq: u32, payload: &[u8]) -> Message {
    let mut data = Vec::with_capacity(payload.len() + 8);
    data.extend_from_slice(&ch.to_be_bytes());
    data.extend_from_slice(&seq.to_be_bytes());
    data.extend_from_slice(payload);
    Message::Binary(data)
}

fn ack_text(ch: u32, seq: u32) -> Message {
    Message::Text(json!({ "t": "ack", "ch": ch, "seq": seq }).to_string())
}

impl Open {
    fn new(tx: mpsc::Sender<Vec<u8>>, generation: u64, queued: Arc<AtomicUsize>) -> Self {
        Open {
            tx,
            generation,
            queued,
            next: 1,
            sent_upto: 0,
            unacked: VecDeque::new(),
            unacked_bytes: 0,
            rx: 0,
        }
    }

    /// The relay has everything up to `seq`.
    fn acked(&mut self, seq: u32) {
        while self.unacked.front().is_some_and(|(s, _)| *s <= seq) {
            if let Some((_, p)) = self.unacked.pop_front() {
                self.unacked_bytes -= p.len();
            }
        }
        self.sent_upto = self.sent_upto.max(seq);
    }


    /// Queue one payload for the channel; false when it's stuck (its queue
    /// full, or [`channel::MAX_QUEUED_BYTES`] already waiting).
    fn offer(&self, payload: Vec<u8>) -> bool {
        let n = payload.len();
        let before = self.queued.fetch_add(n, Ordering::SeqCst);
        if before + n > channel::MAX_QUEUED_BYTES || self.tx.try_send(payload).is_err() {
            self.queued.fetch_sub(n, Ordering::SeqCst);
            return false;
        }
        true
    }
}

async fn session(
    c: &Arc<Companion>,
    cfg: &Config,
    link: &Arc<Link>,
    stop: &mut oneshot::Receiver<()>,
    st: &mut Chans,
) -> Ended {
    let signed_in = tokio::select! {
        s = sign_in(c, &cfg.base) => s,
        _ = &mut *stop => return Ended::Stopped,
    };
    let Some((mut ws, fingerprint, account, resume)) = signed_in else {
        return Ended::Failed;
    };
    let (cmd_tx, mut commands) = mpsc::channel::<Command>(8);
    let linked = account.is_some();
    if link.set_up(&cfg.base, &fingerprint, account, cmd_tx) {
        tracing::info!(linked, resume, "[Relay] link up");
        changed(c);
    }

    // A relay that can't resume channels closed its phones when the old link
    // went: whatever was held here is for phones that are gone.
    // One that can is told what is held, and says what to carry on with.
    let mut awaiting = resume;
    if resume {
        let held: Vec<Value> = st
            .open
            .iter()
            .map(|(ch, o)| json!({ "ch": ch, "rx": o.rx }))
            .collect();
        let frame = json!({ "t": "resume", "chs": held }).to_string();
        if ws.send(Message::Text(frame)).await.is_err() {
            return Ended::WasUp;
        }
    } else {
        st.open.clear();
    }
    let mut last_heard = Instant::now();
    let up_since = Instant::now();
    let mut ping = tokio::time::interval_at(tokio::time::Instant::now() + PING_EVERY, PING_EVERY);
    let mut wake = tokio::time::interval(WAKE_TICK);
    wake.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut wall = SystemTime::now();
    let mut pending_delete: Option<oneshot::Sender<Result<(), String>>> = None;

    let ended = loop {
        tokio::select! {
            _ = &mut *stop => {
                let _ = ws.send(Message::Close(None)).await;
                break Ended::Stopped;
            }
            incoming = ws.next() => {
                last_heard = Instant::now();
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if text == "pong" || text == "ping" {
                            continue;
                        }
                        let Ok(v) = serde_json::from_str::<Value>(&text) else { continue };
                        if v["t"] == "accountDeleted" {
                            let ok = v["ok"].as_bool() == Some(true);
                            tracing::info!(ok, "[Relay] account delete answered");
                            if ok && link.set_account(None) {
                                changed(c);
                            }
                            if let Some(done) = pending_delete.take() {
                                let _ = done.send(if ok { Ok(()) } else { Err(delete_error(&v["error"])) });
                            }
                            continue;
                        }
                        if v["t"] == "account" {
                            let account = parse_account(&v["account"]);
                            let linked = account.is_some();
                            if link.set_account(account) {
                                tracing::info!(linked, "[Relay] the account changed");
                                changed(c);
                            }
                            continue;
                        }
                        if v["t"] == "resumed" && resume {
                            // What the relay holds for each channel decides what is sent
                            // again; a channel it doesn't name is gone.
                            let mut theirs: HashMap<u32, u32> = HashMap::new();
                            for e in v["chs"].as_array().into_iter().flatten() {
                                if let (Some(ch), Some(rx)) = (
                                    e["ch"].as_u64().and_then(|n| u32::try_from(n).ok()),
                                    e["rx"].as_u64().and_then(|n| u32::try_from(n).ok()),
                                ) {
                                    theirs.insert(ch, rx);
                                }
                            }
                            st.open.retain(|ch, _| theirs.contains_key(ch));
                            let mut failed = false;
                            let mut chs: Vec<u32> = st.open.keys().copied().collect();
                            chs.sort_unstable();
                            for ch in chs {
                                let Some(o) = st.open.get_mut(&ch) else { continue };
                                let rx = theirs[&ch];
                                o.acked(rx);
                                o.sent_upto = rx;
                                for (seq, payload) in o.unacked.iter() {
                                    if ws.send(seq_frame(ch, *seq, payload)).await.is_err() {
                                        failed = true;
                                        break;
                                    }
                                    o.sent_upto = *seq;
                                }
                                if failed {
                                    break;
                                }
                            }
                            awaiting = false;
                            if failed {
                                break Ended::WasUp;
                            }
                            continue;
                        }
                        if v["t"] == "ack" && resume {
                            if let (Some(ch), Some(seq)) = (
                                v["ch"].as_u64().and_then(|n| u32::try_from(n).ok()),
                                v["seq"].as_u64().and_then(|n| u32::try_from(n).ok()),
                            ) {
                                if let Some(o) = st.open.get_mut(&ch) {
                                    o.acked(seq);
                                }
                            }
                            continue;
                        }
                        let Some(ch) = v["ch"].as_u64().and_then(|n| u32::try_from(n).ok()) else { continue };
                        match v["t"].as_str() {
                            Some("open") => {
                                if st.open.len() >= MAX_CHANNELS {
                                    let _ = ws.send(close_text(ch)).await;
                                    continue;
                                }
                                st.generation += 1;
                                let (tx, rx) = mpsc::channel::<Vec<u8>>(CHANNEL_QUEUE);
                                let queued = Arc::new(AtomicUsize::new(0));
                                let inbound = channel::Inbound::new(rx, queued.clone());
                                // A number reused: the old one is gone.
                                st.open.insert(ch, Open::new(tx, st.generation, queued));
                                tokio::spawn(channel::run(c.clone(), ch, st.generation, cfg.port, inbound, st.out_tx.clone()));
                            }
                            Some("close") => {
                                st.open.remove(&ch);
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Binary(data))) => {
                        let header = if resume { 8 } else { 4 };
                        if data.len() < header {
                            continue;
                        }
                        let ch = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
                        let Some(o) = st.open.get_mut(&ch) else { continue };
                        if resume {
                            let seq = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
                            if seq <= o.rx {
                                continue; // sent again after the blip
                            }
                            if seq != o.rx + 1 {
                                // A hole: the channel's keys would be out of step.
                                st.open.remove(&ch);
                                let _ = ws.send(close_text(ch)).await;
                                continue;
                            }
                            o.rx = seq;
                            if seq % ACK_EVERY == 0 && ws.send(ack_text(ch, seq)).await.is_err() {
                                break Ended::WasUp;
                            }
                        }
                        if !o.offer(data[header..].to_vec()) {
                            // A phone sending faster than its channel is served.
                            st.open.remove(&ch);
                            let _ = ws.send(close_text(ch)).await;
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!(?frame, "[Relay] the relay closed the link");
                        break Ended::WasUp;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        // Info, not debug: the link drops every few minutes
                        // in real use and this is the only line that says why.
                        tracing::info!(secs = up_since.elapsed().as_secs(), "[Relay] link error: {e}");
                        break Ended::WasUp;
                    }
                    None => {
                        tracing::info!(secs = up_since.elapsed().as_secs(), "[Relay] the link ended with no close frame");
                        break Ended::WasUp;
                    }
                }
            }
            Some(out) = st.out_rx.recv() => match out {
                Out::Payload(ch, payload) => {
                    let Some(o) = st.open.get_mut(&ch) else { continue };
                    if resume {
                        // Kept until the relay acks it, so a socket that died
                        // under it doesn't lose it.
                        let seq = o.next;
                        o.next += 1;
                        o.unacked_bytes += payload.len();
                        if o.unacked_bytes > MAX_UNACKED_BYTES {
                            st.open.remove(&ch);
                            if ws.send(close_text(ch)).await.is_err() {
                                break Ended::WasUp;
                            }
                            continue;
                        }
                        if awaiting {
                            o.unacked.push_back((seq, payload));
                            continue;
                        }
                        let frame = seq_frame(ch, seq, &payload);
                        o.unacked.push_back((seq, payload));
                        if ws.send(frame).await.is_err() {
                            break Ended::WasUp;
                        }
                        o.sent_upto = seq;
                        continue;
                    }
                    let mut data = Vec::with_capacity(payload.len() + 4);
                    data.extend_from_slice(&ch.to_be_bytes());
                    data.extend_from_slice(&payload);
                    if ws.send(Message::Binary(data)).await.is_err() {
                        break Ended::WasUp;
                    }
                }
                Out::Authed(ch, generation) => {
                    if st.open.get(&ch).is_some_and(|o| o.generation == generation)
                        && ws.send(authed_text(ch)).await.is_err()
                    {
                        break Ended::WasUp;
                    }
                }
                Out::Ended(ch, generation) => {
                    // Still open on the relay's side: close the phone's socket.
                    if st.open.get(&ch).is_some_and(|o| o.generation == generation) {
                        st.open.remove(&ch);
                        if ws.send(close_text(ch)).await.is_err() {
                            break Ended::WasUp;
                        }
                    }
                }
            },
            Some(cmd) = commands.recv() => {
                let (frame, ack, unlink) = match cmd {
                    Command::LinkStart(code, ack) => (json!({ "t": "linkStart", "code": code }), ack, false),
                    Command::Unlink(ack) => (json!({ "t": "unlink" }), ack, true),
                    Command::DeleteAccount(done) => {
                        let frame = json!({ "t": "deleteAccount" }).to_string();
                        if ws.send(Message::Text(frame)).await.is_err() {
                            let _ = done.send(Err(super::NOT_CONNECTED.to_string()));
                            break Ended::WasUp;
                        }
                        // One at a time: a newer ask replaces an older one's wait.
                        pending_delete = Some(done);
                        continue;
                    }
                };
                let sent = ws.send(Message::Text(frame.to_string())).await.is_ok();
                if sent && unlink && link.set_account(None) {
                    // Gone at the relay with this frame: the desk says so now.
                    changed(c);
                }
                let _ = ack.send(sent);
                if !sent {
                    break Ended::WasUp;
                }
            }
            _ = ping.tick() => {
                if last_heard.elapsed() >= DEAD_AFTER {
                    tracing::info!("[Relay] nothing from the relay for {:?}; reconnecting", DEAD_AFTER);
                    break Ended::WasUp;
                }
                if ws.send(Message::Text("ping".into())).await.is_err() {
                    break Ended::WasUp;
                }
            }
            _ = wake.tick() => {
                let now = SystemTime::now();
                let gap = now.duration_since(wall).unwrap_or_default();
                wall = now;
                if gap >= WAKE_TICK + WOKE_AFTER {
                    break Ended::Woke;
                }
                if last_heard.elapsed() >= DEAD_AFTER {
                    tracing::info!("[Relay] nothing from the relay for {:?}; reconnecting", DEAD_AFTER);
                    break Ended::WasUp;
                }
            }
        }
    };
    // Without resume, every channel's sender goes: their tasks end, and each
    // socket handler sees its phone go. With it they are kept for the next
    // link (`run` lets them go if the relay stays away).
    if !resume || ended == Ended::Stopped {
        st.open.clear();
    }
    ended
}

/// What the desk says when the relay couldn't delete the account.
fn delete_error(code: &Value) -> String {
    match code.as_str() {
        Some("not_signed_in") => concat!("This ", crate::computer::noun!(), " isn't signed in.").into(),
        Some("unavailable") => {
            "Deleting accounts isn't available right now. Your account is still there; try again later.".into()
        }
        _ => "The sign-in service couldn't delete the account. It's still there; try again.".into(),
    }
}

/// Tells the relay this channel's phone proved its token, so it is never
/// the one let go when strangers fill the Mac's phone slots.
fn authed_text(ch: u32) -> Message {
    Message::Text(json!({ "t": "authed", "ch": ch }).to_string())
}

fn close_text(ch: u32) -> Message {
    Message::Text(json!({ "t": "close", "ch": ch }).to_string())
}

// ---- The app's link -----------------------------------------------------------

static RUNNING: LazyLock<Mutex<Option<oneshot::Sender<()>>>> = LazyLock::new(|| Mutex::new(None));

/// Start the app's link (idempotent) while the phone server is on at
/// `port`. Does nothing when this build has no relay.
pub fn start(c: Arc<Companion>, port: u16) {
    let Some(base) = super::relay_url() else {
        return;
    };
    let mut running = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
    if running.as_ref().is_some_and(|tx| !tx.is_closed()) {
        return;
    }
    let (tx, rx) = oneshot::channel();
    *running = Some(tx);
    tracing::info!(relay = %base, "[Relay] starting the link");
    let cfg = Config {
        base,
        port: Some(port),
    };
    tauri::async_runtime::spawn(run(c, cfg, super::LINK.clone(), rx));
}

/// Stop the app's link: the phone server went off.
pub fn stop() {
    let running = RUNNING.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(tx) = running {
        let _ = tx.send(());
    }
    super::LINK.set_off();
}

#[cfg(test)]
#[path = "client_tests.rs"]
mod tests;

/// Make sure rustls has a process-wide crypto provider before the first
/// `wss://` connection. Both `ring` and `aws-lc-rs` are in this build (other
/// crates bring them), and with two rustls refuses to choose and panics
/// inside the TLS handshake (1.0.5's relay link died that way on launch).
/// Installing ring once settles it; if something else already installed a
/// provider, that one stays.
pub fn tls_ready() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

#[cfg(test)]
mod tls_tests {
    /// The client config tokio-tungstenite builds for `wss://` must not
    /// panic for want of a provider (it did, in a release build).
    #[test]
    fn a_tls_client_config_can_be_built_after_tls_ready() {
        super::tls_ready();
        let roots = rustls::RootCertStore::empty();
        let config = rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        assert!(config.alpn_protocols.is_empty());
    }

    /// A real `wss://` connection the way the client makes one, to a live
    /// relay (`MOGBOT_RELAY_URL`). Off by default (network); run with
    /// `cargo test --lib relay_tls_live -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn relay_tls_live_phone_to_an_absent_mac_is_told_offline() {
        use futures_util::StreamExt;
        let base = std::env::var("MOGBOT_RELAY_URL").expect("MOGBOT_RELAY_URL");
        super::tls_ready();
        let url = format!(
            "{}/v1/phone/AAAAAAAAAAAAAAAAAAAAAA",
            base.trim_end_matches('/')
        );
        let (mut ws, _) = tokio_tungstenite::connect_async_with_config(&url, None, false)
            .await
            .expect("TLS connect to the relay");
        let mut code = None;
        while let Some(msg) = ws.next().await {
            if let Ok(tokio_tungstenite::tungstenite::Message::Close(Some(frame))) = msg {
                code = Some(u16::from(frame.code));
                break;
            }
        }
        assert_eq!(code, Some(4404));
    }
}
