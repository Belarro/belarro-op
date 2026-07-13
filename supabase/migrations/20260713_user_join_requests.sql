-- User join request workflow table
-- Users submit join requests at /join
-- Admin approves/rejects at /admin with join-requests widget
-- On approval: generates temp token (24h expiry) + setup link
-- User sets password at /set-password using token
-- Then logs in with email + password

CREATE TABLE IF NOT EXISTS user_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approval_token TEXT UNIQUE,
  approved_until TIMESTAMP WITH TIME ZONE,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_join_requests_status ON user_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_join_requests_email ON user_join_requests(email);
CREATE INDEX IF NOT EXISTS idx_user_join_requests_token ON user_join_requests(approval_token);

-- RLS (dev-mode anon access consistent with rest of schema)
ALTER TABLE user_join_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow anon select" ON user_join_requests FOR SELECT TO anon USING (true);
  CREATE POLICY "Allow anon insert" ON user_join_requests FOR INSERT TO anon WITH CHECK (true);
  CREATE POLICY "Allow anon update" ON user_join_requests FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
