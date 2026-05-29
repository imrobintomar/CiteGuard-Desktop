use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub active_model: String,
    pub setup_complete: bool,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            active_model: "qwen3:14b".into(),
            setup_complete: false,
            theme: "dark".into(),
        }
    }
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    Ok(state.settings.lock().await.clone())
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    *state.settings.lock().await = settings;
    Ok(())
}

#[tauri::command]
pub async fn mark_setup_complete(state: State<'_, AppState>) -> Result<(), String> {
    state.settings.lock().await.setup_complete = true;
    Ok(())
}
