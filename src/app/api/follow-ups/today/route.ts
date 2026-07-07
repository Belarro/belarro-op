import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

// Dashboard widget: follow-ups actually due today (or overdue).
// Mirrors the follow-ups page logic — only the NEXT pending stage per
// location, excluding archived locations and active/snoozed pipeline —
// otherwise the widget counts every future stage of every lead and shows
// hundreds of "due" items with unresolvable customer names.

export async function GET(_request: NextRequest) {
  try {
    const now = new Date();
    const endOfToday = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999
    ).toISOString();
    const startOfTodayMs = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0
    ).getTime();

    const followups = (await fetchFromSupabase(
      `/belarro_v4_follow_up?status=eq.pending&location_id=not.is.null&select=*&order=due_date.asc`
    )) || [];
    if (followups.length === 0) {
      return NextResponse.json({ success: true, data: [], count: 0 });
    }

    const locationIds = [...new Set(followups.map((f: any) => f.location_id))];
    const idFilter = locationIds.map((id: any) => `id.eq.${id}`).join(',');
    const locations = (await fetchFromSupabase(
      `/locations?or=(${idFilter})&archived=neq.YES&select=id,location_name,contact_person,direct_phone,business_phone,direct_email,business_email,pipeline_stage`
    )) || [];
    const locMap = new Map<string, any>(locations.map((l: any) => [l.id, l]));

    // Stages where follow-ups must stop (client won, lost, or snoozed)
    const STOPPED_STAGES = new Set(['active', 'snoozed', 'closed_won', 'closed_lost', 'converted']);

    // Only the next (lowest-stage) pending follow-up per location
    const nextPerLocation = new Map<string, any>();
    for (const f of followups) {
      const loc = locMap.get(f.location_id);
      if (!loc) continue;
      if (STOPPED_STAGES.has(loc.pipeline_stage)) continue;
      const stage = f.stage || f.follow_up_number || 1;
      const existing = nextPerLocation.get(f.location_id);
      if (!existing || stage < (existing.stage || existing.follow_up_number || 1)) {
        nextPerLocation.set(f.location_id, { ...f, stage });
      }
    }

    const data = Array.from(nextPerLocation.values())
      .filter((f: any) => f.due_date <= endOfToday)
      .map((f: any) => {
        const loc = locMap.get(f.location_id);
        const phone = loc.direct_phone || loc.business_phone || null;
        return {
          ...f,
          customer: {
            id: loc.id,
            name: loc.location_name,
            restaurant_name: loc.location_name,
            contact_person: loc.contact_person || null,
            phone,
            whatsapp: phone ? phone.replace(/\D/g, '') : null,
            email: loc.direct_email || loc.business_email || null,
          },
          is_overdue: new Date(f.due_date).getTime() < startOfTodayMs,
        };
      })
      .sort((a: any, b: any) => a.due_date.localeCompare(b.due_date));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('Follow-ups today GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
