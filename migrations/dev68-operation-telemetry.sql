-- Additive migration; do not backfill or modify legacy telemetry.
CREATE TABLE IF NOT EXISTS pro_conversion_operations (
 operation_id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL,
 feature TEXT NOT NULL,
 started_at INTEGER,
 ended_at INTEGER,
 outcome TEXT CHECK(outcome IN ('success','failure','cancel')),
 stage TEXT NOT NULL DEFAULT 'none',
 error_code TEXT NOT NULL DEFAULT 'NONE',
 duration_ms INTEGER NOT NULL DEFAULT 0 CHECK(duration_ms BETWEEN 0 AND 3600000),
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pro_operations_started ON pro_conversion_operations(started_at);
CREATE INDEX IF NOT EXISTS idx_pro_operations_updated ON pro_conversion_operations(updated_at);
CREATE INDEX IF NOT EXISTS idx_pro_operations_session_updated ON pro_conversion_operations(session_id,updated_at);
