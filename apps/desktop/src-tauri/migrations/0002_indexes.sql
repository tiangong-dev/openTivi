CREATE INDEX IF NOT EXISTS idx_channels_source_group ON channels(source_id, group_name);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
CREATE INDEX IF NOT EXISTS idx_channels_tvg_id ON channels(tvg_id);
CREATE INDEX IF NOT EXISTS idx_epg_lookup ON epg_programs(channel_tvg_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_recents_last_watched ON recents(last_watched_at DESC);
