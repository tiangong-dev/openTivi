ALTER TABLE channels ADD COLUMN catchup_type   TEXT;
ALTER TABLE channels ADD COLUMN catchup_source TEXT;
ALTER TABLE channels ADD COLUMN catchup_days   TEXT;
ALTER TABLE channels ADD COLUMN catchup_hours  INTEGER;
ALTER TABLE sources  ADD COLUMN catchup_type   TEXT;
ALTER TABLE sources  ADD COLUMN catchup_source TEXT;
ALTER TABLE sources  ADD COLUMN catchup_days   TEXT;
ALTER TABLE sources  ADD COLUMN catchup_hours  INTEGER;
