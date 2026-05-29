use serde::{Deserialize, Serialize};

/// Persisted conversation shape — kept for potential future native persistence.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredConversation {
    pub id: String,
    pub title: String,
    pub messages_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}
