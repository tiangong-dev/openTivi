PRAGMA foreign_keys=OFF;

ALTER TABLE favorites RENAME TO favorites_old;
CREATE TABLE favorites (
  channel_id  INTEGER PRIMARY KEY,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
INSERT INTO favorites (channel_id, created_at)
SELECT channel_id, created_at
FROM favorites_old;
DROP TABLE favorites_old;

ALTER TABLE recents RENAME TO recents_old;
CREATE TABLE recents (
  channel_id       INTEGER PRIMARY KEY,
  last_watched_at  TEXT NOT NULL,
  play_count       INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
INSERT INTO recents (channel_id, last_watched_at, play_count)
SELECT channel_id, last_watched_at, play_count
FROM recents_old;
DROP TABLE recents_old;

ALTER TABLE channel_health RENAME TO channel_health_old;
CREATE TABLE channel_health (
  channel_id        INTEGER PRIMARY KEY,
  last_checked_at   TEXT,
  health_status     TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (health_status IN ('alive', 'dead', 'unknown')),
  response_time_ms  INTEGER,
  last_error        TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
INSERT INTO channel_health (channel_id, last_checked_at, health_status, response_time_ms, last_error)
SELECT channel_id, last_checked_at, health_status, response_time_ms, last_error
FROM channel_health_old;
DROP TABLE channel_health_old;

CREATE INDEX IF NOT EXISTS idx_channel_health_status_checked
  ON channel_health(health_status, last_checked_at);

PRAGMA foreign_keys=ON;
