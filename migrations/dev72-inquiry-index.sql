-- Additive, idempotent index. Apply before release or as a separate migration.
CREATE INDEX IF NOT EXISTS idx_pro_inquiries_email_time ON pro_inquiries(lower(email),created_at);
