import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const { location_id, days } = await request.json();
    if (!location_id) return NextResponse.json({ success: false, error: 'location_id required' }, { status: 400 });
    const SNOOZE_DAYS = [30, 60, 90].includes(days) ? days : 90;

    // 1. Mark location as snoozed
    await fetchFromSupabase(`/locations?id=eq.${location_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pipeline_stage: 'snoozed', updated_at: new Date().toISOString() }),
    });

    // 2. Cancel all pending follow-ups
    await fetchFromSupabase(`/belarro_v4_follow_up?location_id=eq.${location_id}&status=eq.pending`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString() }),
    });

    // 3. Create one wake-up follow-up in 90 days (re-engage stage 1)
    const wakeDate = new Date();
    wakeDate.setDate(wakeDate.getDate() + SNOOZE_DAYS);

    await fetchFromSupabase('/belarro_v4_follow_up', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        location_id,
        stage: 1,
        follow_up_number: 1,
        follow_up_days: SNOOZE_DAYS,
        due_date: wakeDate.toISOString(),
        status: 'pending',
      }),
    });

    return NextResponse.json({ success: true, wake_date: wakeDate.toISOString().split('T')[0] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
