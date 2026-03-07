#[derive(Debug, Clone)]
pub struct EpgProgram {
    pub id: i64,
    pub source_id: i64,
    pub channel_tvg_id: String,
    pub start_at: String,
    pub end_at: String,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

/// Intermediate representation from XMLTV parser.
#[derive(Debug, Clone)]
pub struct ParsedProgram {
    pub channel_tvg_id: String,
    pub start_at: String,
    pub end_at: String,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
}
