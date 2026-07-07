import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    // Fetch all non-archived locations sorted by visit date
    const locations = await fetchFromSupabase(
      '/locations?select=id,location_name,contact_person,direct_phone,business_phone,direct_email,visit_notes,pipeline_stage,interest_level,timestamp,created_at,sales_rep&order=timestamp.desc.nullslast&limit=500'
    );

    console.log('Visits API — locations raw count:', Array.isArray(locations) ? locations.length : locations);

    const visits = (locations || []).map((loc: any) => ({
      location_id: loc.id,
      restaurant_name: loc.location_name,
      contact_person: loc.contact_person || null,
      phone: loc.direct_phone || loc.business_phone || null,
      email: loc.direct_email || null,
      visited_at: loc.timestamp,
      notes: loc.visit_notes || null,
      interest_level: loc.interest_level || null,
      pipeline_stage: loc.pipeline_stage || null,
      sales_rep: loc.sales_rep || null,
    }));

    return NextResponse.json({ success: true, data: visits });
  } catch (error) {
    console.error('Visits GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
