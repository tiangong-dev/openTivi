CREATE TABLE IF NOT EXISTS sources (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kind             TEXT NOT NULL CHECK (kind IN ('m3u', 'xtream', 'xmltv')),
  name             TEXT NOT NULL,
  location         TEXT NOT NULL,
  username         TEXT,
  password         TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  last_imported_at TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_key         TEXT NOT NULL UNIQUE,
  source_id           INTEGER NOT NULL,
  external_id         TEXT,
  name                TEXT NOT NULL,
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
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS epg_programs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id      INTEGER NOT NULL,
  channel_tvg_id TEXT NOT NULL,
  start_at       TEXT NOT NULL,
  end_at         TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT,
  created_at     TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
  UNIQUE (source_id, channel_tvg_id, start_at, end_at, title)
);

CREATE TABLE IF NOT EXISTS favorites (
  channel_id  INTEGER PRIMARY KEY,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recents (
  channel_id       INTEGER PRIMARY KEY,
  last_watched_at  TEXT NOT NULL,
  play_count       INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
