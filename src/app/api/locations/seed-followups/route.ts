import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

const OLD_LEAD_DAYS = 30;

function isOldLead(timestamp: string | null, createdAt: string | null): boolean {
  const dateStr = timestamp || createdAt;
  if (!dateStr) return true;
  const cleaned = String(dateStr).trim()
    .replace(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/, '$3-$2-$1')
    .replace(' ', 'T');
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return true;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24) > OLD_LEAD_DAYS;
}

const NEW_STAGES = [
  { stage: 1, follow_up_number: 1, follow_up_days: 0,  offset: 0 },
  { stage: 2, follow_up_number: 2, follow_up_days: 2,  offset: 2  * 24 * 60 * 60 * 1000 },
  { stage: 3, follow_up_number: 3, follow_up_days: 5,  offset: 5  * 24 * 60 * 60 * 1000 },
  { stage: 4, follow_up_number: 4, follow_up_days: 14, offset: 14 * 24 * 60 * 60 * 1000 },
  { stage: 5, follow_up_number: 5, follow_up_days: 30, offset: 30 * 24 * 60 * 60 * 1000 },
];

// Re-engage: 4 stages at 2h/2d/5d/30d — the 14-day stage is dropped entirely
// (not left blank). Cold contacts flatten hard after touch 3-4.
const REENGAGE_STAGES = [
  { stage: 1, follow_up_number: 1, follow_up_days: 0,  offset: 2 * 60 * 60 * 1000 },
  { stage: 2, follow_up_number: 2, follow_up_days: 2,  offset: 2  * 24 * 60 * 60 * 1000 },
  { stage: 3, follow_up_number: 3, follow_up_days: 5,  offset: 5  * 24 * 60 * 60 * 1000 },
  { stage: 4, follow_up_number: 4, follow_up_days: 30, offset: 30 * 24 * 60 * 60 * 1000 },
];

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const locations = await fetchFromSupabase(
      `/locations?select=id,location_name,timestamp,created_at&archived=neq.YES&pipeline_stage=neq.active`
    );

    if (!locations || locations.length === 0) {
      return NextResponse.json({ success: true, result: { created: 0, skipped: 0 } });
    }

    let created = 0;
    let skipped = 0;

    for (const loc of locations) {
      const existing = await fetchFromSupabase(
        `/belarro_v4_follow_up?location_id=eq.${loc.id}&select=id&limit=1`
      );
      if (existing && existing.length > 0) { skipped++; continue; }

      const base = new Date();
      const old = isOldLead(loc.timestamp, loc.created_at);
      const stages = old ? REENGAGE_STAGES : NEW_STAGES;

      for (const s of stages) {
        await fetchFromSupabase('/belarro_v4_follow_up', {
          method: 'POST',
          body: JSON.stringify({
            id: crypto.randomUUID(),
            location_id: loc.id,
            follow_up_number: s.follow_up_number,
            follow_up_days: s.follow_up_days,
            stage: s.stage,
            due_date: new Date(base.getTime() + s.offset).toISOString(),
            status: 'pending',
          }),
        });
      }
      created++;
    }

    return NextResponse.json({ success: true, result: { created, skipped } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
