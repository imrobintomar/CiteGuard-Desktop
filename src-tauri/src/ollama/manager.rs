use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use tracing::info;

use super::client::OllamaClient;

pub struct OllamaManager {
    process: Arc<Mutex<Option<Child>>>,
    client: Arc<OllamaClient>,
    binary_path: PathBuf,
    models_dir: PathBuf,
}

impl OllamaManager {
    pub fn new(binary_path: PathBuf, models_dir: PathBuf) -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            client: Arc::new(OllamaClient::new()),
            binary_path,
            models_dir,
        }
    }

    pub fn client(&self) -> Arc<OllamaClient> {
        Arc::clone(&self.client)
    }

    /// Start Ollama if not already running, wait until it responds.
    pub async fn ensure_running(&self) -> Result<()> {
        // Already alive (e.g. previous launch)
        if self.client.is_alive().await {
            info!("Ollama already running");
            return Ok(());
        }

        let binary = &self.binary_path;
        anyhow::ensure!(binary.exists(), "Ollama binary not found at {}", binary.display());

        info!("Starting bundled Ollama at {}", binary.display());

        let child = Command::new(binary)
            .arg("serve")
            .env("OLLAMA_HOST", "127.0.0.1:11435")
            .env("OLLAMA_MODELS", &self.models_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("failed to spawn Ollama")?;

        *self.process.lock().await = Some(child);

        // Wait up to 15 s for readiness
        for _ in 0..30 {
            sleep(Duration::from_millis(500)).await;
            if self.client.is_alive().await {
                info!("Ollama ready");
                return Ok(());
            }
        }

        anyhow::bail!("Ollama did not start within 15 seconds")
    }

    pub async fn stop(&self) {
        if let Some(mut child) = self.process.lock().await.take() {
            let _ = child.kill().await;
        }
    }

    pub fn is_model_downloaded(&self, model_name: &str) -> bool {
        // Ollama stores manifests under models_dir/manifests/registry.ollama.ai/library/<name>/
        let parts: Vec<&str> = model_name.splitn(2, ':').collect();
        let name = parts[0];
        let tag = parts.get(1).copied().unwrap_or("latest");
        let manifest = self.models_dir
            .join("manifests")
            .join("registry.ollama.ai")
            .join("library")
            .join(name)
            .join(tag);
        manifest.exists()
    }
}
