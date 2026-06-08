CREATE TABLE IF NOT EXISTS channel_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL,
  name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
  UNIQUE (source_id, name));
CREATE TABLE IF NOT EXISTS channel_group_links (
  channel_id INTEGER NOT NULL, group_id INTEGER NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, group_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES channel_groups(id) ON DELETE CASCADE,
  UNIQUE (channel_id, group_id));
CREATE INDEX IF NOT EXISTS idx_channel_group_links_group ON channel_group_links(group_id);
CREATE INDEX IF NOT EXISTS idx_channel_group_links_channel ON channel_group_links(channel_id);
