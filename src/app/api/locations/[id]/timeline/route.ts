import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

/**
 * Full conversation history for one place — every visit (with tags/notes)
 * and every follow-up message actually sent, merged and sorted newest
 * first. Read-only. Feature B (July 15, 2026): "keep everything the chef
 * told us" in one scrollable view instead of scattered across pages.
 *
 * GET /api/locations/[id]/timeline
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, props: Params) {
  try {
    const { id } = await props.params;
    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

    const [visits, followUps] = await Promise.all([
      fetchFromSupabase(
        `/belarro_op_visit?location_id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=*&order=visit_date.desc`
      ),
      fetchFromSupabase(
        `/belarro_v4_follow_up?location_id=eq.${encodeURIComponent(id)}&select=*&order=due_date.desc`
      ),
    ]);

    const visitEvents = (visits || []).map((v: any) => ({
      type: 'visit' as const,
      date: v.visit_date,
      sales_rep: v.sales_rep || null,
      notes: v.notes || null,
      tags: v.tags || [],
      sample_given: !!v.sample_given,
      interest_level: v.interest_level || null,
    }));

    const sentFollowUps = (followUps || [])
      .filter((f: any) => (f.status === 'completed' || f.status === 'sent') && (f.sent_date || f.sent_via))
      .map((f: any) => ({
        type: 'follow_up' as const,
        date: f.sent_date || f.due_date,
        stage: f.stage ?? f.follow_up_number ?? null,
        sent_via: f.sent_via || null,
      }));

    const timeline = [...visitEvents, ...sentFollowUps].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return NextResponse.json({ success: true, data: timeline });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
