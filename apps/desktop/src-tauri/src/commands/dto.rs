use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportM3uInput {
    pub name: String,
    pub location: String,
    pub auto_refresh_minutes: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportXtreamInput {
    pub name: String,
    pub server_url: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportXmltvInput {
    pub name: String,
    pub location: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSourceInput {
    pub source_id: i64,
    pub name: String,
    pub location: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub auto_refresh_minutes: Option<u32>,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListChannelsQuery {
    pub source_id: Option<i64>,
    pub group_name: Option<String>,
    pub search: Option<String>,
    pub favorites_only: Option<bool>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetChannelEpgQuery {
    pub channel_id: i64,
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetChannelsEpgSnapshotsQuery {
    pub channel_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetFavoriteInput {
    pub channel_id: i64,
    pub favorite: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSettingInput {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDto {
    pub id: i64,
    pub kind: String,
    pub name: String,
    pub location: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub enabled: bool,
    pub auto_refresh_minutes: Option<u32>,
    pub channel_count: u32,
    pub group_count: u32,
    pub channels_with_tvg_id: u32,
    pub epg_program_count: u32,
    pub last_imported_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelListItemDto {
    pub id: i64,
    pub source_id: i64,
    pub name: String,
    pub channel_number: Option<String>,
    pub group_name: Option<String>,
    pub tvg_id: Option<String>,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub is_favorite: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpgProgramDto {
    pub id: i64,
    pub channel_tvg_id: String,
    pub start_at: String,
    pub end_at: String,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EpgProgramMiniDto {
    pub title: String,
    pub start_at: String,
    pub end_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelEpgSnapshotDto {
    pub channel_id: i64,
    pub now: Option<EpgProgramMiniDto>,
    pub next: Option<EpgProgramMiniDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummaryDto {
    pub source_id: i64,
    pub channels_imported: u32,
    pub channels_updated: u32,
    pub channels_removed: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentChannelDto {
    pub id: i64,
    pub source_id: i64,
    pub name: String,
    pub channel_number: Option<String>,
    pub group_name: Option<String>,
    pub tvg_id: Option<String>,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub is_favorite: bool,
    pub last_watched_at: String,
    pub play_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingDto {
    pub key: String,
    pub value: serde_json::Value,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSourceDto {
    pub channel_id: i64,
    pub channel_name: String,
    pub stream_url: String,
    pub logo_url: Option<String>,
}
