import { fetchFromSupabase } from '@/lib/supabase';

// A lead older than this many days gets the re-engage flow (4 stages) instead
// of the new-lead flow (5 stages). Ron's call, July 14, 2026: 40 days.
export const OLD_LEAD_DAYS = 40;

export function isOldLead(timestamp: string | null, createdAt: string | null): boolean {
  const dateStr = timestamp || createdAt;
  if (!dateStr) return true;
  const cleaned = String(dateStr).trim()
    .replace(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/, '$3-$2-$1')
    .replace(' ', 'T');
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return true;
  const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > OLD_LEAD_DAYS;
}

// New-lead: 5 stages at 2h/2d/5d/14d/30d. Re-engage: 4 stages at 2h/2d/5d/30d
// — the 14-day stage is dropped entirely (not left blank).
const NEW_LEAD_STAGES = [
  { stage: 1, follow_up_number: 1, follow_up_days: 0,  offset: 2 * 60 * 60 * 1000 },
  { stage: 2, follow_up_number: 2, follow_up_days: 2,  offset: 2  * 24 * 60 * 60 * 1000 },
  { stage: 3, follow_up_number: 3, follow_up_days: 5,  offset: 5  * 24 * 60 * 60 * 1000 },
  { stage: 4, follow_up_number: 4, follow_up_days: 14, offset: 14 * 24 * 60 * 60 * 1000 },
  { stage: 5, follow_up_number: 5, follow_up_days: 30, offset: 30 * 24 * 60 * 60 * 1000 },
];
const REENGAGE_STAGES = [
  { stage: 1, follow_up_number: 1, follow_up_days: 0,  offset: 2 * 60 * 60 * 1000 },
  { stage: 2, follow_up_number: 2, follow_up_days: 2,  offset: 2  * 24 * 60 * 60 * 1000 },
  { stage: 3, follow_up_number: 3, follow_up_days: 5,  offset: 5  * 24 * 60 * 60 * 1000 },
  { stage: 4, follow_up_number: 4, follow_up_days: 30, offset: 30 * 24 * 60 * 60 * 1000 },
];

// Seed the follow-up drip for one location, unless it already has pending
// rows (idempotent — safe to call from multiple places, e.g. both the
// dedicated seed endpoint and location-creation paths). Shared so every
// place that creates a location seeds follow-ups the same way, regardless
// of whether it came from the field app or elsewhere.
export async function seedFollowUpsForLocation(locationId: string, visitedAt?: string | null): Promise<{ created: boolean }> {
  const existing = await fetchFromSupabase(
    `/belarro_v4_follow_up?location_id=eq.${locationId}&status=eq.pending&select=id&limit=1`
  );
  if (existing && existing.length > 0) return { created: false };

  const base = new Date(visitedAt || new Date()).getTime();
  const old = isOldLead(visitedAt ?? null, null);
  const stages = old ? REENGAGE_STAGES : NEW_LEAD_STAGES;

  for (const s of stages) {
    await fetchFromSupabase('/belarro_v4_follow_up', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        location_id: locationId,
        follow_up_number: s.follow_up_number,
        follow_up_days: s.follow_up_days,
        stage: s.stage,
        due_date: new Date(base + s.offset).toISOString(),
        status: 'pending',
      }),
    });
  }
  return { created: true };
}
