ALTER TABLE channels ADD COLUMN user_agent TEXT;
ALTER TABLE channels ADD COLUMN referer    TEXT;
ALTER TABLE sources  ADD COLUMN user_agent TEXT;
ALTER TABLE sources  ADD COLUMN referer    TEXT;
