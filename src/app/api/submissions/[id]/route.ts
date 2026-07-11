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
    await fetchFromSupabase(`/form_submissions?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
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
    // Soft delete (Data Protection Mandate — never hard-delete lead/PII
    // data). form_submissions now also has a no-hard-delete DB trigger, so
    // a real DELETE throws.
    await fetchFromSupabase(`/form_submissions?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
