ALTER TABLE sources ADD COLUMN disabled_reason TEXT;
ALTER TABLE sources ADD COLUMN last_refresh_error TEXT;
ALTER TABLE sources ADD COLUMN last_refresh_attempt_at TEXT;
ALTER TABLE sources ADD COLUMN consecutive_refresh_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN next_retry_at TEXT;
