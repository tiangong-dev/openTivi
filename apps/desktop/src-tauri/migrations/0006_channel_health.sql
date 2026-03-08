CREATE TABLE IF NOT EXISTS channel_health (
  channel_id        INTEGER PRIMARY KEY,
  last_checked_at   TEXT,
  health_status     TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (health_status IN ('alive', 'dead', 'unknown')),
  response_time_ms  INTEGER,
  last_error        TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_health_status_checked
  ON channel_health(health_status, last_checked_at);
