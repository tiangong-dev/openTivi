ALTER TABLE channels ADD COLUMN normalized_name TEXT;

CREATE INDEX IF NOT EXISTS idx_channels_normalized_name
  ON channels(normalized_name);
