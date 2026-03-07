CREATE TABLE IF NOT EXISTS epg_channel_aliases (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id        INTEGER NOT NULL,
  channel_tvg_id   TEXT NOT NULL,
  alias            TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
  UNIQUE (source_id, channel_tvg_id, alias_normalized)
);

CREATE INDEX IF NOT EXISTS idx_epg_alias_lookup ON epg_channel_aliases(alias_normalized, channel_tvg_id);
