//! The clipboard, for `attach_image`: a picture goes on it for one paste and
//! the text that was there before comes back after. macOS only for now
//! (`osascript`); elsewhere the tool says it can't.

use std::path::Path;

/// What was on the clipboard before, as text (pictures and files the user
/// had copied aren't kept: only text is put back).
pub struct Kept(Option<String>);

#[cfg(target_os = "macos")]
pub fn put_image(path: &Path) -> Result<Kept, String> {
    use std::process::Command;
    let before = Command::new("/usr/bin/pbpaste")
        .output()
        .ok()
        .filter(|o| o.status.success() && !o.stdout.is_empty())
        .and_then(|o| String::from_utf8(o.stdout).ok());
    let class = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "«class PNGf»",
        Some("jpg" | "jpeg") => "JPEG picture",
        Some("gif") => "GIF picture",
        _ => "«class PNGf»",
    };
    let p = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
    let script = format!("set the clipboard to (read (POSIX file \"{p}\") as {class})");
    let out = Command::new("/usr/bin/osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("Couldn't put the picture on the clipboard: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "Couldn't put the picture on the clipboard: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(Kept(before))
}

#[cfg(not(target_os = "macos"))]
pub fn put_image(_path: &Path) -> Result<Kept, String> {
    Err("Attaching pictures works on a Mac only for now.".into())
}

/// Put back the text that was on the clipboard.
pub fn restore(kept: Kept) {
    #[cfg(target_os = "macos")]
    if let Some(text) = kept.0 {
        use std::io::Write;
        if let Ok(mut child) = std::process::Command::new("/usr/bin/pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
        {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            let _ = child.wait();
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = kept;
}
