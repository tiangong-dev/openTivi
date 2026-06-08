ALTER TABLE channels ADD COLUMN deleted_time TEXT;  -- NULL=存活, 时间戳=墓碑
CREATE INDEX IF NOT EXISTS idx_channels_deleted_time ON channels(deleted_time);
CREATE INDEX IF NOT EXISTS idx_channels_source_key_alive ON channels(source_id, channel_key, deleted_time);
