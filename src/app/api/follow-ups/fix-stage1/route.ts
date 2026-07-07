import { NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function POST() {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const now = new Date();
    // Today at midnight local = start of today in UTC
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();
    const todayEndISO = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    // Find all stage-1 pending rows not already set to today
    // Catches both "future" stuck rows AND rows from just-past-midnight (stored as yesterday UTC)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const stuckRows = await fetchFromSupabase(
      `/belarro_v4_follow_up?stage=eq.1&status=eq.pending&due_date=not.gte.${todayStartISO}&due_date=gte.${weekAgo}&select=id`
    );

    const futureRows = await fetchFromSupabase(
      `/belarro_v4_follow_up?stage=eq.1&status=eq.pending&due_date=gt.${todayEndISO}&select=id`
    );

    const allRows = [...(stuckRows || []), ...(futureRows || [])];

    if (allRows.length === 0) {
      return NextResponse.json({ success: true, fixed: 0 });
    }

    for (const row of allRows) {
      await fetchFromSupabase(`/belarro_v4_follow_up?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ due_date: todayStartISO }),
      });
    }

    return NextResponse.json({ success: true, fixed: allRows.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
