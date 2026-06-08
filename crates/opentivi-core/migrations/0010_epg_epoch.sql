ALTER TABLE epg_programs ADD COLUMN start_epoch INTEGER;
ALTER TABLE epg_programs ADD COLUMN end_epoch   INTEGER;
CREATE INDEX IF NOT EXISTS idx_epg_epoch ON epg_programs(channel_tvg_id, start_epoch, end_epoch);
