//! Writing a long dictation out while it's still being spoken.
//!
//! Whisper takes a while over minutes of audio, and nobody should stop
//! talking after five minutes and then wait for all five. So while a session
//! listens, every [`START_AFTER`] of new audio is written out in the
//! background, cut at the quietest moment near its end so no word is split.
//! When it stops, only what came after the last cut is left to do.
//!
//! Only the raw words are written ahead; the names pass runs once, over the
//! whole thing, at the end.

use super::pcm::RATE;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

/// Audio not yet written out before a piece of it is.
pub const START_AFTER: Duration = Duration::from_secs(40);
/// How often it looks.
const TICK: Duration = Duration::from_secs(4);
/// The newest audio is never cut into: a word may be mid-way.
const KEEP_BACK: Duration = Duration::from_secs(1);
/// The cut is the quietest moment in this much audio before that.
const SEARCH: Duration = Duration::from_secs(6);

#[derive(Default)]
struct State {
    /// Samples (16 kHz) written out so far.
    upto: usize,
    /// What they said, piece by piece.
    parts: Vec<String>,
    /// A piece is being written out now.
    busy: bool,
    stopped: bool,
}

/// One session's writing-ahead. Dropped or [`Ahead::finish`]ed, it stops.
pub struct Ahead {
    state: Arc<(Mutex<State>, Condvar)>,
}

/// How many 16 kHz samples there are so far, and samples `from..to`.
pub trait Source: Send + Sync + 'static {
    fn len(&self) -> usize;
    fn read(&self, from: usize, to: usize) -> Vec<f32>;
}

/// A recording kept at 16 kHz as it's heard (macOS).
impl Source for Arc<Mutex<Vec<f32>>> {
    fn len(&self) -> usize {
        self.lock().map(|v| v.len()).unwrap_or(0)
    }
    fn read(&self, from: usize, to: usize) -> Vec<f32> {
        self.lock()
            .map(|v| v[from.min(v.len())..to.min(v.len())].to_vec())
            .unwrap_or_default()
    }
}

impl Ahead {
    /// Start watching `source`. Nothing happens when the model isn't here.
    pub fn start(source: impl Source, names: Vec<String>) -> Ahead {
        let state = Arc::new((Mutex::new(State::default()), Condvar::new()));
        let Some(model) = super::model::ready_path() else {
            return Ahead { state };
        };
        let shared = Arc::clone(&state);
        let _ = std::thread::Builder::new()
            .name("dictation-ahead".into())
            .spawn(move || run(&shared, &source, &model, &names));
        Ahead { state }
    }

    /// The session stopped with `all` heard: wait for a piece in progress,
    /// then hand back what was written out and the audio after it.
    pub fn finish(self, all: &[f32]) -> (String, Vec<f32>) {
        let (lock, done) = &*self.state;
        let mut s = lock.lock().unwrap_or_else(|e| e.into_inner());
        s.stopped = true;
        while s.busy {
            s = done.wait(s).unwrap_or_else(|e| e.into_inner());
        }
        let upto = s.upto.min(all.len());
        (join(&s.parts), all[upto..].to_vec())
    }
}

impl Drop for Ahead {
    fn drop(&mut self) {
        if let Ok(mut s) = self.state.0.lock() {
            s.stopped = true;
        }
    }
}

fn run(
    state: &Arc<(Mutex<State>, Condvar)>,
    source: &impl Source,
    model: &std::path::Path,
    names: &[String],
) {
    let (lock, done) = &**state;
    loop {
        std::thread::sleep(TICK);
        let upto = {
            let mut s = lock.lock().unwrap_or_else(|e| e.into_inner());
            if s.stopped {
                return;
            }
            let have = source.len();
            if have.saturating_sub(s.upto) < samples(START_AFTER) {
                continue;
            }
            s.busy = true;
            s.upto
        };
        let end = source.len().saturating_sub(samples(KEEP_BACK));
        let window = source.read(upto, end);
        let cut = quiet_cut(&window, samples(SEARCH));
        let piece = &window[..cut];
        let words = if super::pcm::worth_transcribing(piece) {
            super::transcribe::transcribe(model, piece, names)
                .map_err(|error| tracing::warn!(%error, "[Dictation] writing ahead failed"))
                .ok()
        } else {
            Some(String::new())
        };
        let mut s = lock.lock().unwrap_or_else(|e| e.into_inner());
        s.busy = false;
        match words {
            Some(words) => {
                if !words.is_empty() {
                    s.parts.push(words);
                }
                s.upto = upto + cut;
                tracing::info!(
                    seconds = s.upto as f32 / RATE as f32,
                    "[Dictation] written ahead"
                );
            }
            // Whisper failed on it: leave it for the end, and stop trying.
            None => s.stopped = true,
        }
        done.notify_all();
        if s.stopped {
            return;
        }
    }
}

fn samples(d: Duration) -> usize {
    (d.as_secs_f32() * RATE as f32) as usize
}

/// Where to cut `audio`: the middle of its quietest 100 ms within the last
/// `search` samples. Never 0 and never past the end.
pub fn quiet_cut(audio: &[f32], search: usize) -> usize {
    let window = (RATE / 10) as usize;
    if audio.len() <= window * 2 {
        return audio.len();
    }
    let from = audio.len().saturating_sub(search).max(window);
    let mut best = (f32::MAX, audio.len());
    let mut at = from;
    while at + window <= audio.len() {
        let w = &audio[at..at + window];
        let energy = w.iter().map(|s| s * s).sum::<f32>() / window as f32;
        if energy < best.0 {
            best = (energy, at + window / 2);
        }
        at += window / 2;
    }
    best.1
}

/// The pieces as one text, one space between.
pub fn join(parts: &[String]) -> String {
    parts
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cut_lands_in_the_quiet() {
        // 3 s of tone with a silent stretch from 2.0 s to 2.3 s.
        let mut audio: Vec<f32> = (0..RATE as usize * 3)
            .map(|i| (i as f32 * 0.05).sin() * 0.3)
            .collect();
        for s in &mut audio[(RATE as usize * 2)..(RATE as usize * 23 / 10)] {
            *s = 0.0;
        }
        let cut = quiet_cut(&audio, RATE as usize * 2);
        assert!(
            cut >= RATE as usize * 2 && cut <= RATE as usize * 23 / 10,
            "{cut}"
        );
    }

    #[test]
    fn short_audio_is_not_cut() {
        assert_eq!(quiet_cut(&[0.1; 100], 1000), 100);
    }

    #[test]
    fn pieces_join_with_one_space() {
        assert_eq!(
            join(&["Hello there.".into(), " ".into(), " And then".into()]),
            "Hello there. And then"
        );
    }

    #[test]
    fn finishing_with_nothing_written_ahead_hands_back_everything() {
        let ahead = Ahead {
            state: Arc::new((Mutex::new(State::default()), Condvar::new())),
        };
        let (said, rest) = ahead.finish(&[0.1, 0.2]);
        assert_eq!(said, "");
        assert_eq!(rest, vec![0.1, 0.2]);
    }
}
