fn main() {
    // Load compile-time secrets from .env.keys (git-ignored, never committed).
    // Any KEY=VALUE line in that file becomes available to option_env!("KEY").
    // This lets firebase.rs / firebase.rs use option_env!("FIREBASE_API_KEY")
    // without requiring the developer to manually export vars before every build.
    load_dot_env_keys();

    tauri_build::build()
}

fn load_dot_env_keys() {
    // Look for .env.keys next to this build script (i.e. src-tauri/.env.keys)
    let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    let path = std::path::Path::new(&manifest).join(".env.keys");

    // Re-run this script whenever the file changes
    println!("cargo:rerun-if-changed={}", path.display());

    let Ok(content) = std::fs::read_to_string(&path) else {
        // File absent → silently skip; the binary will fail at runtime if
        // a key is actually required (require_api_key() returns Err).
        return;
    };

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim();
            // Emit the env var so option_env!() can see it at compile time
            println!("cargo:rustc-env={key}={value}");
        }
    }
}
