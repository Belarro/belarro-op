-- Conversation tags on visits (Feature B) — tap-chips like "wants samples",
-- "price concern" captured per visit so nothing the chef says gets lost.
ALTER TABLE belarro_op_visit ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Opt-out flag, respected by broadcasts AND future contact features.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false;
ALTER TABLE belarro_v4_customer ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false;

-- Newsletter / broadcast (Feature A)
CREATE TABLE IF NOT EXISTS belarro_op_broadcast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body_de text,
  body_en text,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','both')),
  audience jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','done','failed')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS belarro_op_broadcast_recipient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES belarro_op_broadcast(id),
  location_id text,
  customer_id text,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  to_address text NOT NULL,
  language text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  error text,
  sent_at timestamptz,
  UNIQUE (broadcast_id, to_address, channel)
);

ALTER TABLE belarro_op_broadcast ENABLE ROW LEVEL SECURITY;
ALTER TABLE belarro_op_broadcast_recipient ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON belarro_op_broadcast FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service role only" ON belarro_op_broadcast_recipient FOR ALL USING (auth.role() = 'service_role');
