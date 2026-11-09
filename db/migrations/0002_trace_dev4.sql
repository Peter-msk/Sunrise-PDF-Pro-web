-- PDF PRO ONLY. Apply after D1 export and private backup verification.
-- Additive Trace v2 DEV4 adaptation. No document bytes, filenames or raw stacks.
CREATE TABLE IF NOT EXISTS pro_trace_dev4 (
 trace_id TEXT PRIMARY KEY,
 operation_id TEXT NOT NULL UNIQUE,
 session_scope TEXT NOT NULL,
 happened_at INTEGER NOT NULL,
 feature TEXT NOT NULL,
 code TEXT NOT NULL,
 phase TEXT NOT NULL,
 module_id TEXT NOT NULL,
 callsite_id TEXT NOT NULL,
 size_bucket TEXT NOT NULL,
 browser TEXT NOT NULL,
 client_release TEXT NOT NULL,
 worker_version TEXT NOT NULL,
 duration_bucket TEXT NOT NULL,
 steps_json TEXT NOT NULL,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=8)
);
CREATE INDEX IF NOT EXISTS idx_pro_trace_dev4_recent ON pro_trace_dev4(happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_pro_trace_dev4_group ON pro_trace_dev4(fingerprint,happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_pro_trace_dev4_session ON pro_trace_dev4(session_scope,happened_at DESC);
CREATE TABLE IF NOT EXISTS pro_trace_dev4_incidents (
 fingerprint TEXT PRIMARY KEY CHECK(length(fingerprint)=8),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','investigating','fix_candidate','verifying','resolved','reopened')),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=400),
 fix_commit TEXT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 resolved_at INTEGER,
 CHECK(fix_commit IS NULL OR length(fix_commit)=40)
);
CREATE TABLE IF NOT EXISTS pro_trace_dev4_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 fingerprint TEXT NOT NULL REFERENCES pro_trace_dev4_incidents(fingerprint) ON DELETE CASCADE,
 status TEXT NOT NULL,
 note TEXT NOT NULL,
 fix_commit TEXT,
 revision INTEGER NOT NULL,
 happened_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pro_trace_dev4_audit ON pro_trace_dev4_audit(fingerprint,id DESC);