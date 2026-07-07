import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

type Params = {
  params: Promise<{ id: string }>
}

// Add N business days (skip Sat=6, Sun=0) to a date
function addBusinessDays(from: Date, days: number): Date {
  if (days === 0) return from;
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

// Days between stages — new-lead is 5 stages (2h/2d/5d/14d/30d), re-engage is
// 4 stages (2h/2d/5d/30d, no 14-day stage). See FOLLOWUP_COPY_V2.md.
const NEW_STAGE_GAPS: Record<number, number> = { 1: 0, 2: 2, 3: 5, 4: 14, 5: 30 };
const REENGAGE_STAGE_GAPS: Record<number, number> = { 1: 0, 2: 2, 3: 5, 4: 30 };

const OLD_LEAD_DAYS = 30;

function isOldLead(timestamp: string | null, createdAt: string | null): boolean {
  const dateStr = timestamp || createdAt;
  if (!dateStr) return true;
  const cleaned = String(dateStr).trim()
    .replace(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/, '$3-$2-$1')
    .replace(' ', 'T');
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return true;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24) > OLD_LEAD_DAYS;
}

export async function DELETE(_request: NextRequest, props: Params) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await props.params;

    // Get the follow-up to find location_id
    const current = await fetchFromSupabase(`/belarro_v4_follow_up?id=eq.${id}&select=location_id`);
    const locationId = current?.[0]?.location_id;

    // SOFT delete only (data protection rule — never hard-delete leads).
    // Skipped follow-ups and archived locations are filtered out of every
    // list, but the data stays recoverable.
    const now = new Date().toISOString();
    if (locationId) {
      await fetchFromSupabase(`/belarro_v4_follow_up?location_id=eq.${locationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'skipped', updated_at: now }),
      });
      await fetchFromSupabase(`/locations?id=eq.${locationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: 'YES' }),
      });
    } else {
      await fetchFromSupabase(`/belarro_v4_follow_up?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'skipped', updated_at: now }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Follow-up DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, props: Params) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await props.params;
    const body = await request.json();
    const { status, sent_via, notes } = body;

    if (!status) {
      return NextResponse.json({ success: false, error: 'status is required' }, { status: 400 });
    }

    const now = new Date();

    // Partial update: record which channels were sent (email/whatsapp) while
    // the stage stays open. Persists the ✓ marks across page reloads so the
    // same message can't be sent twice by mistake. No stage advance.
    if (status === 'pending') {
      await fetchFromSupabase(`/belarro_v4_follow_up?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sent_via: sent_via || null, updated_at: now.toISOString() }),
      });
      return NextResponse.json({ success: true, message: 'Channel recorded' });
    }

    // Mark this stage as completed
    await fetchFromSupabase(`/belarro_v4_follow_up?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        sent_via: sent_via || null,
        sent_date: status === 'completed' || status === 'sent' ? now.toISOString() : null,
        notes: notes || null,
        updated_at: now.toISOString()
      })
    });

    // Recalculate next stage due date from actual sent time (not for replied — that's manual)
    if (status === 'completed' || status === 'sent') {
      // Get this follow-up to find location_id and stage
      const current = await fetchFromSupabase(`/belarro_v4_follow_up?id=eq.${id}&select=*`);
      if (current && current.length > 0) {
        const cur = current[0];
        const nextStage = (cur.stage || cur.follow_up_number || 1) + 1;

        // Find next pending stage for this location
        const next = await fetchFromSupabase(
          `/belarro_v4_follow_up?location_id=eq.${cur.location_id}&stage=eq.${nextStage}&status=eq.pending&select=id,stage,follow_up_days`
        );

        if (next && next.length > 0) {
          const n = next[0];
          // New-lead and re-engage have different stage counts/gaps now, so
          // we must look up the location's visit date to know which flow
          // this lead is on before picking a gap table.
          const loc = await fetchFromSupabase(
            `/locations?id=eq.${cur.location_id}&select=timestamp,created_at`
          );
          const flow: 'new' | 'reengage' = isOldLead(loc?.[0]?.timestamp, loc?.[0]?.created_at) ? 'reengage' : 'new';
          const STAGE_GAPS = flow === 'reengage' ? REENGAGE_STAGE_GAPS : NEW_STAGE_GAPS;
          // Gap values are cumulative days from the visit, so the next stage
          // comes (gap[next] - gap[current]) days after this send.
          const curStage = cur.stage || cur.follow_up_number || 1;
          const daysToAdd = Math.max(
            (STAGE_GAPS[nextStage] ?? n.follow_up_days ?? 2) - (STAGE_GAPS[curStage] ?? 0),
            1
          );
          const newDueDate = addBusinessDays(now, daysToAdd);

          await fetchFromSupabase(`/belarro_v4_follow_up?id=eq.${n.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              due_date: newDueDate.toISOString(),
              updated_at: now.toISOString()
            })
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Follow-up logged successfully'
    });
  } catch (error) {
    console.error('Follow-up PUT error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
