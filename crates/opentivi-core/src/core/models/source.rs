#[derive(Debug, Clone)]
pub enum SourceKind {
    M3u,
    Xtream,
    Xmltv,
}

impl SourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceKind::M3u => "m3u",
            SourceKind::Xtream => "xtream",
            SourceKind::Xmltv => "xmltv",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "m3u" => Some(SourceKind::M3u),
            "xtream" => Some(SourceKind::Xtream),
            "xmltv" => Some(SourceKind::Xmltv),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub enum SourceDisabledReason {
    UserDisabled,
}

impl SourceDisabledReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceDisabledReason::UserDisabled => "user_disabled",
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct Source {
    pub id: i64,
    pub kind: SourceKind,
    pub name: String,
    pub location: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub enabled: bool,
    pub disabled_reason: Option<String>,
    pub auto_refresh_minutes: Option<u32>,
    pub last_imported_at: Option<String>,
    pub last_refresh_error: Option<String>,
    pub last_refresh_attempt_at: Option<String>,
    pub consecutive_refresh_failures: u32,
    pub next_retry_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
