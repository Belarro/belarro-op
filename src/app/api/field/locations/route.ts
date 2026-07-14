import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/session';

/**
 * Field visits — replaces the Google Sheet as the store for field work.
 * The `locations` table is the master record per place (same table the
 * follow-up system already uses); belarro_op_visit holds per-visit history.
 * Field set matches Sales Tracker's LocationPanel.jsx one-for-one.
 *
 * GET    /api/field/locations                 -> active locations, newest first, with visit_count
 * GET    /api/field/locations?history=<id>    -> visit history for one location
 * POST   /api/field/locations                 -> log a visit (see body shape below)
 * PATCH  /api/field/locations                 -> { id, archived?, pin_color?, pipeline_stage?,
 *                                                  follow_up_count?, last_follow_up_date?,
 *                                                  next_action_date?, next_action_type?,
 *                                                  automation_status?, notes_internal? }
 *      Used for archive/unarchive/delete (soft — sets archived='YES', hard
 *      delete is blocked by the DB trigger per the Data Protection Mandate)
 *      and for the quick-send "mark as sent" pipeline advance.
 *
 * POST body: { location_id?, location_name?, business_address?, contact_person?,
 *      contact_title?, direct_phone?, direct_email?, business_types?,
 *      business_website?, notes?, interest_level?, pipeline_stage?,
 *      follow_up_date?, sample_given?, uses_microgreens?, language?,
 *      lat?, lng?, place_id? }
 *      With location_id: appends a visit + updates the location row.
 *      Without: creates the location first (new place visited).
 */

async function sessionEmail(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('belarro_session')?.value;
  const session = token ? await verifySession(token) : null;
  return session?.email || null;
}

const LOCATION_SELECT_COLS = 'id,location_name,business_address,contact_person,contact_title,direct_phone,direct_email,business_types,business_website,business_phone,business_email,interest_level,pipeline_stage,visit_notes,timestamp,sales_rep,language,uses_microgreens,direct_link,follow_up_date,follow_up_count,last_follow_up_date,next_action_date,next_action_type,automation_status,notes_internal';

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

    // pin_color/lat/lng columns are added by later migrations — fall back to
    // the pre-migration column set if they haven't been applied yet, so this
    // endpoint doesn't 400 for everyone in the meantime.
    let locations;
    try {
      locations = await fetchFromSupabase(
        `/locations?archived=neq.YES&select=${LOCATION_SELECT_COLS},pin_color,lat,lng&order=timestamp.desc&limit=500`
      );
    } catch {
      try {
        locations = await fetchFromSupabase(
          `/locations?archived=neq.YES&select=${LOCATION_SELECT_COLS},lat,lng&order=timestamp.desc&limit=500`
        );
      } catch {
        locations = await fetchFromSupabase(
          `/locations?archived=neq.YES&select=${LOCATION_SELECT_COLS}&order=timestamp.desc&limit=500`
        );
      }
    }

    // Visit counts per location, for map pin badges (P0-7).
    const ids = (locations || []).map((l: any) => l.id);
    let countByLocation = new Map<string, number>();
    if (ids.length > 0) {
      try {
        const visits = await fetchFromSupabase(
          `/belarro_op_visit?location_id=in.(${ids.join(',')})&deleted_at=is.null&select=location_id`
        );
        for (const v of (visits || [])) {
          countByLocation.set(v.location_id, (countByLocation.get(v.location_id) || 0) + 1);
        }
      } catch {
        // non-fatal — counts just default to 0/1 below
      }
    }
    const withCounts = (locations || []).map((l: any) => ({
      ...l,
      visit_count: countByLocation.get(l.id) || 0,
    }));

    return NextResponse.json({ success: true, data: withCounts });
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
      location_id, location_name, business_address,
      contact_person, contact_title, direct_phone, direct_email,
      business_types, business_website, business_phone, business_email,
      notes, interest_level, pipeline_stage, follow_up_date, sample_given, uses_microgreens, language,
      lat, lng, direct_link, place_id,
    } = body;

    let locId = location_id;

    if (!locId) {
      // New place: create the location record first.
      if (!location_name) {
        return NextResponse.json({ success: false, error: 'location_id or location_name required' }, { status: 400 });
      }

      // locations has a unique constraint on (location_name, business_address)
      // — a plain re-insert 409s (raw Postgres error) if this exact place
      // already exists (even archived). Treat that as "revisit an existing
      // place" instead of crashing: look it up first and fall into the
      // existing-location branch below.
      if (business_address) {
        const existing = await fetchFromSupabase(
          `/locations?location_name=eq.${encodeURIComponent(location_name)}&business_address=eq.${encodeURIComponent(business_address)}&select=id&limit=1`
        );
        if (existing && existing.length > 0) {
          locId = existing[0].id;
        }
      }
    }

    if (!locId) {
      const row: Record<string, unknown> = {
        location_name,
        business_address: business_address || null,
        contact_person: contact_person || null,
        contact_title: contact_title || null,
        direct_phone: direct_phone || null,
        direct_email: direct_email || null,
        business_types: business_types || null,
        business_website: business_website || null,
        business_phone: business_phone || null,
        business_email: business_email || null,
        interest_level: interest_level || 'Follow Up',
        pipeline_stage: pipeline_stage || 'new_visit',
        visit_notes: notes || null,
        follow_up_date: follow_up_date || null,
        uses_microgreens: !!uses_microgreens,
        language: language || 'DE',
        sales_rep: email,
        timestamp: new Date().toISOString(),
        archived: 'NO',
        // direct_link doubles as the old Sales Tracker's coordinate carrier
        // ("LAT,LNG|PLACE_ID") for map pins before lat/lng columns existed.
        direct_link: direct_link || (lat && lng ? `${lat},${lng}${place_id ? `|${place_id}` : ''}` : null),
      };
      if (lat !== undefined && lat !== null) row.lat = lat;
      if (lng !== undefined && lng !== null) row.lng = lng;

      let created;
      try {
        created = await fetchFromSupabase('/locations', { method: 'POST', body: JSON.stringify(row) });
      } catch {
        // lat/lng columns not migrated yet — retry without them.
        delete row.lat; delete row.lng;
        created = await fetchFromSupabase('/locations', { method: 'POST', body: JSON.stringify(row) });
      }
      locId = created?.[0]?.id;
      if (!locId) return NextResponse.json({ success: false, error: 'Failed to create location' }, { status: 500 });
    } else {
      // Existing place: update the master record with the latest state.
      // Un-archive on a fresh visit — being visited again means it's back
      // in play, it shouldn't stay hidden from the map/list.
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), timestamp: new Date().toISOString(), archived: 'NO' };
      if (notes !== undefined) patch.visit_notes = notes;
      if (interest_level !== undefined) patch.interest_level = interest_level;
      if (pipeline_stage !== undefined) patch.pipeline_stage = pipeline_stage;
      if (follow_up_date !== undefined) patch.follow_up_date = follow_up_date;
      if (contact_person !== undefined) patch.contact_person = contact_person;
      if (contact_title !== undefined) patch.contact_title = contact_title;
      if (direct_phone !== undefined) patch.direct_phone = direct_phone;
      if (direct_email !== undefined) patch.direct_email = direct_email;
      if (business_types !== undefined) patch.business_types = business_types;
      if (business_website !== undefined) patch.business_website = business_website;
      if (uses_microgreens !== undefined) patch.uses_microgreens = !!uses_microgreens;
      if (language !== undefined) patch.language = language;
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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id, archived, pin_color, pipeline_stage,
      last_follow_up_date, next_action_date,
      next_action_type, automation_status, append_log_entry,
    } = body;

    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (archived !== undefined) patch.archived = archived;
    if (pipeline_stage !== undefined) patch.pipeline_stage = pipeline_stage;
    if (last_follow_up_date !== undefined) patch.last_follow_up_date = last_follow_up_date;
    if (next_action_date !== undefined) patch.next_action_date = next_action_date;
    if (next_action_type !== undefined) patch.next_action_type = next_action_type;
    if (automation_status !== undefined) patch.automation_status = automation_status;

    // Append (not replace) to the internal follow-up log + bump the count.
    if (append_log_entry) {
      const current = await fetchFromSupabase(`/locations?id=eq.${encodeURIComponent(id)}&select=notes_internal,follow_up_count`);
      const existingNotes = current?.[0]?.notes_internal || '';
      const existingCount = parseInt(current?.[0]?.follow_up_count || '0', 10) || 0;
      patch.notes_internal = existingNotes ? `${existingNotes}\n${append_log_entry}` : append_log_entry;
      patch.follow_up_count = String(existingCount + 1);
    }

    // pin_color column may not exist pre-migration — degrade gracefully.
    if (pin_color !== undefined) {
      try {
        await fetchFromSupabase(`/locations?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...patch, pin_color }),
        });
        return NextResponse.json({ success: true });
      } catch {
        // fall through and patch without pin_color
      }
    }

    await fetchFromSupabase(`/locations?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Field locations PATCH error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
