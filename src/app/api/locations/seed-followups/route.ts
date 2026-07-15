import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { seedFollowUpsForLocation } from '@/lib/followups';
// import removed

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
      const result = await seedFollowUpsForLocation(loc.id, loc.timestamp || loc.created_at);
      if (result.created) created++; else skipped++;
    }

    return NextResponse.json({ success: true, result: { created, skipped } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
