-- Manual pin-color override (ported from Sales Tracker's MANUAL_COLOR_OPTIONS).
-- Auto color is derived from interest_level + sample_given when this is blank.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS pin_color TEXT;
