//! Whisper (whisper.cpp through whisper-rs). Loading the model takes seconds
//! (10.8 s cold on Julian's Mac, most of a dictation's wait), so it stays
//! loaded between dictations and is let go after `KEEP_FOR` idle, and always
//! before the app exits (`release`): ggml's Metal backend aborts the process
//! if a live context is still around as it exits. `warm` loads it as soon as
//! someone starts talking, so the load overlaps the speaking. One at a time.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// The loaded model, which file it is, and when it was last used.
struct Loaded {
    path: PathBuf,
    ctx: WhisperContext,
    used: Instant,
}

static MODEL: Mutex<Option<Loaded>> = Mutex::new(None);

/// How long the model stays loaded after the last dictation (about 600 MB).
const KEEP_FOR: Duration = Duration::from_secs(10 * 60);

fn held() -> std::sync::MutexGuard<'static, Option<Loaded>> {
    MODEL.lock().unwrap_or_else(|e| e.into_inner())
}

/// When a model last counted as used: a dictation counts, a warm-up of one
/// already loaded doesn't. Warming on every chat the phone opened kept the
/// ~0.8 GB model loaded for as long as chats kept being opened.
fn used_since(was: Instant, now: Instant, dictating: bool) -> Instant {
    if dictating {
        now
    } else {
        was
    }
}

/// The model in `slot`, loading it if it isn't already. `dictating`: this is
/// a dictation, so it restarts the idle clock (a warm-up doesn't).
fn ensure<'a>(
    slot: &'a mut Option<Loaded>,
    model: &Path,
    dictating: bool,
) -> Result<&'a mut Loaded, String> {
    if slot.as_ref().is_some_and(|l| l.path != model) {
        *slot = None;
    }
    if slot.is_none() {
        let started = Instant::now();
        let ctx = WhisperContext::new_with_params(model, WhisperContextParameters::default())
            .map_err(|e| format!("Whisper couldn't load its model: {e}"))?;
        tracing::info!(
            ms = started.elapsed().as_millis() as u64,
            "[Dictation] Whisper loaded"
        );
        *slot = Some(Loaded {
            path: model.to_path_buf(),
            ctx,
            used: Instant::now(),
        });
        let _ = std::thread::Builder::new()
            .name("whisper-idle".into())
            .spawn(let_go_when_idle);
    }
    let loaded = slot.as_mut().ok_or("Whisper isn't loaded.")?;
    loaded.used = used_since(loaded.used, Instant::now(), dictating);
    Ok(loaded)
}

/// Lets the model go once nobody has dictated for `KEEP_FOR`.
fn let_go_when_idle() {
    loop {
        std::thread::sleep(Duration::from_secs(30));
        let mut slot = held();
        match slot.as_ref() {
            None => return,
            Some(l) if l.used.elapsed() >= KEEP_FOR => {
                *slot = None;
                tracing::info!("[Dictation] Whisper let go (idle)");
                return;
            }
            Some(_) => {}
        }
    }
}

/// Load the model now, off the caller's thread, so it's ready by the time
/// the words are. Does nothing when it's loaded or missing.
pub fn warm(model: PathBuf) {
    let _ = std::thread::Builder::new()
        .name("whisper-warm".into())
        .spawn(move || {
            let mut slot = held();
            if let Err(error) = ensure(&mut slot, &model, false) {
                tracing::warn!(%error, "[Dictation] Whisper warm-up failed");
            }
        });
}

/// Let the model go: before the app exits, without fail.
pub fn release() {
    *held() = None;
}

/// The names Whisper is primed with, as one short sentence (its prompt holds
/// about 220 tokens; past that it's ignored).
pub fn hint(names: &[String]) -> String {
    let mut out = String::new();
    for name in names {
        let name = name.trim();
        if name.is_empty() || out.len() + name.len() > 600 {
            continue;
        }
        if !out.is_empty() {
            out.push_str(", ");
        }
        out.push_str(name);
    }
    if out.is_empty() {
        out
    } else {
        format!("{out}.")
    }
}

static LAST_DICTATION: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);

/// Someone dictated (on the desk or the phone) within `ago`.
pub fn dictated_within(ago: Duration) -> bool {
    LAST_DICTATION
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_some_and(|at| at.elapsed() <= ago)
}

/// Beams Whisper searches with (1: greedy).
pub const BEAMS: i32 = 5;

pub fn transcribe(model: &Path, samples_16k: &[f32], names: &[String]) -> Result<String, String> {
    transcribe_with(model, samples_16k, names, BEAMS)
}

/// [`transcribe`] with `beams` beams (1: greedy, the fastest).
pub fn transcribe_with(
    model: &Path,
    samples_16k: &[f32],
    names: &[String],
    beams: i32,
) -> Result<String, String> {
    *LAST_DICTATION.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
    let mut slot = held();
    let loaded = ensure(&mut slot, model, true)?;
    let mut state = loaded.ctx.create_state().map_err(|e| e.to_string())?;

    let mut params = if beams > 1 {
        FullParams::new(SamplingStrategy::BeamSearch {
            beam_size: beams,
            patience: -1.0,
        })
    } else {
        FullParams::new(SamplingStrategy::Greedy { best_of: 1 })
    };
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4) as i32;
    params.set_n_threads(threads);
    params.set_language(Some("auto"));
    params.set_translate(false);
    params.set_no_context(true);
    params.set_suppress_blank(true);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    let prompt = hint(names);
    if !prompt.is_empty() {
        params.set_initial_prompt(&prompt);
    }
    state.full(params, samples_16k).map_err(|e| e.to_string())?;

    let mut text = String::new();
    for segment in state.as_iter() {
        let piece = segment.to_str_lossy().map_err(|e| e.to_string())?;
        text.push_str(&piece);
    }
    Ok(clean(&text))
}

/// Whisper's spacing, and what it writes for no speech at all.
pub fn clean(text: &str) -> String {
    let t = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let silent = ["[BLANK_AUDIO]", "[ Silence ]", "(silence)", "[Music]"];
    if silent.iter().any(|s| t.eq_ignore_ascii_case(s)) {
        return String::new();
    }
    t
}

#[cfg(test)]
mod tests {

    #[test]
    fn only_a_dictation_restarts_the_idle_clock() {
        let was = Instant::now();
        let now = was + Duration::from_secs(300);
        assert_eq!(used_since(was, now, true), now);
        // A warm-up (a chat opened on the phone) leaves it: the model is let
        // go KEEP_FOR after the last dictation, however many chats opened.
        assert_eq!(used_since(was, now, false), was);
    }

    use super::*;

    #[test]
    fn the_hint_lists_names_and_stays_short() {
        assert_eq!(
            hint(&["Mogbot".into(), " ".into(), "Lobeva".into()]),
            "Mogbot, Lobeva."
        );
        let many: Vec<String> = (0..200).map(|i| format!("Agent number {i}")).collect();
        assert!(hint(&many).len() <= 603);
        assert_eq!(hint(&[]), "");
    }

    #[test]
    fn no_speech_is_nothing() {
        assert_eq!(clean("  [BLANK_AUDIO] "), "");
        assert_eq!(clean(" Ship   it\n now. "), "Ship it now.");
    }
}
