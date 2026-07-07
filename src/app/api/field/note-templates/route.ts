import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

// Reusable visit-note snippets, ported from Sales Tracker's note-templates
// tab. GET returns plain strings for the VisitForm quick-insert chips.
export async function GET() {
  try {
    const rows = await fetchFromSupabase('/belarro_op_note_template?deleted_at=is.null&select=template&order=created_at.asc');
    return NextResponse.json({ success: true, data: (rows || []).map((r: any) => r.template) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { template } = await request.json();
    if (!template || !template.trim()) {
      return NextResponse.json({ success: false, error: 'template is required' }, { status: 400 });
    }
    await fetchFromSupabase('/belarro_op_note_template', {
      method: 'POST',
      body: JSON.stringify({ id: crypto.randomUUID(), template: template.trim() }),
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
