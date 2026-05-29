mod commands;
mod mcp;
mod ollama;
mod storage;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{App, Manager};
use tokio::sync::Mutex;
use tracing::info;

use commands::settings::AppSettings;
use mcp::McpClient;
use ollama::OllamaManager;

pub struct AppState {
    pub ollama: Arc<OllamaManager>,
    pub mcp: Arc<Mutex<Option<McpClient>>>,
    pub settings: Arc<Mutex<AppSettings>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "citeguard=info,warn".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let state = build_state(app)?;
            app.manage(state);

            // Set taskbar / titlebar icon at runtime (works in dev + production)
            if let Some(win) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/CiteGuardIcon.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = win.set_icon(icon);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::chat::send_message,
            commands::chat::call_mcp_tool,
            commands::models::list_models,
            commands::models::pull_model,
            commands::models::check_ollama_status,
            commands::models::start_ollama,
            commands::models::detect_gpu,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::mark_setup_complete,
            commands::firebase::firebase_sign_up,
            commands::firebase::firebase_sign_in,
            commands::firebase::firebase_refresh_token,
            commands::firebase::firebase_send_verification,
            commands::firebase::firebase_check_verified,
            commands::firebase::firestore_get_profile,
            commands::firebase::firestore_ensure_profile,
            commands::firebase::firestore_record_verification,
            commands::firebase::firestore_upgrade_to_lifetime,
            commands::firebase::razorpay_verify_payment,
        ])
        .run(tauri::generate_context!())
        .expect("error running CiteGuard");
}

fn build_state(app: &App) -> tauri::Result<AppState> {
    let resource_dir = app.path().resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    let (ollama_bin, bun_bin) = find_binaries(&resource_dir);
    // mcp_dir = resource_dir/mcp  (contains dist/ and node_modules/)
    let mcp_dir = resource_dir.join("mcp");
    let mcp_script = mcp_dir.join("dist").join("index.js");

    let data_dir = app.path().app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let models_dir = data_dir.join("ollama-models");
    std::fs::create_dir_all(&models_dir).ok();

    info!("Ollama: {}", ollama_bin.display());
    info!("Bun:    {}", bun_bin.display());
    info!("MCP:    {}", mcp_script.display());
    info!("Models: {}", models_dir.display());

    let ollama = Arc::new(OllamaManager::new(ollama_bin, models_dir));

    let mcp: Arc<Mutex<Option<McpClient>>> = Arc::new(Mutex::new(None));
    let mcp_clone = Arc::clone(&mcp);

    // Clone paths before the first spawn consumes them
    let bun_hc = bun_bin.clone();
    let script_hc = mcp_script.clone();
    let dir_hc = mcp_dir.clone();

    tauri::async_runtime::spawn(async move {
        match McpClient::spawn(&bun_bin, &mcp_script, &mcp_dir).await {
            Ok(client) => { *mcp_clone.lock().await = Some(client); info!("MCP ready"); }
            Err(e) => tracing::warn!("MCP unavailable: {e}"),
        }
    });

    // Health-check loop: every 60 s acquire the mcp lock (after any active chat finishes)
    // and ping the MCP subprocess. On failure, respawn it automatically.
    let mcp_hc = Arc::clone(&mcp);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(30)).await; // let initial spawn settle
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
            let alive = {
                let guard = mcp_hc.lock().await;
                match guard.as_ref() {
                    Some(client) => client.ping().await,
                    None => false,
                }
            };
            if !alive {
                tracing::warn!("MCP health-check failed — respawning");
                match McpClient::spawn(&bun_hc, &script_hc, &dir_hc).await {
                    Ok(client) => {
                        *mcp_hc.lock().await = Some(client);
                        info!("MCP respawned successfully");
                    }
                    Err(e) => tracing::warn!("MCP respawn failed: {e}"),
                }
            }
        }
    });

    let ollama_clone = Arc::clone(&ollama);
    let default_model = AppSettings::default().active_model;
    tauri::async_runtime::spawn(async move {
        if let Err(e) = ollama_clone.ensure_running().await {
            tracing::warn!("Ollama startup: {e}");
            return;
        }
        // Pre-load the default model into VRAM so the first request is instant
        info!("Warming up model: {}", default_model);
        ollama_clone.client().warmup(&default_model).await;
        info!("Model warm-up complete — {} ready in VRAM", default_model);
    });

    Ok(AppState {
        ollama,
        mcp,
        settings: Arc::new(Mutex::new(AppSettings::default())),
    })
}

fn find_binaries(resource_dir: &PathBuf) -> (PathBuf, PathBuf) {
    let bin = resource_dir.join("binaries");

    #[cfg(target_os = "windows")]
    let (bundled_ollama, bundled_bun) = (bin.join("ollama.exe"), bin.join("bun.exe"));
    #[cfg(not(target_os = "windows"))]
    let (bundled_ollama, bundled_bun) = (bin.join("ollama"), bin.join("bun"));

    // Use bundled Ollama only if it is a real executable (non-empty, has exec bit)
    let ollama = if is_executable(&bundled_ollama) {
        bundled_ollama
    } else {
        // Fall back to system installation
        for candidate in &["/usr/local/bin/ollama", "/usr/bin/ollama"] {
            let p = PathBuf::from(candidate);
            if p.exists() { return (p, bundled_bun); }
        }
        PathBuf::from("/usr/local/bin/ollama")
    };

    (ollama, bundled_bun)
}

#[cfg(unix)]
fn is_executable(path: &PathBuf) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.len() > 0 && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &PathBuf) -> bool {
    path.exists()
}
