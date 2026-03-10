use serde::Deserialize;
use tauri::State;

use crate::core::services::prewarm_orchestrator::{
    PrewarmIntent, PrewarmReason, PrewarmSource, PrimaryPlaybackState,
};
use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrewarmPrimaryInput {
    pub channel_id: Option<i64>,
    pub started: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrewarmReasonInput {
    ExplicitSwitch,
    Neighbor,
    ListFocus,
    Background,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrewarmSourceInput {
    Player,
    ChannelListOuter,
    ChannelListInner,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrewarmIntentInput {
    pub channel_id: i64,
    pub stream_url: String,
    pub reason: PrewarmReasonInput,
    pub source: PrewarmSourceInput,
    pub ttl_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrewarmSubmitInput {
    pub intents: Vec<PrewarmIntentInput>,
    pub decoder_slots: Option<usize>,
}

fn map_reason(input: PrewarmReasonInput) -> PrewarmReason {
    match input {
        PrewarmReasonInput::ExplicitSwitch => PrewarmReason::ExplicitSwitch,
        PrewarmReasonInput::Neighbor => PrewarmReason::Neighbor,
        PrewarmReasonInput::ListFocus => PrewarmReason::ListFocus,
        PrewarmReasonInput::Background => PrewarmReason::Background,
    }
}

fn map_source(input: PrewarmSourceInput) -> PrewarmSource {
    match input {
        PrewarmSourceInput::Player => PrewarmSource::Player,
        PrewarmSourceInput::ChannelListOuter => PrewarmSource::ChannelListOuter,
        PrewarmSourceInput::ChannelListInner => PrewarmSource::ChannelListInner,
    }
}

#[tauri::command]
pub async fn prewarm_report_primary(
    state: State<'_, AppState>,
    input: PrewarmPrimaryInput,
) -> AppResult<bool> {
    state
        .prewarm
        .report_primary(PrimaryPlaybackState {
            channel_id: input.channel_id,
            started: input.started,
        })
        .await;
    Ok(state.prewarm.allow_decoder_prewarm().await)
}

#[tauri::command]
pub async fn prewarm_submit_intents(
    state: State<'_, AppState>,
    input: PrewarmSubmitInput,
) -> AppResult<Vec<i64>> {
    let intents = input
        .intents
        .into_iter()
        .map(|item| PrewarmIntent {
            channel_id: item.channel_id,
            stream_url: item.stream_url,
            reason: map_reason(item.reason),
            source: map_source(item.source),
            ttl_ms: item.ttl_ms,
        })
        .collect();
    state.prewarm.submit_intents(intents).await;
    Ok(state
        .prewarm
        .poll_decoder_targets(input.decoder_slots.unwrap_or(1))
        .await)
}

#[tauri::command]
pub async fn prewarm_clear_source(
    state: State<'_, AppState>,
    source: PrewarmSourceInput,
) -> AppResult<()> {
    state.prewarm.clear_source(map_source(source)).await;
    Ok(())
}
