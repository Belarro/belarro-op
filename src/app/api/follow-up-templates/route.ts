import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

// Follow-up message templates — database-backed, admin-editable.
// Source of truth per FOLLOWUP_SYSTEM_SPEC.md Part 3. Replaces the old
// hardcoded NEW_EN/NEW_DE/REENGAGE_EN/REENGAGE_DE objects.

// Allow-list of bracket placeholders that buildMessage() actually substitutes.
// If a new placeholder (e.g. [Restaurant]) is ever wanted, it must be added
// here AND to the substitution logic in the same change — never one without
// the other. This is exactly the bug class Part 2 fixed.
const ALLOWED_PLACEHOLDERS = new Set(['Name']);

export function findInvalidPlaceholder(body: string): string | null {
  const matches = body.match(/\[([^\]]+)\]/g) || [];
  for (const m of matches) {
    const token = m.slice(1, -1);
    if (!ALLOWED_PLACEHOLDERS.has(token)) return token;
  }
  return null;
}

export async function GET() {
  try {
    const templates = await fetchFromSupabase(
      '/belarro_v4_followup_template?select=*&order=flow.asc,stage.asc,language.asc'
    );
    return NextResponse.json({ success: true, data: templates || [] });
  } catch (error) {
    console.error('Follow-up templates GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, body: templateBody, updated_by } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }
    if (!title || !templateBody) {
      return NextResponse.json({ success: false, error: 'title and body are required' }, { status: 400 });
    }

    const invalid = findInvalidPlaceholder(templateBody);
    if (invalid) {
      return NextResponse.json(
        { success: false, error: `Unknown placeholder [${invalid}] — only [Name] is supported` },
        { status: 400 }
      );
    }

    const updated = await fetchFromSupabase(`/belarro_v4_followup_template?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title,
        body: templateBody,
        updated_at: new Date().toISOString(),
        updated_by: updated_by || 'Ron',
      }),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Follow-up templates PUT error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
