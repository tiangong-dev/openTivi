PRAGMA foreign_keys=OFF;

ALTER TABLE channels RENAME TO channels_old;

CREATE TABLE channels (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_key         TEXT NOT NULL,
  source_id           INTEGER NOT NULL,
  external_id         TEXT,
  name                TEXT NOT NULL,
  normalized_name     TEXT,
  channel_number      TEXT,
  group_name          TEXT,
  tvg_id              TEXT,
  tvg_name            TEXT,
  logo_url            TEXT,
  stream_url          TEXT NOT NULL,
  container_extension TEXT,
  is_live             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
  UNIQUE (source_id, channel_key)
);

INSERT INTO channels (
  id,
  channel_key,
  source_id,
  external_id,
  name,
  normalized_name,
  channel_number,
  group_name,
  tvg_id,
  tvg_name,
  logo_url,
  stream_url,
  container_extension,
  is_live,
  created_at,
  updated_at
)
SELECT
  id,
  channel_key,
  source_id,
  external_id,
  name,
  normalized_name,
  channel_number,
  group_name,
  tvg_id,
  tvg_name,
  logo_url,
  stream_url,
  container_extension,
  is_live,
  created_at,
  updated_at
FROM channels_old;

DROP TABLE channels_old;

CREATE INDEX IF NOT EXISTS idx_channels_source_group ON channels(source_id, group_name);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
CREATE INDEX IF NOT EXISTS idx_channels_tvg_id ON channels(tvg_id);
CREATE INDEX IF NOT EXISTS idx_channels_normalized_name ON channels(normalized_name);

PRAGMA foreign_keys=ON;
