-- P0e: FTS5 trigram search over channel names and EPG title+description.
-- External-content FTS5 indexes mirroring `channels` and `epg_programs`.
-- Triggers keep the indexes in sync; the rebuild backfills pre-existing rows.

CREATE VIRTUAL TABLE channels_fts USING fts5(
  name, content='channels', content_rowid='id', tokenize='trigram');

CREATE TRIGGER channels_fts_ai AFTER INSERT ON channels BEGIN
  INSERT INTO channels_fts(rowid, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER channels_fts_ad AFTER DELETE ON channels BEGIN
  INSERT INTO channels_fts(channels_fts, rowid, name) VALUES('delete', old.id, old.name);
END;

CREATE TRIGGER channels_fts_au AFTER UPDATE ON channels BEGIN
  INSERT INTO channels_fts(channels_fts, rowid, name) VALUES('delete', old.id, old.name);
  INSERT INTO channels_fts(rowid, name) VALUES (new.id, new.name);
END;

INSERT INTO channels_fts(channels_fts) VALUES('rebuild');

CREATE VIRTUAL TABLE epg_programs_fts USING fts5(
  title, description, content='epg_programs', content_rowid='id', tokenize='trigram');

CREATE TRIGGER epg_programs_fts_ai AFTER INSERT ON epg_programs BEGIN
  INSERT INTO epg_programs_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

CREATE TRIGGER epg_programs_fts_ad AFTER DELETE ON epg_programs BEGIN
  INSERT INTO epg_programs_fts(epg_programs_fts, rowid, title, description) VALUES('delete', old.id, old.title, old.description);
END;

CREATE TRIGGER epg_programs_fts_au AFTER UPDATE ON epg_programs BEGIN
  INSERT INTO epg_programs_fts(epg_programs_fts, rowid, title, description) VALUES('delete', old.id, old.title, old.description);
  INSERT INTO epg_programs_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

INSERT INTO epg_programs_fts(epg_programs_fts) VALUES('rebuild');
