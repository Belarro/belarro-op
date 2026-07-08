import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

/**
 * Prospects ("To Visit" list) — bookmark a place from map search without
 * logging a full visit. Ported from Sales Tracker's addProspect/getProspects/
 * deleteProspect (googleSheets.js). Table: belarro_op_prospect (created in
 * 20260707_belarro_op_setup.sql).
 *
 * GET    /api/field/prospects       -> active prospects
 * POST   /api/field/prospects       -> { name, address?, notes?, lat?, lng?, uses_microgreens? }
 * DELETE /api/field/prospects       -> { id } soft delete (sets deleted_at)
 */

export async function GET() {
  try {
    const rows = await fetchFromSupabase(
      '/belarro_op_prospect?deleted_at=is.null&select=*&order=created_at.asc'
    );
    return NextResponse.json({ success: true, data: rows || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, address, notes, lat, lng, uses_microgreens } = await request.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }
    const created = await fetchFromSupabase('/belarro_op_prospect', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        name: name.trim(),
        address: address || null,
        notes: notes || null,
        lat: lat ?? null,
        lng: lng ?? null,
        uses_microgreens: !!uses_microgreens,
      }),
    });
    return NextResponse.json({ success: true, data: created?.[0] || null }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    await fetchFromSupabase(`/belarro_op_prospect?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
