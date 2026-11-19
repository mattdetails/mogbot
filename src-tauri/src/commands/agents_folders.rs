//! The agent list's folders (`agents::folders`): make, rename, remove and
//! order them, file an agent, choose where pinned agents sit, and bring in a
//! desk window's groups from before folders lived on this Mac. Every change
//! is said with `agents://registry`, so every window and the phone redraw.

use tauri::{AppHandle, Emitter};

use crate::agents::{self, folders, runner};
use crate::errors::CommandError;

fn changed(app: &AppHandle) {
    let _ = app.emit(runner::EVENT_REGISTRY, ());
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(agents::err_other)?
}

/// A new folder, last (a name already used is that folder); with `agent`,
/// that agent is filed in it.
#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn agents_folder_create(
    app: AppHandle,
    name: String,
    agent: Option<String>,
) -> Result<folders::Folder, CommandError> {
    let folder = blocking(move || {
        let folder = folders::create(&name)?;
        if let Some(agent) = agent {
            folders::file(&agent, Some(&folder.id))?;
        }
        Ok(folder)
    })
    .await?;
    changed(&app);
    Ok(folder)
}

#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn agents_folder_rename(
    app: AppHandle,
    id: String,
    name: String,
) -> Result<folders::Folder, CommandError> {
    let folder = blocking(move || folders::rename(&id, &name)).await?;
    changed(&app);
    Ok(folder)
}

/// Remove a folder; its agents stay, in no folder.
#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn agents_folder_delete(app: AppHandle, id: String) -> Result<(), CommandError> {
    blocking(move || folders::delete(&id)).await?;
    changed(&app);
    Ok(())
}

#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn agents_folders_reorder(
    app: AppHandle,
    ids: Vec<String>,
) -> Result<folders::View, CommandError> {
    let view = blocking(move || folders::reorder(&ids)).await?;
    changed(&app);
    Ok(view)
}

/// Put an agent in a folder, or (`folder: null`) in none.
#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn agents_set_folder(
    app: AppHandle,
    agent_id: String,
    folder: Option<String>,
) -> Result<(), CommandError> {
    blocking(move || folders::file(&agent_id, folder.as_deref()).map(|_| ())).await?;
    changed(&app);
    Ok(())
}

/// Pinned agents at the top, or in their folder.
#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn agents_folders_set_pinned(
    app: AppHandle,
    pinned: String,
) -> Result<folders::View, CommandError> {
    let pinned = folders::Pinned::parse(&pinned)?;
    let view = blocking(move || folders::set_pinned(pinned)).await?;
    changed(&app);
    Ok(view)
}

/// One of a desk window's own groups from before folders lived here.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OldGroup {
    pub id: String,
    pub name: String,
}

/// A desk window's groups and who was in which, brought in once.
#[tauri::command]
#[tracing::instrument(skip(app, groups, assign))]
pub async fn agents_folders_bring_in(
    app: AppHandle,
    groups: Vec<OldGroup>,
    assign: std::collections::BTreeMap<String, String>,
) -> Result<folders::View, CommandError> {
    let view = blocking(move || {
        let groups: Vec<folders::Folder> = groups
            .into_iter()
            .map(|g| folders::Folder {
                id: g.id,
                name: g.name,
            })
            .collect();
        let assign: Vec<(String, String)> = assign.into_iter().collect();
        folders::bring_in(&groups, &assign)
    })
    .await?;
    changed(&app);
    Ok(view)
}
