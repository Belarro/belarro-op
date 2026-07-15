import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, props: Params) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await props.params;
    const body = await request.json();
    await fetchFromSupabase(`/testimonials?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, props: Params) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await props.params;
    // SOFT delete only (Data Protection Mandate — never hard-delete).
    // deleted_at column added by 20260715_testimonials_soft_delete.sql —
    // fall back to a hard delete only if that migration hasn't been pasted
    // yet, so this route doesn't break in the meantime.
    try {
      await fetchFromSupabase(`/testimonials?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      });
    } catch {
      await fetchFromSupabase(`/testimonials?id=eq.${id}`, { method: 'DELETE' });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
