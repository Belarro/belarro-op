import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/session';

/**
 * Field visits — replaces the Google Sheet as the store for field work.
 * The `locations` table is the master record per place (same table the
 * follow-up system already uses); belarro_op_visit holds per-visit history.
 *
 * GET  /api/field/locations                 -> active locations, newest first
 * GET  /api/field/locations?history=<id>    -> visit history for one location
 * POST /api/field/locations                 -> log a visit; body:
 *      { location_id?, location_name?, business_address?, contact_person?,
 *        direct_phone?, notes?, interest_level?, pipeline_stage?,
 *        sample_given?, language? }
 *      With location_id: appends a visit + updates the location row.
 *      Without: creates the location first (new place visited).
 */

async function sessionEmail(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('belarro_session')?.value;
  const session = token ? await verifySession(token) : null;
  return session?.email || null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const historyId = searchParams.get('history');

    if (historyId) {
      const visits = await fetchFromSupabase(
        `/belarro_op_visit?location_id=eq.${encodeURIComponent(historyId)}&deleted_at=is.null&select=*&order=visit_date.desc&limit=50`
      );
      return NextResponse.json({ success: true, data: visits || [] });
    }

    const locations = await fetchFromSupabase(
      `/locations?archived=neq.YES&select=id,location_name,business_address,contact_person,direct_phone,interest_level,pipeline_stage,visit_notes,timestamp,sales_rep,language,uses_microgreens&order=timestamp.desc&limit=500`
    );
    return NextResponse.json({ success: true, data: locations || [] });
  } catch (error) {
    console.error('Field locations GET error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = await sessionEmail(request);
    const body = await request.json();
    const {
      location_id, location_name, business_address, contact_person, direct_phone,
      notes, interest_level, pipeline_stage, sample_given, language,
    } = body;

    let locId = location_id;

    if (!locId) {
      // New place: create the location record first.
      if (!location_name) {
        return NextResponse.json({ success: false, error: 'location_id or location_name required' }, { status: 400 });
      }
      const created = await fetchFromSupabase('/locations', {
        method: 'POST',
        body: JSON.stringify({
          location_name,
          business_address: business_address || null,
          contact_person: contact_person || null,
          direct_phone: direct_phone || null,
          interest_level: interest_level || 'Follow Up',
          pipeline_stage: pipeline_stage || 'new_visit',
          visit_notes: notes || null,
          language: language || 'DE',
          sales_rep: email,
          timestamp: new Date().toISOString(),
          archived: 'NO',
        }),
      });
      locId = created?.[0]?.id;
      if (!locId) return NextResponse.json({ success: false, error: 'Failed to create location' }, { status: 500 });
    } else {
      // Existing place: update the master record with the latest state.
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), timestamp: new Date().toISOString() };
      if (notes !== undefined) patch.visit_notes = notes;
      if (interest_level !== undefined) patch.interest_level = interest_level;
      if (pipeline_stage !== undefined) patch.pipeline_stage = pipeline_stage;
      if (contact_person !== undefined) patch.contact_person = contact_person;
      if (direct_phone !== undefined) patch.direct_phone = direct_phone;
      await fetchFromSupabase(`/locations?id=eq.${encodeURIComponent(locId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    }

    const visit = await fetchFromSupabase('/belarro_op_visit', {
      method: 'POST',
      body: JSON.stringify({
        location_id: locId,
        visit_date: new Date().toISOString(),
        sales_rep: email,
        contact_person: contact_person || null,
        interest_level: interest_level || null,
        pipeline_stage: pipeline_stage || null,
        notes: notes || null,
        sample_given: !!sample_given,
      }),
    });

    return NextResponse.json({ success: true, data: { location_id: locId, visit: visit?.[0] || null } }, { status: 201 });
  } catch (error) {
    console.error('Field locations POST error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
