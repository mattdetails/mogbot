//! Folders on the agent list: optional, named by the user ("Website", "SEO",
//! "Outreach"), one per agent at most, in the user's order. Nothing shows
//! until the first is made.
//!
//! They live on this Mac, beside the agents, so the desk, the phone and the
//! Chief see the same ones: the folders and the pinned-agents choice in
//! `folders.json`, which folder an agent is in on the agent itself
//! (`Agent::folder`). The Chief files agents with `file_agent`, making the
//! folder when it is new. The Chief is never filed: it stays first.
//!
//! **Pinned agents** ([`Pinned`]): at the top of the list, above the folders
//! (the default), or in their folder, first in it.
//!
//! Before this, a desk window kept its own groups in its storage; the first
//! window to open with some brings them here ([`bring_in`]), once.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

use super::store;
use crate::errors::CommandError;

/// Folder names are short labels.
const NAME_MAX: usize = 40;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
}

/// Where pinned agents sit when there are folders.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Pinned {
    /// Above the folders, right under the Chief.
    #[default]
    Top,
    /// In their folder, first in it.
    InFolder,
}

impl Pinned {
    pub fn parse(value: &str) -> Result<Pinned, CommandError> {
        match value
            .trim()
            .to_ascii_lowercase()
            .replace([' ', '-', '_'], "")
            .as_str()
        {
            "top" | "attop" | "atthetop" => Ok(Pinned::Top),
            "infolder" | "intheirfolder" => Ok(Pinned::InFolder),
            _ => Err(CommandError::expected(
                "Choose top or inFolder.".to_string(),
            )),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct View {
    /// In the user's order.
    #[serde(default)]
    pub folders: Vec<Folder>,
    #[serde(default)]
    pub pinned: Pinned,
    /// A desk window's own groups were brought here (or there were none).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub brought_in: bool,
}

static LOCK: Mutex<()> = Mutex::new(());

fn path() -> Result<PathBuf, CommandError> {
    Ok(store::agents_root()?.join("folders.json"))
}

fn read() -> View {
    path()
        .ok()
        .and_then(|p| super::survive::read_kept::<View>(&p, "Your agent folders"))
        .unwrap_or_default()
}

fn write(view: &View) -> Result<(), CommandError> {
    let json = serde_json::to_vec_pretty(view).map_err(super::err_other)?;
    store::write_atomic(&path()?, &json)
}

fn change<T>(f: impl FnOnce(&mut View) -> Result<T, CommandError>) -> Result<T, CommandError> {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut view = read();
    let out = f(&mut view)?;
    write(&view)?;
    Ok(out)
}

pub fn view() -> View {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    read()
}

/// A folder's name as kept: trimmed, one line, at most [`NAME_MAX`].
pub fn clean_name(name: &str) -> Result<String, CommandError> {
    let one_line = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let clean: String = one_line.chars().take(NAME_MAX).collect();
    if clean.is_empty() {
        return Err(CommandError::expected(
            "Give the folder a name.".to_string(),
        ));
    }
    Ok(clean)
}

/// The folder `query` names: its id, else its name (any case).
pub fn find_in<'a>(folders: &'a [Folder], query: &str) -> Option<&'a Folder> {
    let q = query.trim();
    folders
        .iter()
        .find(|f| f.id == q)
        .or_else(|| folders.iter().find(|f| f.name.eq_ignore_ascii_case(q)))
}

pub fn find(query: &str) -> Option<Folder> {
    find_in(&view().folders, query).cloned()
}

fn new_id(now: i64, taken: &[Folder]) -> String {
    let mut n = now;
    loop {
        let id = format!("f{n:x}");
        if !taken.iter().any(|f| f.id == id) {
            return id;
        }
        n += 1;
    }
}

/// Add `name` to `folders`, or the one already called that. Pure.
pub fn add_to(folders: &mut Vec<Folder>, name: &str, now: i64) -> Result<Folder, CommandError> {
    let name = clean_name(name)?;
    if let Some(same) = folders.iter().find(|f| f.name.eq_ignore_ascii_case(&name)) {
        return Ok(same.clone());
    }
    let folder = Folder {
        id: new_id(now, folders),
        name,
    };
    folders.push(folder.clone());
    Ok(folder)
}

/// A new folder, last; a name already used is that folder.
pub fn create(name: &str) -> Result<Folder, CommandError> {
    change(|v| add_to(&mut v.folders, name, store::now_ms()))
}

pub fn rename(id: &str, name: &str) -> Result<Folder, CommandError> {
    let name = clean_name(name)?;
    change(|v| {
        if v.folders
            .iter()
            .any(|f| f.id != id && f.name.eq_ignore_ascii_case(&name))
        {
            return Err(CommandError::expected(format!(
                "There's already a folder called {name}."
            )));
        }
        let folder =
            v.folders.iter_mut().find(|f| f.id == id).ok_or_else(|| {
                CommandError::expected("That folder no longer exists.".to_string())
            })?;
        folder.name = name;
        Ok(folder.clone())
    })
}

/// Remove a folder. Its agents stay, in no folder.
pub fn delete(id: &str) -> Result<(), CommandError> {
    change(|v| {
        v.folders.retain(|f| f.id != id);
        Ok(())
    })?;
    for agent in store::list()?
        .into_iter()
        .filter(|a| a.folder.as_deref() == Some(id))
    {
        store::update(&agent.id, |a| a.folder = None)?;
    }
    Ok(())
}

/// `folders` in the order of `ids`; any not named keep their place after. Pure.
pub fn in_order(folders: &[Folder], ids: &[String]) -> Vec<Folder> {
    let mut out: Vec<Folder> = ids
        .iter()
        .filter_map(|id| folders.iter().find(|f| &f.id == id).cloned())
        .collect();
    out.extend(folders.iter().filter(|f| !ids.contains(&f.id)).cloned());
    out
}

pub fn reorder(ids: &[String]) -> Result<View, CommandError> {
    change(|v| {
        v.folders = in_order(&v.folders, ids);
        Ok(v.clone())
    })
}

pub fn set_pinned(pinned: Pinned) -> Result<View, CommandError> {
    change(|v| {
        v.pinned = pinned;
        Ok(v.clone())
    })
}

/// Put an agent in a folder (`None`: in no folder).
pub fn file(agent_id: &str, folder: Option<&str>) -> Result<store::Agent, CommandError> {
    let agent = store::get(agent_id)?;
    if agent.is_main && folder.is_some() {
        return Err(CommandError::expected(
            "The Chief of Staff always stays at the top of the list.".to_string(),
        ));
    }
    let folder = match folder {
        Some(id) => Some(
            view()
                .folders
                .iter()
                .find(|f| f.id == id)
                .map(|f| f.id.clone())
                .ok_or_else(|| {
                    CommandError::expected("That folder no longer exists.".to_string())
                })?,
        ),
        None => None,
    };
    store::update(agent_id, |a| a.folder = folder)
}

/// A desk window's groups from before folders lived here: brought in once,
/// by name (a name already here is that folder), each agent filed unless it
/// already is. Later windows' groups are left where they are.
pub fn bring_in(groups: &[Folder], assign: &[(String, String)]) -> Result<View, CommandError> {
    let now = store::now_ms();
    let (view, ids) = change(|v| {
        if v.brought_in {
            return Ok((v.clone(), Vec::new()));
        }
        v.brought_in = true;
        let mut ids: Vec<(String, String)> = Vec::new();
        for group in groups {
            if let Ok(folder) = add_to(&mut v.folders, &group.name, now) {
                ids.push((group.id.clone(), folder.id));
            }
        }
        Ok((v.clone(), ids))
    })?;
    for (agent_id, group) in assign {
        let Some((_, folder)) = ids.iter().find(|(g, _)| g == group) else {
            continue;
        };
        let _ = store::update(agent_id, |a| {
            if a.folder.is_none() && !a.is_main {
                a.folder = Some(folder.clone());
            }
        });
    }
    Ok(view)
}

#[cfg(test)]
#[path = "folders_tests.rs"]
mod tests;
