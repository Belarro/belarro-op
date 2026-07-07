import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

/**
 * Growth steps = the per-crop growth procedure stored in
 * belarro_v4_growth_procedure. This route is the single source of truth
 * for editing growth steps from the /admin/grow-procedure page.
 *
 * GET    /api/growth-steps              -> all procedures, hydrated with crop
 * GET    /api/growth-steps?crop_id=...  -> single procedure for a crop
 * POST   /api/growth-steps              -> upsert procedure for { crop_id, ...fields }
 */

// Columns that actually exist on belarro_v4_growth_procedure (verified live).
const STEP_FIELDS = [
  'soak_enabled', 'soak_hours', 'soak_notes',
  'cover_soil_enabled', 'cover_soil_notes',
  'stack_enabled', 'stack_days', 'stack_notes',
  'blackout_enabled', 'blackout_days', 'blackout_notes',
  'light_enabled', 'light_days', 'light_notes',
  'humidity_dome_enabled', 'humidity_dome_days', 'humidity_dome_notes',
] as const;

function pickFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of STEP_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const cropId = searchParams.get('crop_id');

    if (cropId) {
      const rows = await fetchFromSupabase(
        `/belarro_v4_growth_procedure?crop_id=eq.${cropId}&select=*`
      );
      return NextResponse.json({ success: true, data: rows[0] || null });
    }

    // All crops (not deleted) + their procedures, joined in app code.
    const crops = await fetchFromSupabase(
      `/belarro_v4_crop?deleted_at=is.null&select=id,name_en,name_de,status&order=name_en.asc`
    );
    const procedures = await fetchFromSupabase(
      `/belarro_v4_growth_procedure?select=*`
    );
    const procByCrop = new Map<string, any>(
      (procedures || []).map((p: any) => [p.crop_id, p])
    );

    const data = (crops || []).map((c: any) => ({
      crop: c,
      procedure: procByCrop.get(c.id) || null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Growth-steps GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const body = await request.json();
    const cropId = body.crop_id;

    if (!cropId) {
      return NextResponse.json(
        { success: false, error: 'crop_id is required' },
        { status: 400 }
      );
    }

    // Verify crop exists (ownership/integrity check).
    const crop = await fetchFromSupabase(
      `/belarro_v4_crop?id=eq.${cropId}&deleted_at=is.null&select=id`
    );
    if (!crop || crop.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Crop not found' },
        { status: 404 }
      );
    }

    const fields = pickFields(body);
    const now = new Date().toISOString();

    const existing = await fetchFromSupabase(
      `/belarro_v4_growth_procedure?crop_id=eq.${cropId}&select=id`
    );

    let result;
    if (existing && existing.length > 0) {
      result = await fetchFromSupabase(
        `/belarro_v4_growth_procedure?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ ...fields, updated_at: now }),
        }
      );
    } else {
      result = await fetchFromSupabase('/belarro_v4_growth_procedure', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          crop_id: cropId,
          ...fields,
        }),
      });
    }

    return NextResponse.json({ success: true, data: result ? result[0] : null });
  } catch (error) {
    console.error('Growth-steps POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
