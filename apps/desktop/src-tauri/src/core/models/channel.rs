#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct Channel {
    pub id: i64,
    pub channel_key: String,
    pub source_id: i64,
    pub external_id: Option<String>,
    pub name: String,
    pub channel_number: Option<String>,
    pub group_name: Option<String>,
    pub tvg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub container_extension: Option<String>,
    pub is_live: bool,
}

/// Intermediate representation from parsers before DB insertion.
#[derive(Debug, Clone)]
pub struct ParsedChannel {
    pub channel_key: String,
    pub external_id: Option<String>,
    pub name: String,
    pub channel_number: Option<String>,
    pub group_name: Option<String>,
    pub tvg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub container_extension: Option<String>,
    pub is_live: bool,
}
