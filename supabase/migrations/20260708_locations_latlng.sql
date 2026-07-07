-- Add lat/lng to locations so the map doesn't have to re-geocode every load.
-- Existing rows keep using direct_link parsing as a fallback (same as the
-- old Sales Tracker) until backfilled; new visits from the map write these
-- columns directly.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
