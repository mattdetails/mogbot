//! Real push for paired phones, through Ship Studio's content-free relay
//! (`services/push-relay`; design and threat model in docs/push-relay.md).
//!
//! A phone in the background can't hear its socket, and only the holder of
//! the app's APNs key can wake it. That key lives in a Cloudflare Worker, not
//! in this binary. This Mac talks to the Worker with its own installation
//! secret and tells it only: which phone (an opaque handle), which kind of
//! alert, the agent's random id, and a badge count. The Worker refuses any
//! other field, and the words the phone shows are fixed there.
//!
//! - The phone hands its push token over with `devices.setPush`.
//! - The user turns it on in the Phone panel ("Phone notifications via Ship
//!   Studio's push service"). Off, the relay is told to forget this Mac.
//! - An alert the desk would post (`agents::notify`, which already applies
//!   mute, quiet hours, on-screen, at-the-desk and the per-turn coalescing)
//!   is also pushed to each phone that isn't in front: [`needs_push`]. The
//!   same alert goes over each open socket (`alerts.rs`).
//! - Only official builds: a self-built app has no push entitlement.
//! - A build with no relay URL compiled in (forks, dev) says "unavailable".

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::wire::{BuildKind, DevicePlatform};
use super::{Companion, DeviceRecord};
use crate::agents::notify::Limiter;
use crate::errors::CommandError;

/// Where the relay is: `links.pushRelay` in brand.json (none by default, so
/// push is off); this variable at run time overrides it (a local
/// `wrangler dev`). Not Ship Studio's `SHIPSTUDIO_PUSH_RELAY_URL`, so a value
/// set for Ship Studio never routes this app's pushes through its relay.
pub const RELAY_URL_VAR: &str = "APP_PUSH_RELAY_URL";

const RELAY_TIMEOUT: Duration = Duration::from_secs(10);

/// How long a just-backgrounded phone with an open socket is left to the
/// live notifier (`alerts.rs`) instead of a push. Zero on purpose: the app
/// asks iOS for no background time, so it is suspended within seconds of
/// leaving the screen while its socket still looks open from here (writes
/// into it succeed for minutes). An alert held back from the push in that
/// window would be read only when the app next opens. So a phone not in
/// front gets both; when it is still awake it posts the alert with the
/// card's words and takes the relay's content-free banner for that agent
/// back (`dismissPushFor` in notify.ts).
pub const LIVE_WINDOW_MS: u64 = 0;

// ============================================================================
// What is stored and said
// ============================================================================

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PushKind {
    /// An approval or a question: the agent is blocked on the user.
    NeedsYou,
    /// A turn ended with a reply the user would want.
    Finished,
    /// Something new outside a turn (a check-in firing).
    Message,
}

/// Which APNs a token belongs to. TestFlight and the App Store are production.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PushEnvironment {
    #[default]
    Production,
    Development,
}

/// A phone's push token, as it gave it, and whether the relay has it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PushToken {
    pub token: String,
    pub environment: PushEnvironment,
    #[serde(default)]
    pub registered: bool,
}

/// This Mac's credential at the relay. In companion.json (0600).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub id: String,
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct PushConfig {
    /// The Phone panel's toggle, as the user last set it. Read it through
    /// [`PushConfig::on`]: until the user has touched the toggle, push is on.
    pub enabled: bool,
    /// Whether the user ever set the toggle. Before 1.0.6 push started off
    /// and nobody found the switch, so a phone in a pocket heard nothing.
    pub user_set: bool,
    pub installation: Option<Installation>,
}

impl PushConfig {
    /// Whether pushes go out: the user's choice once made, else on.
    pub fn on(&self) -> bool {
        if self.user_set {
            self.enabled
        } else {
            true
        }
    }
}

/// `devices.setPush`'s answer: whether this phone will get pushes.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PushStatus {
    /// The relay has this phone; pushes go out while the app isn't in front.
    On,
    /// Saved, but the relay couldn't be reached yet; it's retried on the next alert.
    Pending,
    /// Turned off on the Mac.
    Off,
    /// This Mac's build has no push service (a fork or a development build).
    Unavailable,
    /// A self-built app: Apple gives it no push entitlement.
    SelfBuild,
}

/// What the Phone panel shows.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PushView {
    pub available: bool,
    pub enabled: bool,
}

/// One alert for one phone, before it is sent.
#[derive(Debug, Clone, PartialEq)]
pub struct PushAlert {
    pub agent_id: String,
    pub kind: PushKind,
    pub badge: u32,
}

/// The whole body of a send. The relay refuses anything more.
#[derive(Debug, Serialize, PartialEq)]
pub struct SendBody<'a> {
    pub device: &'a str,
    pub kind: PushKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<&'a str>,
    pub badge: u32,
}

/// The relay's agent field: opaque and URL-safe, or left out.
fn opaque(id: &str) -> Option<&str> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    ok.then_some(id)
}

// ============================================================================
// When a phone gets a push
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Presence {
    /// A socket is open with the app in front: it sees the change itself.
    Foreground,
    /// Sockets open, app in the background since this time (ms).
    Background { since: u64 },
    /// No socket.
    Away,
}

/// Away, or in the background for longer than the live notifier covers.
pub fn needs_push(presence: Presence, now: u64, live_window_ms: u64) -> bool {
    match presence {
        Presence::Foreground => false,
        Presence::Away => true,
        Presence::Background { since } => now.saturating_sub(since) >= live_window_ms,
    }
}

// ============================================================================
// The relay, and the notifier on top of it
// ============================================================================

#[derive(Debug, Clone, PartialEq)]
pub enum RelayError {
    /// The provider says the token is dead; the relay has dropped it.
    Gone,
    /// The relay doesn't know this phone.
    UnknownDevice,
    /// The installation secret was refused (the relay forgot this Mac).
    Unauthorized,
    /// Anything else: offline, rate limited, not configured, a provider error.
    Unavailable(String),
}

/// The relay's HTTP API, as a seam for tests.
#[async_trait]
pub trait Relay: Send + Sync {
    async fn create_installation(&self) -> Result<Installation, RelayError>;
    async fn register(
        &self,
        installation: &Installation,
        device: &str,
        platform: DevicePlatform,
        token: &PushToken,
    ) -> Result<(), RelayError>;
    async fn unregister(&self, installation: &Installation, device: &str)
        -> Result<(), RelayError>;
    async fn forget(&self, installation: &Installation) -> Result<(), RelayError>;
    async fn send(
        &self,
        installation: &Installation,
        body: &SendBody<'_>,
    ) -> Result<(), RelayError>;
}

/// How a delivery went, in the ways the caller acts on.
#[derive(Debug, Clone, PartialEq)]
pub enum Delivery {
    Sent,
    NotReachable,
    /// The phone's token is dead: forget it until the phone sends a new one.
    TokenGone,
    /// The relay no longer knows this Mac: start a new installation.
    Forgotten,
}

/// The swappable notifier from docs/mobile.md, "Notifications".
#[async_trait]
pub trait Notifier: Send + Sync {
    fn id(&self) -> &'static str;
    async fn deliver(&self, device: &DeviceRecord, alert: &PushAlert) -> Delivery;
}

/// Push through the relay (APNs on iOS, FCM on Android when the relay has it).
pub struct ApnsPush<'a> {
    pub relay: &'a dyn Relay,
    pub installation: &'a Installation,
}

#[async_trait]
impl Notifier for ApnsPush<'_> {
    fn id(&self) -> &'static str {
        "relay-apns"
    }

    async fn deliver(&self, device: &DeviceRecord, alert: &PushAlert) -> Delivery {
        let body = SendBody {
            device: &device.id,
            kind: alert.kind,
            agent: opaque(&alert.agent_id),
            badge: alert.badge,
        };
        match self.relay.send(self.installation, &body).await {
            Ok(()) => Delivery::Sent,
            Err(RelayError::Gone | RelayError::UnknownDevice) => Delivery::TokenGone,
            Err(RelayError::Unauthorized) => Delivery::Forgotten,
            Err(RelayError::Unavailable(why)) => {
                tracing::info!("[Companion] push not delivered: {why}");
                Delivery::NotReachable
            }
        }
    }
}

/// What a relay answer that isn't a success means to this Mac.
fn classify(code: u16, body: &str) -> RelayError {
    match code {
        401 => RelayError::Unauthorized,
        404 => RelayError::UnknownDevice,
        410 => RelayError::Gone,
        _ => RelayError::Unavailable(format!(
            "push service answered {}",
            refusal_words(code, body)
        )),
    }
}

/// "502 provider (Apple: ExpiredProviderToken)": the status, the relay's error word and the
/// provider's own reason when it passed one. Only plain words are read out of the body, so
/// nothing that could be content or a token is ever logged.
fn refusal_words(code: u16, body: &str) -> String {
    let word = |v: &serde_json::Value, k: &str| {
        v.get(k)
            .and_then(|x| x.as_str())
            .filter(|s| {
                (2..=48).contains(&s.len())
                    && s.bytes().all(|b| b.is_ascii_alphabetic() || b == b'_')
            })
            .map(str::to_string)
    };
    let v: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
    let mut out = code.to_string();
    if let Some(e) = word(&v, "error") {
        out.push(' ');
        out.push_str(&e);
    }
    if let Some(r) = word(&v, "reason") {
        out.push_str(&format!(" (provider: {r})"));
    }
    out
}

/// The relay over HTTPS.
pub struct HttpRelay {
    base: String,
    client: reqwest::Client,
}

impl HttpRelay {
    pub fn new(base: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(RELAY_TIMEOUT)
            .build()
            .unwrap_or_default();
        HttpRelay {
            base: base.trim_end_matches('/').to_string(),
            client,
        }
    }

    async fn call(
        &self,
        method: reqwest::Method,
        path: &str,
        installation: Option<&Installation>,
        body: Option<serde_json::Value>,
    ) -> Result<reqwest::Response, RelayError> {
        let mut req = self.client.request(method, format!("{}{path}", self.base));
        if let Some(i) = installation {
            req = req.bearer_auth(format!("{}.{}", i.id, i.secret));
        }
        if let Some(body) = body {
            req = req.json(&body);
        }
        let res = req
            .send()
            .await
            .map_err(|e| RelayError::Unavailable(format!("push service unreachable: {e}")))?;
        let code = res.status().as_u16();
        if (200..=299).contains(&code) {
            return Ok(res);
        }
        // Why it said no, read off its plain-word body (`error`, and Apple's `reason`):
        // logged so "no notifications" can be traced to the step that failed.
        let body = res.text().await.unwrap_or_default();
        let err = classify(code, &body);
        tracing::info!(
            status = code,
            why = %refusal_words(code, &body),
            "[Companion] push service refused {path}"
        );
        Err(err)
    }
}

#[async_trait]
impl Relay for HttpRelay {
    async fn create_installation(&self) -> Result<Installation, RelayError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Created {
            installation_id: String,
            secret: String,
        }
        let res = self
            .call(reqwest::Method::POST, "/v1/installations", None, None)
            .await?;
        let c: Created = res
            .json()
            .await
            .map_err(|e| RelayError::Unavailable(format!("push service reply: {e}")))?;
        Ok(Installation {
            id: c.installation_id,
            secret: c.secret,
        })
    }

    async fn register(
        &self,
        installation: &Installation,
        device: &str,
        platform: DevicePlatform,
        token: &PushToken,
    ) -> Result<(), RelayError> {
        let body = serde_json::json!({
            "platform": platform,
            "token": token.token,
            "environment": token.environment,
        });
        self.call(
            reqwest::Method::PUT,
            &format!("/v1/devices/{device}"),
            Some(installation),
            Some(body),
        )
        .await
        .map(drop)
    }

    async fn unregister(
        &self,
        installation: &Installation,
        device: &str,
    ) -> Result<(), RelayError> {
        self.call(
            reqwest::Method::DELETE,
            &format!("/v1/devices/{device}"),
            Some(installation),
            None,
        )
        .await
        .map(drop)
    }

    async fn forget(&self, installation: &Installation) -> Result<(), RelayError> {
        self.call(
            reqwest::Method::DELETE,
            "/v1/installation",
            Some(installation),
            None,
        )
        .await
        .map(drop)
    }

    async fn send(
        &self,
        installation: &Installation,
        body: &SendBody<'_>,
    ) -> Result<(), RelayError> {
        let body = serde_json::to_value(body).unwrap_or_default();
        self.call(
            reqwest::Method::POST,
            "/v1/send",
            Some(installation),
            Some(body),
        )
        .await
        .map(drop)
    }
}

/// The relay URL this build was given, if any. Only HTTPS, or plain HTTP to
/// this Mac for a local `wrangler dev`.
pub fn relay_url() -> Option<String> {
    let url = std::env::var(RELAY_URL_VAR)
        .ok()
        .or_else(|| crate::brand::links::PUSH_RELAY.map(str::to_string))?;
    let ok = url.starts_with("https://")
        || url.starts_with("http://127.0.0.1:")
        || url.starts_with("http://localhost:");
    ok.then_some(url)
}

// ============================================================================
// The companion's push service
// ============================================================================

pub struct Push {
    relay: Mutex<Option<Arc<dyn Relay>>>,
    /// Bursts across agents, as at the desk: a few pushes, then quiet a while.
    limiter: Mutex<Limiter>,
}

impl Default for Push {
    fn default() -> Self {
        Push {
            relay: Mutex::new(
                relay_url().map(|url| Arc::new(HttpRelay::new(url)) as Arc<dyn Relay>),
            ),
            limiter: Mutex::new(Limiter::default()),
        }
    }
}

impl Push {
    /// Tests: a fake relay, or none.
    pub fn set_relay(&self, relay: Option<Arc<dyn Relay>>) {
        *self.relay.lock().unwrap_or_else(|e| e.into_inner()) = relay;
    }

    fn relay(&self) -> Option<Arc<dyn Relay>> {
        self.relay.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn view(&self, c: &Companion) -> PushView {
        PushView {
            available: self.relay().is_some(),
            enabled: c.registry.read(|s| s.push.on()),
        }
    }
}

/// The installation, created at the relay the first time it's needed.
async fn installation(c: &Companion, relay: &dyn Relay) -> Result<Installation, RelayError> {
    if let Some(i) = c.registry.read(|s| s.push.installation.clone()) {
        return Ok(i);
    }
    let created = relay.create_installation().await?;
    c.registry
        .write(|s| s.push.installation = Some(created.clone()))
        .map_err(|e| RelayError::Unavailable(e.to_string()))?;
    Ok(created)
}

fn set_registered(c: &Companion, device_id: &str, registered: bool) {
    let _ = c.registry.write(|s| {
        if let Some(t) = s
            .devices
            .iter_mut()
            .find(|d| d.id == device_id)
            .and_then(|d| d.push.as_mut())
        {
            t.registered = registered;
        }
    });
}

/// The relay forgot this Mac: drop the installation; every phone re-registers.
fn forgotten(c: &Companion) {
    let _ = c.registry.write(|s| {
        s.push.installation = None;
        for t in s.devices.iter_mut().filter_map(|d| d.push.as_mut()) {
            t.registered = false;
        }
    });
}

/// Make sure the relay has this phone's current token.
async fn register(c: &Companion, relay: &dyn Relay, device: &DeviceRecord) -> bool {
    let Some(token) = &device.push else {
        return false;
    };
    if token.registered {
        return true;
    }
    let result = match installation(c, relay).await {
        Ok(i) => relay.register(&i, &device.id, device.platform, token).await,
        Err(e) => Err(e),
    };
    match result {
        Ok(()) => {
            set_registered(c, &device.id, true);
            tracing::info!(
                device = %device.id,
                environment = ?token.environment,
                "[Companion] push token registered with the push service"
            );
            true
        }
        Err(RelayError::Unauthorized) => {
            forgotten(c);
            false
        }
        Err(e) => {
            tracing::info!("[Companion] push registration failed: {e:?}");
            false
        }
    }
}

fn status_for(c: &Companion, device: &DeviceRecord, registered: bool) -> PushStatus {
    if device.build == BuildKind::SelfBuilt {
        PushStatus::SelfBuild
    } else if c.push.relay().is_none() {
        PushStatus::Unavailable
    } else if !c.registry.read(|s| s.push.on()) || device.push.is_none() {
        PushStatus::Off
    } else if registered {
        PushStatus::On
    } else {
        PushStatus::Pending
    }
}

/// An APNs device token is hex; an FCM token is longer and URL-safe. Either
/// way: short, and nothing that could become a path or a header.
fn valid_token(token: &str) -> bool {
    (16..=1024).contains(&token.len())
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b':'))
}

/// `devices.setPush`: keep the phone's token (or forget it, for `None`) and
/// register it with the relay when push is on.
pub async fn set_push(
    c: &Companion,
    device_id: &str,
    token: Option<String>,
    environment: PushEnvironment,
) -> Result<PushStatus, CommandError> {
    let Some(before) = c.registry.get(device_id) else {
        return Err(CommandError::expected("This phone isn't paired any more."));
    };
    if before.build == BuildKind::SelfBuilt {
        return Ok(PushStatus::SelfBuild);
    }
    let next = match token {
        None => None,
        Some(t) if valid_token(&t) => Some(t),
        Some(_) => return Err(CommandError::expected("That isn't a push token.")),
    };
    let unchanged = match (&before.push, &next) {
        (Some(old), Some(new)) => old.token == *new && old.environment == environment,
        (None, None) => true,
        _ => false,
    };
    if !unchanged {
        let clearing = next.is_none();
        c.registry.write(|s| {
            if let Some(d) = s.devices.iter_mut().find(|d| d.id == device_id) {
                d.push = next.map(|token| PushToken {
                    token,
                    environment,
                    registered: false,
                });
            }
        })?;
        if clearing {
            forget_device(c, &before).await;
        }
    }
    let device = c.registry.get(device_id).unwrap_or(before);
    let enabled = c.registry.read(|s| s.push.on());
    let registered = match (c.push.relay(), enabled) {
        (Some(relay), true) => register(c, relay.as_ref(), &device).await,
        _ => false,
    };
    Ok(status_for(c, &device, registered))
}

/// The Phone panel's toggle. On: create the installation and register every
/// phone's token. Off: tell the relay to forget this Mac entirely.
pub async fn set_enabled(c: &Companion, enabled: bool) -> Result<(), CommandError> {
    let Some(relay) = c.push.relay() else {
        return Err(CommandError::expected(
            "This build of the app has no push service.",
        ));
    };
    c.registry.write(|s| {
        s.push.enabled = enabled;
        s.push.user_set = true;
    })?;
    if enabled {
        installation(c, relay.as_ref()).await.map_err(|e| {
            CommandError::expected(format!("Couldn't reach the push service ({e:?})."))
        })?;
        for d in c.registry.devices() {
            register(c, relay.as_ref(), &d).await;
        }
    } else if let Some(i) = c.registry.read(|s| s.push.installation.clone()) {
        // Forgotten here either way. If the relay couldn't be told, it keeps
        // this Mac's tokens (and nothing else) until a provider rejects them.
        if let Err(e) = relay.forget(&i).await {
            tracing::debug!("[Companion] push service not told to forget: {e:?}");
        }
        forgotten(c);
    }
    Ok(())
}

/// A phone was removed or forgot this Mac: drop its token at the relay.
pub async fn forget_device(c: &Companion, device: &DeviceRecord) {
    let (Some(relay), Some(i)) = (
        c.push.relay(),
        c.registry.read(|s| s.push.installation.clone()),
    ) else {
        return;
    };
    if device.push.as_ref().is_some_and(|t| t.registered) {
        let _ = relay.unregister(&i, &device.id).await;
    }
}

/// Push one alert to every phone that should hear it. Returns the ids sent to.
pub async fn deliver_all(c: &Companion, alert: &PushAlert, now: u64) -> Vec<String> {
    let on = c.registry.read(|s| s.enabled && s.push.on());
    let Some(relay) = c.push.relay().filter(|_| on) else {
        return Vec::new();
    };
    let devices = c.registry.devices();
    // Why a paired phone gets no push for this alert, one line each, so
    // "I never get notifications" can be read off the log.
    for d in &devices {
        let why = if d.build != BuildKind::Official {
            Some("a self-built app (no push)")
        } else if d.push.is_none() {
            Some("the phone never sent a push token")
        } else {
            match c.presence_at(&d.id, now) {
                Presence::Foreground => Some("the app is in front on it"),
                p if !needs_push(p, now, LIVE_WINDOW_MS) => {
                    Some("it went to the background moments ago")
                }
                _ => None,
            }
        };
        if let Some(why) = why {
            tracing::info!(device = %d.id, kind = ?alert.kind, why, "[Companion] no push");
        }
    }
    let targets: Vec<DeviceRecord> = devices
        .into_iter()
        .filter(|d| d.push.is_some() && d.build == BuildKind::Official)
        .filter(|d| needs_push(c.presence_at(&d.id, now), now, LIVE_WINDOW_MS))
        .collect();
    if targets.is_empty() {
        return Vec::new();
    }
    // Five agents finishing at once is one glance, not five banners: the burst cap holds
    // back finished and message alerts. An agent blocked on the user is never held (the
    // live notifier lets an approval through the same way), and a held one says so.
    if alert.kind != PushKind::NeedsYou
        && !c
            .push
            .limiter
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .allow(Instant::now())
    {
        tracing::info!(kind = ?alert.kind, "[Companion] no push: held back (three in 20 seconds)");
        return Vec::new();
    }
    let mut sent = Vec::new();
    for device in targets {
        if !register(c, relay.as_ref(), &device).await {
            tracing::info!(
                device = %device.id,
                kind = ?alert.kind,
                "[Companion] no push: the push service doesn't have this phone's token (see the line above)"
            );
            continue;
        }
        let Some(i) = c.registry.read(|s| s.push.installation.clone()) else {
            continue;
        };
        let notifier = ApnsPush {
            relay: relay.as_ref(),
            installation: &i,
        };
        let delivery = notifier.deliver(&device, alert).await;
        // One line per push (never its token), so a missed notification can be traced.
        tracing::info!(
            device = %device.id,
            kind = ?alert.kind,
            outcome = match delivery {
                Delivery::Sent => "sent",
                Delivery::NotReachable => "push service unreachable",
                Delivery::TokenGone => "token gone (Apple refused it; the phone must send a new one)",
                Delivery::Forgotten => "installation forgotten",
            },
            "[Companion] push"
        );
        match delivery {
            Delivery::Sent => sent.push(device.id.clone()),
            Delivery::NotReachable => {}
            Delivery::TokenGone => {
                let _ = c.registry.write(|s| {
                    if let Some(d) = s.devices.iter_mut().find(|d| d.id == device.id) {
                        d.push = None;
                    }
                });
            }
            Delivery::Forgotten => forgotten(c),
        }
    }
    sent
}

/// The hook in `agents::notify`: an alert the desk decided on. Pushed in the
/// background; never holds up the desk's own notification.
pub fn raise(agent_id: &str, kind: PushKind) {
    let Some(c) = super::desktop::get() else {
        return;
    };
    if !c.registry.read(|s| s.enabled && s.push.on()) {
        return;
    }
    let badge = crate::agents::store::list()
        .map(|agents| crate::agents::notify::badge_now(&agents))
        .unwrap_or(0);
    let alert = PushAlert {
        agent_id: agent_id.to_string(),
        kind,
        badge: u32::try_from(badge).unwrap_or(0),
    };
    tauri::async_runtime::spawn(async move {
        deliver_all(&c, &alert, super::now_ms()).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::companion::testkit::Stub;
    use crate::companion::wire::PairDevice;
    use crate::companion::FOREGROUND_STALE_MS;

    #[derive(Default)]
    struct FakeRelay {
        calls: Mutex<Vec<String>>,
        bodies: Mutex<Vec<serde_json::Value>>,
        send_error: Mutex<Option<RelayError>>,
    }

    impl FakeRelay {
        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
        fn log(&self, s: String) {
            self.calls.lock().unwrap().push(s);
        }
    }

    #[async_trait]
    impl Relay for FakeRelay {
        async fn create_installation(&self) -> Result<Installation, RelayError> {
            self.log("create".into());
            Ok(Installation {
                id: "in_test".into(),
                secret: "s".into(),
            })
        }
        async fn register(
            &self,
            _: &Installation,
            device: &str,
            _: DevicePlatform,
            token: &PushToken,
        ) -> Result<(), RelayError> {
            self.log(format!("register {device} {}", token.token));
            Ok(())
        }
        async fn unregister(&self, _: &Installation, device: &str) -> Result<(), RelayError> {
            self.log(format!("unregister {device}"));
            Ok(())
        }
        async fn forget(&self, _: &Installation) -> Result<(), RelayError> {
            self.log("forget".into());
            Ok(())
        }
        async fn send(&self, _: &Installation, body: &SendBody<'_>) -> Result<(), RelayError> {
            self.log(format!("send {}", body.device));
            self.bodies
                .lock()
                .unwrap()
                .push(serde_json::to_value(body).unwrap());
            match self.send_error.lock().unwrap().take() {
                Some(e) => Err(e),
                None => Ok(()),
            }
        }
    }

    const TOKEN: &str = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
    const AGENT_ID: &str = "0123456789abcdef0123456789abcdef";

    fn setup(build: BuildKind) -> (Arc<Companion>, Arc<FakeRelay>, String) {
        let (c, _stub) = Stub::companion();
        let relay = Arc::new(FakeRelay::default());
        c.push.set_relay(Some(relay.clone()));
        c.registry.write(|s| s.enabled = true).unwrap();
        let (record, _, _) = c
            .registry
            .add(
                &PairDevice {
                    name: "Phone".into(),
                    platform: DevicePlatform::Ios,
                    model: None,
                    app_version: "1.0.0".into(),
                    build,
                },
                String::new(),
                1,
                &[],
                None,
            )
            .unwrap();
        (c, relay, record.id)
    }

    fn alert(kind: PushKind) -> PushAlert {
        PushAlert {
            agent_id: AGENT_ID.into(),
            kind,
            badge: 2,
        }
    }

    #[test]
    fn only_a_phone_that_cant_see_it_gets_a_push() {
        assert!(!needs_push(Presence::Foreground, 100, 0));
        assert!(needs_push(Presence::Away, 100, 25_000));
        assert!(!needs_push(
            Presence::Background { since: 90_000 },
            100_000,
            25_000
        ));
        assert!(needs_push(
            Presence::Background { since: 70_000 },
            100_000,
            25_000
        ));
    }

    #[test]
    fn the_send_body_is_the_relays_whole_contract() {
        let body = SendBody {
            device: "dev_1",
            kind: PushKind::NeedsYou,
            agent: opaque(AGENT_ID),
            badge: 3,
        };
        assert_eq!(
            serde_json::to_value(&body).unwrap(),
            serde_json::json!({ "device": "dev_1", "kind": "needs_you", "agent": AGENT_ID, "badge": 3 })
        );
        assert_eq!(opaque("Finance agent"), None, "never a name");
        assert_eq!(opaque(&"a".repeat(65)), None);
    }

    /// A phone on the relay that was in front and then went silent (the app
    /// suspended, the phone left): nothing tells the Mac the channel is dead,
    /// so only its silence can. Before this it stayed "in front" for good and
    /// was never pushed (call issue 8: no push for a phone without Tailscale).
    #[tokio::test]
    async fn a_phone_that_was_in_front_and_went_silent_is_pushed() {
        let (c, relay, id) = setup(BuildKind::Official);
        set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        let conn = c.open_conn(&id, true).unwrap();
        let t0 = super::super::now_ms();
        assert_eq!(c.presence_at(&id, t0), Presence::Foreground);
        // Just heard from: in front, so no push.
        assert!(deliver_all(&c, &alert(PushKind::NeedsYou), t0 + 20_000)
            .await
            .is_empty());
        // It pings while in front: still in front a minute on.
        c.heard_from(conn);
        let heard = super::super::now_ms();
        assert_eq!(c.presence_at(&id, heard + 20_000), Presence::Foreground);
        // Silent for three heartbeats: not in front any more, and pushed.
        let later = heard + FOREGROUND_STALE_MS + 1;
        assert!(matches!(
            c.presence_at(&id, later),
            Presence::Background { .. }
        ));
        let sent = deliver_all(&c, &alert(PushKind::NeedsYou), later).await;
        assert_eq!(sent, vec![id.clone()]);
        assert!(relay.calls().iter().any(|l| l == &format!("send {id}")));
        c.close_conn(conn);
    }

    #[tokio::test]
    async fn on_until_the_user_turns_it_off_then_off_until_on() {
        let (c, relay, id) = setup(BuildKind::Official);
        // Never touched: a phone's token registers at once.
        let status = set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        assert_eq!(status, PushStatus::On);
        assert_eq!(
            relay.calls(),
            vec!["create".to_string(), format!("register {id} {TOKEN}")]
        );
        let again = set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        assert_eq!(again, PushStatus::On);
        assert_eq!(relay.calls().len(), 2, "an unchanged token isn't re-sent");

        // The user's Off sticks, and nothing goes out while it's off.
        set_enabled(&c, false).await.unwrap();
        assert!(!c.registry.read(|s| s.push.on()));
        let before = relay.calls().len();
        assert!(deliver_all(&c, &alert(PushKind::NeedsYou), 10)
            .await
            .is_empty());
        assert_eq!(
            relay.calls().len(),
            before,
            "nothing leaves the Mac while it's off"
        );
        set_enabled(&c, true).await.unwrap();
        assert!(c.registry.read(|s| s.push.on()));
    }

    #[test]
    fn a_saved_config_from_before_reads_as_on_until_the_user_chose() {
        let old: PushConfig = serde_json::from_str(r#"{"enabled":false}"#).unwrap();
        assert!(old.on());
        let chose_off: PushConfig =
            serde_json::from_str(r#"{"enabled":false,"userSet":true}"#).unwrap();
        assert!(!chose_off.on());
    }

    #[tokio::test]
    async fn pushes_only_to_phones_not_in_front() {
        let (c, relay, id) = setup(BuildKind::Official);
        set_enabled(&c, true).await.unwrap();
        set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();

        let conn = c.open_conn(&id, true).unwrap();
        assert!(deliver_all(&c, &alert(PushKind::Finished), 10)
            .await
            .is_empty());
        c.set_foreground(conn, false);
        assert_eq!(
            deliver_all(&c, &alert(PushKind::Finished), 10).await,
            vec![id.clone()]
        );
        c.close_conn(conn);
        assert_eq!(
            deliver_all(&c, &alert(PushKind::NeedsYou), 10).await,
            vec![id.clone()]
        );
        assert_eq!(
            relay.bodies.lock().unwrap().last().unwrap(),
            &serde_json::json!({ "device": id, "kind": "needs_you", "agent": AGENT_ID, "badge": 2 })
        );
    }

    #[tokio::test]
    async fn phone_access_or_push_off_sends_nothing() {
        let (c, relay, id) = setup(BuildKind::Official);
        set_enabled(&c, true).await.unwrap();
        set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        c.registry.write(|s| s.enabled = false).unwrap();
        assert!(deliver_all(&c, &alert(PushKind::Message), 1)
            .await
            .is_empty());
        c.registry.write(|s| s.enabled = true).unwrap();
        set_enabled(&c, false).await.unwrap();
        assert!(relay.calls().contains(&"forget".to_string()));
        assert!(deliver_all(&c, &alert(PushKind::Message), 1)
            .await
            .is_empty());
        assert!(c.registry.read(|s| s.push.installation.is_none()));
    }

    #[tokio::test]
    async fn a_self_built_app_is_told_why() {
        let (c, relay, id) = setup(BuildKind::SelfBuilt);
        set_enabled(&c, true).await.unwrap();
        let status = set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Development)
            .await
            .unwrap();
        assert_eq!(status, PushStatus::SelfBuild);
        assert!(!relay.calls().iter().any(|c| c.starts_with("register")));
    }

    #[tokio::test]
    async fn a_dead_token_is_dropped_and_a_forgotten_mac_starts_over() {
        let (c, relay, id) = setup(BuildKind::Official);
        set_enabled(&c, true).await.unwrap();
        set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        *relay.send_error.lock().unwrap() = Some(RelayError::Gone);
        deliver_all(&c, &alert(PushKind::Finished), 1).await;
        assert!(c.registry.get(&id).unwrap().push.is_none());

        set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        *relay.send_error.lock().unwrap() = Some(RelayError::Unauthorized);
        deliver_all(&c, &alert(PushKind::Finished), 1).await;
        assert!(c.registry.read(|s| s.push.installation.is_none()));
        assert!(!c.registry.get(&id).unwrap().push.unwrap().registered);
    }

    #[tokio::test]
    async fn forgetting_a_token_unregisters_it_and_junk_is_refused() {
        let (c, relay, id) = setup(BuildKind::Official);
        set_enabled(&c, true).await.unwrap();
        set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        let status = set_push(&c, &id, None, PushEnvironment::Production)
            .await
            .unwrap();
        assert_eq!(status, PushStatus::Off);
        assert!(relay.calls().contains(&format!("unregister {id}")));
        assert!(
            set_push(&c, &id, Some("../../x".into()), PushEnvironment::Production)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn without_a_relay_the_phone_hears_unavailable() {
        let (c, _relay, id) = setup(BuildKind::Official);
        c.push.set_relay(None);
        let status = set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        assert_eq!(status, PushStatus::Unavailable);
        assert!(set_enabled(&c, true).await.is_err());
    }

    #[test]
    fn a_refusal_is_read_into_plain_words_and_nothing_else() {
        assert_eq!(
            refusal_words(
                502,
                r#"{"error":"provider","status":403,"reason":"ExpiredProviderToken"}"#
            ),
            "502 provider (provider: ExpiredProviderToken)"
        );
        assert_eq!(
            refusal_words(503, r#"{"error":"unconfigured","platform":"ios"}"#),
            "503 unconfigured"
        );
        // Free text, a token-looking string or junk never reaches the log.
        assert_eq!(
            refusal_words(500, r#"{"error":"a token ab12","reason":"x"}"#),
            "500"
        );
        assert_eq!(refusal_words(502, "not json"), "502");
    }

    #[test]
    fn the_status_decides_what_this_mac_does_next() {
        assert_eq!(classify(401, ""), RelayError::Unauthorized);
        assert_eq!(classify(404, ""), RelayError::UnknownDevice);
        assert_eq!(
            classify(410, r#"{"error":"gone","reason":"BadDeviceToken"}"#),
            RelayError::Gone
        );
        assert_eq!(
            classify(
                502,
                r#"{"error":"provider","status":429,"reason":"TooManyRequests"}"#
            ),
            RelayError::Unavailable(
                "push service answered 502 provider (provider: TooManyRequests)".into()
            )
        );
    }

    #[tokio::test]
    async fn an_agent_waiting_on_you_is_never_held_by_the_burst_cap() {
        let (c, _relay, id) = setup(BuildKind::Official);
        set_enabled(&c, true).await.unwrap();
        set_push(&c, &id, Some(TOKEN.into()), PushEnvironment::Production)
            .await
            .unwrap();
        // Finished alerts: three in a burst, the fourth held.
        for i in 0..3 {
            assert_eq!(
                deliver_all(&c, &alert(PushKind::Finished), 10).await,
                vec![id.clone()],
                "finished {i}"
            );
        }
        assert!(deliver_all(&c, &alert(PushKind::Finished), 10)
            .await
            .is_empty());
        // The approvals behind them still go, however many.
        for i in 0..5 {
            assert_eq!(
                deliver_all(&c, &alert(PushKind::NeedsYou), 10).await,
                vec![id.clone()],
                "needs you {i}"
            );
        }
    }
}
