-- belarro_v4_follow_up_status_check currently rejects 'skipped', which the
-- app has written for every soft-delete of a follow-up (DELETE
-- /api/follow-ups/[id]) since that endpoint was built. Every delete attempt
-- 400s: "new row ... violates check constraint belarro_v4_follow_up_status_check".
-- Drop and recreate the constraint to include every status value the app
-- actually writes (pending, completed, sent, replied, skipped).
ALTER TABLE belarro_v4_follow_up DROP CONSTRAINT IF EXISTS belarro_v4_follow_up_status_check;
ALTER TABLE belarro_v4_follow_up ADD CONSTRAINT belarro_v4_follow_up_status_check
  CHECK (status IN ('pending', 'completed', 'sent', 'replied', 'skipped'));
