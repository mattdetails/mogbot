//! The one plain sentence under a card's title that says what is at risk
//! (`Approval::risk_note`): "Deletes ~/Exports/2024 for good.", "Publishes to
//! main, which others can see.", "Sends data to api.example.com.". Made on
//! the Mac from the call itself, and only from what the command lexer can
//! parse: a name that can't be read is left out of the sentence, never
//! guessed, and a call nothing here recognises gets no sentence at all.

use serde_json::Value;

use super::go_hard;

/// The sentence for this call, or `None`.
pub fn of(tool: &str, input: &Value) -> Option<String> {
    if go_hard::spends(tool, input) {
        return Some("Spends money.".into());
    }
    if tool != "Bash" {
        return None;
    }
    let command = input.get("command").and_then(Value::as_str)?;
    go_hard::commands(command)
        .iter()
        .find_map(|words| of_words(words))
}

fn of_words(words: &[String]) -> Option<String> {
    let all: Vec<&str> = words.iter().map(String::as_str).collect();
    let all = go_hard::unwrapped(&all);
    let (prog, args) = all.split_first()?;
    let prog = go_hard::base(prog);
    let positional = go_hard::positional(args);
    match prog {
        "rm" | "rmdir" | "trash" | "unlink" => {
            let targets: Vec<&str> = positional
                .iter()
                .copied()
                .filter(|t| !t.contains(['$', '`', '*', '?']))
                .collect();
            // A glob or variable can't be read as a name: say it plainly.
            if targets.is_empty() || targets.len() != positional.len() {
                return (!positional.is_empty()).then(|| "Deletes files for good.".into());
            }
            Some(format!("Deletes {} for good.", list(&targets)))
        }
        "git" => {
            let rest = go_hard::positional(&args[args.iter().position(|a| *a == "push")?..]);
            // `positional` drops flags: [push, remote?, ref?]
            let target = rest.get(2).copied().filter(|r| !r.is_empty());
            Some(match target {
                Some(r) => format!(
                    "Publishes to {}, which others can see.",
                    r.rsplit(':').next().unwrap_or(r)
                ),
                None => "Publishes your commits, which others can see.".into(),
            })
        }
        "npm" | "pnpm" | "yarn" | "bun" | "pip" | "pip3" | "cargo" | "brew" => {
            let verb = positional.first().copied()?;
            if !matches!(verb, "install" | "i" | "add") {
                return None;
            }
            let pkgs: Vec<&str> = positional[1..].to_vec();
            Some(if pkgs.is_empty() {
                "Installs the project's dependencies.".into()
            } else {
                format!("Adds {} to the project.", list(&pkgs))
            })
        }
        p if go_hard::web_write(p, args) => {
            let host = args
                .iter()
                .find_map(|a| super::browser_gate::host_of(a))
                .or_else(|| {
                    positional
                        .iter()
                        .find_map(|a| super::browser_gate::host_of(&format!("https://{a}")))
                });
            Some(match host {
                Some(h) => format!("Sends data to {h}."),
                None => "Sends data to another site.".into(),
            })
        }
        _ => None,
    }
}

/// "a", "a and b", "a, b and 3 more".
fn list(items: &[&str]) -> String {
    match items {
        [one] => (*one).to_string(),
        [a, b] => format!("{a} and {b}"),
        [a, b, rest @ ..] => format!("{a}, {b} and {} more", rest.len()),
        [] => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn bash(c: &str) -> Option<String> {
        of("Bash", &json!({ "command": c }))
    }

    #[test]
    fn deletes_name_what_they_parse() {
        assert_eq!(
            bash("rm -rf ~/Exports/2024").as_deref(),
            Some("Deletes ~/Exports/2024 for good.")
        );
        assert_eq!(
            bash("rm a.txt b.txt c.txt d.txt").as_deref(),
            Some("Deletes a.txt, b.txt and 2 more for good.")
        );
        // A glob or variable is never read as a name.
        assert_eq!(
            bash("rm -rf $DIR/*").as_deref(),
            Some("Deletes files for good.")
        );
    }

    #[test]
    fn a_push_names_the_branch_only_when_the_command_does() {
        assert_eq!(
            bash("git push origin main").as_deref(),
            Some("Publishes to main, which others can see.")
        );
        assert_eq!(
            bash("git push origin HEAD:release").as_deref(),
            Some("Publishes to release, which others can see.")
        );
        assert_eq!(
            bash("git push").as_deref(),
            Some("Publishes your commits, which others can see.")
        );
    }

    #[test]
    fn installs_name_the_packages() {
        assert_eq!(
            bash("pnpm add left-pad zod").as_deref(),
            Some("Adds left-pad and zod to the project.")
        );
        assert_eq!(
            bash("npm install").as_deref(),
            Some("Installs the project's dependencies.")
        );
        assert_eq!(bash("npm test"), None);
    }

    #[test]
    fn a_network_write_names_the_host() {
        assert_eq!(
            bash("curl -X POST -d a=1 https://api.example.com/v1/x").as_deref(),
            Some("Sends data to api.example.com.")
        );
        assert_eq!(bash("curl https://api.example.com/v1/x"), None);
    }

    #[test]
    fn spending_says_so_and_everything_else_gets_nothing() {
        assert_eq!(
            bash("curl -d amount=500 https://api.stripe.com/v1/charges").as_deref(),
            Some("Spends money.")
        );
        assert_eq!(bash("ls -la"), None);
        assert_eq!(of("Read", &json!({"file_path": "/x"})), None);
    }
}
