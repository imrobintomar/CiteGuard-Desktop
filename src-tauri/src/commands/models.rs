use serde::Serialize;
use tauri::{AppHandle, State};

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub downloaded: bool,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct GpuInfo {
    pub total_vram_mb: u64,   // sum across all GPUs (Ollama can span them)
    pub gpu_names: Vec<String>,
    pub recommended_model: String,
}

/// Models ordered best→worst. vram_mb = minimum VRAM required (Q4_K_M).
pub const SUPPORTED_MODELS: &[(&str, u64, &str)] = &[
    ("qwen3:14b", 9_000, "Qwen3 14B — Recommended, ~9 GB"),
];

#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> Result<Vec<ModelInfo>, String> {
    let client = state.ollama.client();
    let downloaded = client.list_models().await.unwrap_or_default();
    let downloaded_names: std::collections::HashSet<String> =
        downloaded.iter().map(|m| m.name.clone()).collect();

    let models = SUPPORTED_MODELS.iter().map(|(name, _, _)| ModelInfo {
        name: name.to_string(),
        downloaded: downloaded_names.contains(*name)
            || state.ollama.is_model_downloaded(name),
        size_bytes: downloaded.iter()
            .find(|m| m.name == *name)
            .and_then(|m| m.size),
    }).collect();

    Ok(models)
}

/// Detect total GPU VRAM across all devices using nvidia-smi, then pick
/// the best model that fits. Falls back gracefully if no GPU is found.
#[tauri::command]
pub async fn detect_gpu() -> Result<GpuInfo, String> {
    let (total_vram_mb, gpu_names) = query_nvidia_vram()
        .or_else(|_| query_rocm_vram())
        .unwrap_or((0, vec!["CPU only".into()]));

    // Pick best model that fits in total VRAM (leave 1 GB headroom for OS/driver)
    let headroom_mb: u64 = 1_000;
    let available_mb = total_vram_mb.saturating_sub(headroom_mb);

    let recommended_model = SUPPORTED_MODELS
        .iter()
        .find(|(_, vram_needed, _)| available_mb >= *vram_needed)
        .map(|(name, _, _)| name.to_string())
        .unwrap_or_else(|| "qwen2.5:7b".into()); // always usable on CPU

    Ok(GpuInfo { total_vram_mb, gpu_names, recommended_model })
}

fn query_nvidia_vram() -> Result<(u64, Vec<String>), ()> {
    let out = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
        .map_err(|_| ())?;

    if !out.status.success() { return Err(()); }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut total_mb: u64 = 0;
    let mut names = Vec::new();

    for line in text.lines() {
        let parts: Vec<&str> = line.splitn(2, ',').collect();
        if parts.len() != 2 { continue; }
        let name = parts[0].trim().to_string();
        let mb: u64 = parts[1].trim().parse().unwrap_or(0);
        names.push(name);
        total_mb += mb;
    }

    if total_mb == 0 { return Err(()); }
    Ok((total_mb, names))
}

fn query_rocm_vram() -> Result<(u64, Vec<String>), ()> {
    // rocm-smi --showmeminfo vram — parse "GPU[N] VRAM Total Memory (B): X"
    let out = std::process::Command::new("rocm-smi")
        .args(["--showmeminfo", "vram", "--csv"])
        .output()
        .map_err(|_| ())?;

    if !out.status.success() { return Err(()); }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut total_mb: u64 = 0;

    for line in text.lines() {
        if let Some(bytes_str) = line.split(',').nth(1) {
            if let Ok(bytes) = bytes_str.trim().parse::<u64>() {
                total_mb += bytes / (1024 * 1024);
            }
        }
    }

    if total_mb == 0 { return Err(()); }
    Ok((total_mb, vec!["AMD GPU".into()]))
}

#[tauri::command]
pub async fn pull_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
    // Ensure Ollama is running first
    state.ollama.ensure_running().await.map_err(|e| e.to_string())?;

    let client = state.ollama.client();
    client.pull_model(&app, &model_name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_ollama_status(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.ollama.client().is_alive().await)
}

#[tauri::command]
pub async fn start_ollama(state: State<'_, AppState>) -> Result<(), String> {
    state.ollama.ensure_running().await.map_err(|e| e.to_string())
}
