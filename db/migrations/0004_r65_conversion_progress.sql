-- R65: append-only, privacy-limited conversion phase measurements.
-- The existing pro_telemetry table (188+ historical events) is NOT rewritten.
-- Existing CHECK constraint intentionally remains unchanged to avoid data loss.
CREATE TABLE IF NOT EXISTS pro_telemetry_progress (
 event_id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL,
 happened_at INTEGER NOT NULL,
 feature TEXT NOT NULL,
 stage TEXT NOT NULL,
 duration_ms INTEGER NOT NULL CHECK(duration_ms>=0 AND duration_ms<=3600000)
);
CREATE INDEX IF NOT EXISTS idx_pro_progress_time
 ON pro_telemetry_progress(happened_at);
CREATE INDEX IF NOT EXISTS idx_pro_progress_session
 ON pro_telemetry_progress(session_id,happened_at);
