-- testimonials was the one entity in the app still using a hard DELETE,
-- inconsistent with the Data Protection Mandate (no hard deletes, ever).
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
