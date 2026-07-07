import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function GET() {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const data = await fetchFromSupabase('/testimonials?order=sort_order.asc');
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const body = await request.json();
    const data = await fetchFromSupabase('/testimonials', {
      method: 'POST',
      body: JSON.stringify({ ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
    return NextResponse.json({ success: true, data: data?.[0] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
