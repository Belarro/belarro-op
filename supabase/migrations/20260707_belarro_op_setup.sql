-- ============================================================================
-- BELARRO OP — unified admin + field app schema changes
-- ============================================================================
-- Run ONCE in the Supabase SQL editor. Idempotent (safe to re-run).
-- Adds: user roles, field-visit tables (replacing the Google Sheet), prospect
-- and note-template storage. Existing belarro_v4_* tables are untouched.
-- ============================================================================

BEGIN;

-- ── 1. USER ROLES ───────────────────────────────────────────────────────────
-- admin: everything. field: mobile field views (visits, tasks, follow-ups,
-- deliveries). farm: production + inventory only (gating wired later).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin'
  CHECK (role IN ('admin', 'field', 'farm'));
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- ── 2. FIELD VISITS (replaces the Google Sheet "Data" tab) ─────────────────
-- One row per visit to a location. The `locations` table (already used by
-- follow-ups) stays the master record per place; visits reference it.
CREATE TABLE IF NOT EXISTS belarro_op_visit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  visit_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sales_rep TEXT,
  contact_person TEXT,
  contact_role TEXT,
  interest_level TEXT,
  pipeline_stage TEXT,
  notes TEXT,
  sample_given BOOLEAN DEFAULT false,
  materials_sent BOOLEAN DEFAULT false,
  action_type TEXT,
  next_action_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_op_visit_location ON belarro_op_visit(location_id);
CREATE INDEX IF NOT EXISTS idx_op_visit_date ON belarro_op_visit(visit_date);

-- ── 3. PROSPECTS / TO-VISIT (replaces the Sheet "ToVisit" tab) ──────────────
CREATE TABLE IF NOT EXISTS belarro_op_prospect (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  notes TEXT,
  uses_microgreens BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- ── 4. NOTE TEMPLATES (replaces the Sheet templates tab) ────────────────────
CREATE TABLE IF NOT EXISTS belarro_op_note_template (
  id TEXT PRIMARY KEY,
  template TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- ── 5. RLS (dev-mode anon policies, consistent with the rest of the schema;
--          real gating happens at the app session layer) ────────────────────
ALTER TABLE belarro_op_visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE belarro_op_prospect ENABLE ROW LEVEL SECURITY;
ALTER TABLE belarro_op_note_template ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow anon select" ON belarro_op_visit FOR SELECT TO anon USING (true);
  CREATE POLICY "Allow anon insert" ON belarro_op_visit FOR INSERT TO anon WITH CHECK (true);
  CREATE POLICY "Allow anon update" ON belarro_op_visit FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow anon select" ON belarro_op_prospect FOR SELECT TO anon USING (true);
  CREATE POLICY "Allow anon insert" ON belarro_op_prospect FOR INSERT TO anon WITH CHECK (true);
  CREATE POLICY "Allow anon update" ON belarro_op_prospect FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow anon select" ON belarro_op_note_template FOR SELECT TO anon USING (true);
  CREATE POLICY "Allow anon insert" ON belarro_op_note_template FOR INSERT TO anon WITH CHECK (true);
  CREATE POLICY "Allow anon update" ON belarro_op_note_template FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. NO HARD DELETES (Data Protection Mandate) ────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER no_hard_delete_op_visit BEFORE DELETE ON belarro_op_visit
    FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
