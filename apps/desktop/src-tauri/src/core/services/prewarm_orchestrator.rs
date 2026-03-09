use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::json;
use tokio::sync::{RwLock, Semaphore};
use url::Url;

use crate::core::services::runtime_logger::append_runtime_log;

const STANDBY_WARM_HIT_WINDOW_MS: u128 = 15_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PrewarmReason {
    ExplicitSwitch,
    Neighbor,
    ListFocus,
    Background,
}

impl PrewarmReason {
    fn priority(self) -> u8 {
        match self {
            PrewarmReason::ExplicitSwitch => 4,
            PrewarmReason::Neighbor => 3,
            PrewarmReason::ListFocus => 2,
            PrewarmReason::Background => 1,
        }
    }

    fn default_ttl_ms(self) -> u64 {
        match self {
            PrewarmReason::ExplicitSwitch => 6_000,
            PrewarmReason::Neighbor => 2_500,
            PrewarmReason::ListFocus => 1_200,
            PrewarmReason::Background => 2_000,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            PrewarmReason::ExplicitSwitch => "explicit_switch",
            PrewarmReason::Neighbor => "neighbor",
            PrewarmReason::ListFocus => "list_focus",
            PrewarmReason::Background => "background",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PrewarmSource {
    Player,
    ChannelListOuter,
    ChannelListInner,
}

impl PrewarmSource {
    fn as_str(self) -> &'static str {
        match self {
            PrewarmSource::Player => "player",
            PrewarmSource::ChannelListOuter => "channel_list_outer",
            PrewarmSource::ChannelListInner => "channel_list_inner",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum WarmMode {
    Conn,
    Playlist,
    Segment,
}

impl WarmMode {
    fn as_query(self) -> &'static str {
        match self {
            WarmMode::Conn => "conn",
            WarmMode::Playlist => "playlist",
            WarmMode::Segment => "segment",
        }
    }

    fn as_str(self) -> &'static str {
        self.as_query()
    }
}

#[derive(Debug, Clone)]
pub struct PrewarmIntent {
    pub channel_id: i64,
    pub stream_url: String,
    pub reason: PrewarmReason,
    pub source: PrewarmSource,
    pub ttl_ms: Option<u64>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct PrimaryPlaybackState {
    pub channel_id: Option<i64>,
    pub started: bool,
}

impl PrimaryPlaybackState {
    pub fn has_primary(self) -> bool {
        self.channel_id.is_some()
    }
}

#[derive(Debug, Clone)]
pub struct OrchestratorConfig {
    pub max_warm_concurrency: usize,
    pub min_warm_interval_ms: u64,
    pub enable_network_warm: bool,
}

impl Default for OrchestratorConfig {
    fn default() -> Self {
        Self {
            max_warm_concurrency: 4,
            min_warm_interval_ms: 500,
            enable_network_warm: true,
        }
    }
}

#[derive(Debug, Clone)]
struct CandidateEntry {
    channel_id: i64,
    stream_url: String,
    reason: PrewarmReason,
    source: PrewarmSource,
    priority: u8,
    expires_at: Instant,
    updated_at: Instant,
}

#[derive(Default)]
struct OrchestratorState {
    primary: PrimaryPlaybackState,
    candidates: HashMap<i64, CandidateEntry>,
    source_channels: HashMap<PrewarmSource, HashSet<i64>>,
    inflight: HashSet<(i64, WarmMode)>,
    last_warm: HashMap<(i64, WarmMode), Instant>,
}

#[derive(Clone)]
pub struct ResourcePrewarmOrchestrator {
    proxy_port: u16,
    client: reqwest::Client,
    config: OrchestratorConfig,
    state: Arc<RwLock<OrchestratorState>>,
    warm_semaphore: Arc<Semaphore>,
}

impl ResourcePrewarmOrchestrator {
    pub fn new(proxy_port: u16) -> Self {
        Self::with_config(proxy_port, OrchestratorConfig::default())
    }

    pub fn with_config(proxy_port: u16, config: OrchestratorConfig) -> Self {
        Self {
            proxy_port,
            client: reqwest::Client::builder()
                .pool_max_idle_per_host(8)
                .build()
                .expect("Failed to create prewarm HTTP client"),
            warm_semaphore: Arc::new(Semaphore::new(config.max_warm_concurrency.max(1))),
            state: Arc::new(RwLock::new(OrchestratorState::default())),
            config,
        }
    }

    pub async fn report_primary(&self, primary: PrimaryPlaybackState) {
        let mut state = self.state.write().await;
        let previous_primary = state.primary.channel_id;
        let previous_started = state.primary.started;
        state.primary = primary;
        Self::prune_expired_candidates(&mut state);
        let (switch_probe_hit, since_last_warm_ms) = if primary.channel_id != previous_primary
            && primary.channel_id.is_some()
            && !primary.started
        {
            Self::detect_switch_probe_hit(&state, primary.channel_id.unwrap_or_default())
        } else {
            (None, None)
        };
        append_runtime_log(
            "prewarm_orchestrator",
            "primary_report",
            json!({
                "channel_id": primary.channel_id,
                "started": primary.started,
                "previous_channel_id": previous_primary,
                "previous_started": previous_started,
                "switch_probe_hit": switch_probe_hit,
                "switch_probe_since_last_warm_ms": since_last_warm_ms,
                "candidate_count": state.candidates.len(),
            }),
        );
    }

    pub async fn clear_source(&self, source: PrewarmSource) {
        let mut state = self.state.write().await;
        let mut removed = 0usize;
        if let Some(channels) = state.source_channels.remove(&source) {
            for channel_id in channels {
                if let Some(entry) = state.candidates.get(&channel_id) {
                    if entry.source == source {
                        state.candidates.remove(&channel_id);
                        removed += 1;
                    }
                }
            }
        }
        Self::prune_expired_candidates(&mut state);
        append_runtime_log(
            "prewarm_orchestrator",
            "clear_source",
            json!({
                "source": source.as_str(),
                "removed_candidates": removed,
                "remaining_candidates": state.candidates.len(),
            }),
        );
    }

    pub async fn submit_intents(&self, intents: Vec<PrewarmIntent>) {
        if intents.is_empty() {
            return;
        }
        let intent_count = intents.len();
        let intent_summary: Vec<serde_json::Value> = intents
            .iter()
            .map(|intent| {
                json!({
                    "channel_id": intent.channel_id,
                    "reason": intent.reason.as_str(),
                    "source": intent.source.as_str(),
                    "ttl_ms": intent.ttl_ms,
                    "stream_host": stream_host(&intent.stream_url),
                })
            })
            .collect();

        let (jobs, candidate_count_after_submit) = {
            let mut state = self.state.write().await;
            Self::prune_expired_candidates(&mut state);
            let now = Instant::now();

            for intent in intents {
                let ttl_ms = intent
                    .ttl_ms
                    .unwrap_or(intent.reason.default_ttl_ms())
                    .max(150);
                let entry = CandidateEntry {
                    channel_id: intent.channel_id,
                    stream_url: intent.stream_url,
                    reason: intent.reason,
                    source: intent.source,
                    priority: intent.reason.priority(),
                    expires_at: now + Duration::from_millis(ttl_ms),
                    updated_at: now,
                };
                state.candidates.insert(entry.channel_id, entry);
                state
                    .source_channels
                    .entry(intent.source)
                    .or_default()
                    .insert(intent.channel_id);
            }

            let jobs = Self::collect_warm_jobs(&self.config, &mut state);
            (jobs, state.candidates.len())
        };
        append_runtime_log(
            "prewarm_orchestrator",
            "submit_intents",
            json!({
                "intent_count": intent_count,
                "intents": intent_summary,
                "scheduled_job_count": jobs.len(),
                "candidate_count_after_submit": candidate_count_after_submit,
                "network_warm_enabled": self.config.enable_network_warm,
            }),
        );

        if !self.config.enable_network_warm {
            return;
        }
        for job in jobs {
            self.spawn_warm_job(job);
        }
    }

    pub async fn allow_decoder_prewarm(&self) -> bool {
        let state = self.state.read().await;
        !state.primary.has_primary() || state.primary.started
    }

    pub async fn poll_decoder_targets(&self, limit: usize) -> Vec<i64> {
        if limit == 0 {
            return Vec::new();
        }
        let mut state = self.state.write().await;
        Self::prune_expired_candidates(&mut state);
        if state.primary.has_primary() && !state.primary.started {
            return Vec::new();
        }

        let primary_id = state.primary.channel_id;
        let mut entries: Vec<&CandidateEntry> = state
            .candidates
            .values()
            .filter(|entry| Some(entry.channel_id) != primary_id)
            .collect();
        entries.sort_by_key(|entry| (Reverse(entry.priority), Reverse(entry.updated_at)));
        entries
            .into_iter()
            .take(limit)
            .map(|entry| entry.channel_id)
            .collect()
    }

    fn prune_expired_candidates(state: &mut OrchestratorState) {
        let now = Instant::now();
        let expired: Vec<(i64, PrewarmSource)> = state
            .candidates
            .values()
            .filter(|entry| entry.expires_at <= now)
            .map(|entry| (entry.channel_id, entry.source))
            .collect();
        for (channel_id, source) in expired {
            state.candidates.remove(&channel_id);
            if let Some(channels) = state.source_channels.get_mut(&source) {
                channels.remove(&channel_id);
                if channels.is_empty() {
                    state.source_channels.remove(&source);
                }
            }
        }
    }

    fn collect_warm_jobs(
        config: &OrchestratorConfig,
        state: &mut OrchestratorState,
    ) -> Vec<(i64, String, WarmMode)> {
        let mut entries: Vec<&CandidateEntry> = state.candidates.values().collect();
        entries.sort_by_key(|entry| (Reverse(entry.priority), Reverse(entry.updated_at)));

        let allow_high_cost = !state.primary.has_primary() || state.primary.started;
        let mut jobs = Vec::new();
        let now = Instant::now();
        for entry in entries.into_iter().take(8) {
            let mode = pick_warm_mode(entry.reason, allow_high_cost);
            let key = (entry.channel_id, mode);
            if state.inflight.contains(&key) {
                continue;
            }
            if let Some(last) = state.last_warm.get(&key) {
                if now.duration_since(*last).as_millis() < config.min_warm_interval_ms as u128 {
                    continue;
                }
            }
            state.inflight.insert(key);
            jobs.push((entry.channel_id, entry.stream_url.clone(), mode));
        }
        if !jobs.is_empty() {
            let job_summary: Vec<serde_json::Value> = jobs
                .iter()
                .map(|(channel_id, stream_url, mode)| {
                    json!({
                        "channel_id": channel_id,
                        "mode": mode.as_str(),
                        "stream_host": stream_host(stream_url),
                    })
                })
                .collect();
            append_runtime_log(
                "prewarm_orchestrator",
                "collect_warm_jobs",
                json!({
                    "allow_high_cost": allow_high_cost,
                    "candidate_count": state.candidates.len(),
                    "jobs": job_summary,
                }),
            );
        }
        jobs
    }

    fn spawn_warm_job(&self, job: (i64, String, WarmMode)) {
        let state = self.state.clone();
        let client = self.client.clone();
        let semaphore = self.warm_semaphore.clone();
        let proxy_port = self.proxy_port;
        tokio::spawn(async move {
            let (channel_id, stream_url, mode) = job;
            let stream_host = stream_host(&stream_url);
            let permit = semaphore.acquire().await;
            if permit.is_err() {
                let mut s = state.write().await;
                s.inflight.remove(&(channel_id, mode));
                append_runtime_log(
                    "prewarm_orchestrator",
                    "warm_job_skipped",
                    json!({
                        "channel_id": channel_id,
                        "mode": mode.as_str(),
                        "reason": "semaphore_acquire_failed",
                        "stream_host": stream_host,
                    }),
                );
                return;
            }
            let mode_query = mode.as_query();
            let warm_url = format!(
                "http://127.0.0.1:{proxy_port}/warm?url={}&mode={}&segment_count=1",
                urlencoding::encode(&stream_url),
                mode_query
            );
            let started_at = Instant::now();
            append_runtime_log(
                "prewarm_orchestrator",
                "warm_job_started",
                json!({
                    "channel_id": channel_id,
                    "mode": mode.as_str(),
                    "stream_host": stream_host,
                }),
            );
            let response = client.get(warm_url).send().await;
            let elapsed_ms = started_at.elapsed().as_millis();
            drop(permit);
            let (ok, http_status, error_message) = match response {
                Ok(value) => (
                    value.status().is_success(),
                    Some(value.status().as_u16()),
                    None,
                ),
                Err(err) => (false, None, Some(err.to_string())),
            };

            let mut s = state.write().await;
            s.inflight.remove(&(channel_id, mode));
            if ok {
                s.last_warm.insert((channel_id, mode), Instant::now());
            }
            append_runtime_log(
                "prewarm_orchestrator",
                "warm_job_finished",
                json!({
                    "channel_id": channel_id,
                    "mode": mode.as_str(),
                    "stream_host": stream_host,
                    "elapsed_ms": elapsed_ms,
                    "ok": ok,
                    "http_status": http_status,
                    "error": error_message,
                }),
            );
        });
    }

    fn detect_switch_probe_hit(
        state: &OrchestratorState,
        channel_id: i64,
    ) -> (Option<bool>, Option<u128>) {
        let latest = [WarmMode::Conn, WarmMode::Playlist, WarmMode::Segment]
            .into_iter()
            .filter_map(|mode| {
                state
                    .last_warm
                    .get(&(channel_id, mode))
                    .map(|timestamp| Instant::now().duration_since(*timestamp).as_millis())
            })
            .min();
        if let Some(since_ms) = latest {
            return (Some(since_ms <= STANDBY_WARM_HIT_WINDOW_MS), Some(since_ms));
        }
        (Some(false), None)
    }
}

fn pick_warm_mode(reason: PrewarmReason, allow_high_cost: bool) -> WarmMode {
    match reason {
        PrewarmReason::ExplicitSwitch => {
            if allow_high_cost {
                WarmMode::Segment
            } else {
                WarmMode::Playlist
            }
        }
        PrewarmReason::Neighbor => {
            if allow_high_cost {
                WarmMode::Playlist
            } else {
                WarmMode::Conn
            }
        }
        PrewarmReason::ListFocus => {
            if allow_high_cost {
                WarmMode::Playlist
            } else {
                WarmMode::Conn
            }
        }
        PrewarmReason::Background => WarmMode::Conn,
    }
}

fn stream_host(stream_url: &str) -> Option<String> {
    Url::parse(stream_url)
        .ok()
        .and_then(|url| url.host_str().map(|value| value.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn orchestrator_for_test() -> ResourcePrewarmOrchestrator {
        let cfg = OrchestratorConfig {
            enable_network_warm: false,
            ..OrchestratorConfig::default()
        };
        ResourcePrewarmOrchestrator::with_config(19090, cfg)
    }

    #[tokio::test]
    async fn decoder_prewarm_allowed_without_primary() {
        let orch = orchestrator_for_test();
        orch.report_primary(PrimaryPlaybackState::default()).await;
        assert!(orch.allow_decoder_prewarm().await);
    }

    #[tokio::test]
    async fn decoder_prewarm_blocked_until_primary_started() {
        let orch = orchestrator_for_test();
        orch.report_primary(PrimaryPlaybackState {
            channel_id: Some(100),
            started: false,
        })
        .await;
        assert!(!orch.allow_decoder_prewarm().await);
        orch.report_primary(PrimaryPlaybackState {
            channel_id: Some(100),
            started: true,
        })
        .await;
        assert!(orch.allow_decoder_prewarm().await);
    }

    #[tokio::test]
    async fn returns_targets_in_priority_order() {
        let orch = orchestrator_for_test();
        orch.report_primary(PrimaryPlaybackState {
            channel_id: Some(10),
            started: true,
        })
        .await;
        orch.submit_intents(vec![
            PrewarmIntent {
                channel_id: 11,
                stream_url: "https://a/11.m3u8".into(),
                reason: PrewarmReason::ListFocus,
                source: PrewarmSource::ChannelListOuter,
                ttl_ms: Some(3_000),
            },
            PrewarmIntent {
                channel_id: 12,
                stream_url: "https://a/12.m3u8".into(),
                reason: PrewarmReason::ExplicitSwitch,
                source: PrewarmSource::Player,
                ttl_ms: Some(3_000),
            },
        ])
        .await;
        let targets = orch.poll_decoder_targets(2).await;
        assert_eq!(targets, vec![12, 11]);
    }

    #[tokio::test]
    async fn clear_source_removes_its_candidates() {
        let orch = orchestrator_for_test();
        orch.submit_intents(vec![
            PrewarmIntent {
                channel_id: 21,
                stream_url: "https://a/21.m3u8".into(),
                reason: PrewarmReason::ListFocus,
                source: PrewarmSource::ChannelListOuter,
                ttl_ms: Some(3_000),
            },
            PrewarmIntent {
                channel_id: 22,
                stream_url: "https://a/22.m3u8".into(),
                reason: PrewarmReason::Neighbor,
                source: PrewarmSource::Player,
                ttl_ms: Some(3_000),
            },
        ])
        .await;
        orch.clear_source(PrewarmSource::ChannelListOuter).await;
        let targets = orch.poll_decoder_targets(10).await;
        assert_eq!(targets, vec![22]);
    }
}
