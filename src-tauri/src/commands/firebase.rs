use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const API_KEY: &str = "AIzaSyCsFTRm77Q1nUtWVmzRTvBEum6w_K2pJOw";
const FIRESTORE_BASE: &str =
    "https://firestore.googleapis.com/v1/projects/citeguarddesktop/databases/(default)/documents";

// ── Auth types ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserSession {
    pub uid: String,
    pub email: String,
    pub id_token: String,
    pub refresh_token: String,
    pub expires_at: u64, // unix seconds
    pub email_verified: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub email: String,
    pub tier: String,
    pub verifications_today: i64,
    pub last_verification_date: String,
    pub total_verifications: i64,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn map_firebase_error(message: &str) -> String {
    match message {
        "EMAIL_NOT_FOUND" | "INVALID_PASSWORD" | "INVALID_LOGIN_CREDENTIALS" => {
            "auth/invalid-credential".into()
        }
        "EMAIL_EXISTS" => "auth/email-already-in-use".into(),
        m if m.starts_with("WEAK_PASSWORD") => "auth/weak-password".into(),
        "INVALID_EMAIL" => "auth/invalid-email".into(),
        "USER_DISABLED" => "auth/user-disabled".into(),
        "TOO_MANY_ATTEMPTS_TRY_LATER" => "auth/too-many-requests".into(),
        _ => format!("auth/unknown: {}", message),
    }
}

/// Decode base64url (no-padding) → bytes without an external crate.
fn base64url_decode(s: &str) -> Vec<u8> {
    let mut s = s.replace('-', "+").replace('_', "/");
    match s.len() % 4 {
        2 => s.push_str("=="),
        3 => s.push('='),
        _ => {}
    }
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for &c in s.as_bytes() {
        if c == b'=' { break; }
        let val = match A.iter().position(|&a| a == c) { Some(p) => p as u32, None => continue };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 { bits -= 8; out.push((buf >> bits) as u8); buf &= (1 << bits) - 1; }
    }
    out
}

/// Extract `email_verified` from the JWT payload (second segment).
/// Falls back to false on any parse error.
fn email_verified_from_jwt(id_token: &str) -> bool {
    let parts: Vec<&str> = id_token.splitn(3, '.').collect();
    if parts.len() < 2 { return false; }
    let decoded = base64url_decode(parts[1]);
    serde_json::from_slice::<Value>(&decoded)
        .ok()
        .and_then(|v| v["email_verified"].as_bool())
        .unwrap_or(false)
}

fn parse_session(json: &Value, existing_refresh: Option<&str>) -> Result<UserSession, String> {
    let uid = json["localId"]
        .as_str()
        .ok_or("Missing localId")?
        .to_string();
    let email = json["email"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let id_token = json["idToken"]
        .as_str()
        .ok_or("Missing idToken")?
        .to_string();
    let refresh_token = json
        .get("refreshToken")
        .and_then(|v| v.as_str())
        .or(existing_refresh)
        .unwrap_or("")
        .to_string();
    let expires_in: u64 = json["expiresIn"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3600);
    // Read email_verified from the JWT payload — the sign-in REST response
    // doesn't include this field, and using `registered` (which is always
    // true for existing users) would let unverified accounts bypass the
    // email-verification screen.
    let email_verified = email_verified_from_jwt(&id_token);
    Ok(UserSession {
        uid,
        email,
        id_token,
        refresh_token,
        expires_at: now_secs() + expires_in,
        email_verified,
    })
}

// ── Auth commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn firebase_sign_up(email: String, password: String) -> Result<UserSession, String> {
    let url = format!(
        "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={}",
        API_KEY
    );
    let client = Client::new();
    let resp: Value = client
        .post(&url)
        .json(&json!({ "email": email, "password": password, "returnSecureToken": true }))
        .send()
        .await
        .map_err(|e| format!("auth/network-request-failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("auth/parse-error: {e}"))?;

    if let Some(err) = resp.get("error") {
        let msg = err["message"].as_str().unwrap_or("UNKNOWN");
        return Err(map_firebase_error(msg));
    }
    parse_session(&resp, None)
}

#[tauri::command]
pub async fn firebase_sign_in(email: String, password: String) -> Result<UserSession, String> {
    let url = format!(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={}",
        API_KEY
    );
    let client = Client::new();
    let resp: Value = client
        .post(&url)
        .json(&json!({ "email": email, "password": password, "returnSecureToken": true }))
        .send()
        .await
        .map_err(|e| format!("auth/network-request-failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("auth/parse-error: {e}"))?;

    if let Some(err) = resp.get("error") {
        let msg = err["message"].as_str().unwrap_or("UNKNOWN");
        return Err(map_firebase_error(msg));
    }
    parse_session(&resp, None)
}

#[tauri::command]
pub async fn firebase_refresh_token(refresh_token: String) -> Result<UserSession, String> {
    let url = format!(
        "https://securetoken.googleapis.com/v1/token?key={}",
        API_KEY
    );
    let client = Client::new();
    let resp: Value = client
        .post(&url)
        .form(&[("grant_type", "refresh_token"), ("refresh_token", &refresh_token)])
        .send()
        .await
        .map_err(|e| format!("auth/network-request-failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("auth/parse-error: {e}"))?;

    if let Some(err) = resp.get("error") {
        let msg = err["message"].as_str().unwrap_or("UNKNOWN");
        return Err(map_firebase_error(msg));
    }

    // Token refresh response has different field names
    let uid = resp["user_id"].as_str().ok_or("Missing user_id")?.to_string();
    let id_token = resp["id_token"].as_str().ok_or("Missing id_token")?.to_string();
    let new_refresh = resp["refresh_token"].as_str().unwrap_or(&refresh_token).to_string();
    let expires_in: u64 = resp["expires_in"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3600);

    Ok(UserSession {
        uid,
        email: String::new(), // not returned by refresh endpoint
        id_token,
        refresh_token: new_refresh,
        expires_at: now_secs() + expires_in,
        email_verified: false, // will be re-checked by frontend after refresh
    })
}

/// Send a verification email to the signed-in user.
#[tauri::command]
pub async fn firebase_send_verification(id_token: String) -> Result<(), String> {
    let url = format!(
        "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key={}",
        API_KEY
    );
    let client = Client::new();
    let resp: Value = client
        .post(&url)
        .json(&json!({ "requestType": "VERIFY_EMAIL", "idToken": id_token }))
        .send()
        .await
        .map_err(|e| format!("auth/network-request-failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("auth/parse-error: {e}"))?;

    if let Some(err) = resp.get("error") {
        let msg = err["message"].as_str().unwrap_or("UNKNOWN");
        return Err(map_firebase_error(msg));
    }
    Ok(())
}

/// Check whether the current user's email is verified.
#[tauri::command]
pub async fn firebase_check_verified(id_token: String) -> Result<bool, String> {
    let url = format!(
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={}",
        API_KEY
    );
    let client = Client::new();
    let resp: Value = client
        .post(&url)
        .json(&json!({ "idToken": id_token }))
        .send()
        .await
        .map_err(|e| format!("auth/network-request-failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("auth/parse-error: {e}"))?;

    if let Some(err) = resp.get("error") {
        let msg = err["message"].as_str().unwrap_or("UNKNOWN");
        return Err(map_firebase_error(msg));
    }

    let verified = resp["users"][0]["emailVerified"].as_bool().unwrap_or(false);
    Ok(verified)
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

fn fs_string(v: &Value, field: &str) -> String {
    v.get(field)
        .and_then(|f| f.get("stringValue"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string()
}

fn fs_int(v: &Value, field: &str) -> i64 {
    v.get(field)
        .and_then(|f| f.get("integerValue"))
        .and_then(|s| s.as_str())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn build_profile_fields(profile: &UserProfile) -> Value {
    json!({
        "fields": {
            "email":                { "stringValue":  profile.email },
            "tier":                 { "stringValue":  profile.tier },
            "verificationsToday":   { "integerValue": profile.verifications_today.to_string() },
            "lastVerificationDate": { "stringValue":  profile.last_verification_date },
            "totalVerifications":   { "integerValue": profile.total_verifications.to_string() }
        }
    })
}

// ── Firestore commands ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn firestore_get_profile(
    uid: String,
    id_token: String,
) -> Result<Option<UserProfile>, String> {
    let url = format!("{}/users/{}", FIRESTORE_BASE, uid);
    let client = Client::new();
    let resp = client
        .get(&url)
        .bearer_auth(&id_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().as_u16() == 404 {
        return Ok(None);
    }

    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    if json.get("error").is_some() {
        return Ok(None);
    }

    let f = json.get("fields").ok_or("No fields")?;
    Ok(Some(UserProfile {
        email: fs_string(f, "email"),
        tier: fs_string(f, "tier"),
        verifications_today: fs_int(f, "verificationsToday"),
        last_verification_date: fs_string(f, "lastVerificationDate"),
        total_verifications: fs_int(f, "totalVerifications"),
    }))
}

#[tauri::command]
pub async fn firestore_ensure_profile(
    uid: String,
    email: String,
    id_token: String,
) -> Result<UserProfile, String> {
    // Return existing profile if present
    if let Ok(Some(p)) = firestore_get_profile(uid.clone(), id_token.clone()).await {
        return Ok(p);
    }

    let profile = UserProfile {
        email,
        tier: "free".into(),
        verifications_today: 0,
        last_verification_date: String::new(),
        total_verifications: 0,
    };

    let url = format!("{}/users/{}?documentId={}", FIRESTORE_BASE, uid, uid);
    let client = Client::new();
    client
        .patch(&url)
        .bearer_auth(&id_token)
        .json(&build_profile_fields(&profile))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(profile)
}

// ── Razorpay payment verification ─────────────────────────────────────────────

#[tauri::command]
pub async fn razorpay_verify_payment(
    payment_id: String,
    uid: String,
    id_token: String,
) -> Result<UserProfile, String> {
    let key_id = option_env!("RAZORPAY_KEY_ID").unwrap_or("");
    let key_secret = option_env!("RAZORPAY_KEY_SECRET").unwrap_or("");

    if key_id.is_empty() || key_secret.is_empty() {
        return Err("Payment verification not configured".into());
    }
    if payment_id.is_empty() || !payment_id.starts_with("pay_") {
        return Err("Invalid payment ID — it should start with pay_".into());
    }

    let url = format!("https://api.razorpay.com/v1/payments/{}", payment_id);
    let client = Client::new();
    let resp: serde_json::Value = client
        .get(&url)
        .basic_auth(key_id, Some(key_secret))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    if resp.get("error").is_some() {
        let msg = resp["error"]["description"].as_str().unwrap_or("Payment not found");
        return Err(msg.to_string());
    }

    let status = resp["status"].as_str().unwrap_or("");
    if status != "captured" {
        return Err(format!("Payment not completed (status: {status}). Please complete the payment first."));
    }

    firestore_upgrade_to_lifetime(uid, id_token).await
}

#[tauri::command]
pub async fn firestore_upgrade_to_lifetime(
    uid: String,
    id_token: String,
) -> Result<UserProfile, String> {
    let profile = firestore_get_profile(uid.clone(), id_token.clone())
        .await?
        .ok_or("Profile not found")?;

    let upgraded = UserProfile {
        tier: "lifetime".into(),
        ..profile
    };

    let url = format!("{}/users/{}", FIRESTORE_BASE, uid);
    let client = Client::new();
    client
        .patch(&url)
        .bearer_auth(&id_token)
        .json(&build_profile_fields(&upgraded))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(upgraded)
}

#[tauri::command]
pub async fn firestore_record_verification(
    uid: String,
    id_token: String,
) -> Result<(), String> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let profile = firestore_get_profile(uid.clone(), id_token.clone())
        .await?
        .ok_or("Profile not found")?;

    let (verif_today, last_date) = if profile.last_verification_date == today {
        (profile.verifications_today + 1, today.clone())
    } else {
        (1, today)
    };

    let updated = UserProfile {
        verifications_today: verif_today,
        last_verification_date: last_date,
        total_verifications: profile.total_verifications + 1,
        ..profile
    };

    let url = format!("{}/users/{}", FIRESTORE_BASE, uid);
    let client = Client::new();
    client
        .patch(&url)
        .bearer_auth(&id_token)
        .json(&build_profile_fields(&updated))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
