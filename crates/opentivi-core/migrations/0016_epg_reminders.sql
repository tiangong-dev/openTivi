CREATE TABLE IF NOT EXISTS epg_reminders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id          INTEGER NOT NULL,
  program_start_epoch INTEGER NOT NULL,
  program_stop_epoch  INTEGER,
  program_title       TEXT    NOT NULL,
  program_desc        TEXT,
  fired_at            TEXT,
  created_at          TEXT    NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE (channel_id, program_start_epoch)
);
CREATE INDEX IF NOT EXISTS idx_epg_reminders_due ON epg_reminders(program_start_epoch, fired_at);
