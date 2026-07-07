import { NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function GET() {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const data = await fetchFromSupabase('/form_submissions?order=created_at.desc');
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
