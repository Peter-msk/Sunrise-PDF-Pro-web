-- Sunrise PDF PRO(web) only. Apply to a new dedicated D1 database, never Editor D1.
-- All event fields are non-content diagnostics; NO filename, PDF content, free-text stack, IP address.
CREATE TABLE IF NOT EXISTS pro_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pro_admin_sessions_expiry ON pro_admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS pro_admin_login_limits (
  subject_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pro_admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pro_telemetry (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  happened_at INTEGER NOT NULL,
  event_kind TEXT NOT NULL CHECK(event_kind IN('visit','convert_start','convert_success','convert_failure','convert_cancel','render_error','active_30s')),
  feature TEXT NOT NULL,
  stage TEXT NOT NULL,
  error_code TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pro_telemetry_session ON pro_telemetry(session_id,happened_at);
CREATE INDEX IF NOT EXISTS idx_pro_telemetry_time ON pro_telemetry(happened_at);
CREATE INDEX IF NOT EXISTS idx_pro_telemetry_error ON pro_telemetry(event_kind,error_code,happened_at);

CREATE TABLE IF NOT EXISTS pro_inquiries (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('new','in_progress','resolved')),
  admin_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pro_inquiries_date ON pro_inquiries(created_at DESC);

CREATE TABLE IF NOT EXISTS pro_publications (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN('announcement','release')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN('draft','published','archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  first_published_at INTEGER,
  expire_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pro_publications_state ON pro_publications(kind,state,first_published_at DESC);

CREATE TABLE IF NOT EXISTS pro_admin_audit (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL DEFAULT '',
  subject_id TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL CHECK(outcome IN('success','denied','failure'))
);
CREATE INDEX IF NOT EXISTS idx_pro_admin_audit_date ON pro_admin_audit(occurred_at DESC);
