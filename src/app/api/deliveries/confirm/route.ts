import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/session';

const SYNC_SECRET = process.env.SALETRACKER_SYNC_SECRET || '';

// See due/route.ts — same cross-origin browser call from Sales Tracker,
// same CORS requirement (no headers = "Failed to fetch" before our code runs).
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === (process.env.SALETRACKER_URL || 'https://sales.belarro.com')) return true;
  if (/^https:\/\/sales-tracker[a-z0-9.-]*\.vercel\.app$/.test(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = isAllowedOrigin(origin) ? origin! : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-sync-secret',
    'Vary': 'Origin',
  };
}

/**
 * POST /api/deliveries/confirm
 * body: { order_id, delivery_date (YYYY-MM-DD), status: 'delivered'|'adjusted'|'not_delivered',
 *         actual_qty?, note?, confirmed_by? }
 *
 * Writes ONE immutable ledger row per (order_id, delivery_date). This is the
 * ground truth for "what actually happened" — invoices and past-month
 * reporting read this table, never the live order config, so editing an
 * order today can't rewrite history. Re-confirming the same line/week
 * upserts (a correction), it does not duplicate (unique constraint on the
 * table handles this via PostgREST's on_conflict).
 *
 * Auth: admin session cookie (browser) OR x-sync-secret header (Sales Tracker
 * app — same shared-secret pattern as /api/sync-sales-tracker).
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);
  try {
    const headerSecret = request.headers.get('x-sync-secret');
    const hasSecret = !!SYNC_SECRET && headerSecret === SYNC_SECRET;
    // This route is in middleware.ts's PUBLIC_API list (Sales Tracker calls
    // it cross-origin with x-sync-secret instead of a session cookie), so
    // middleware never verifies the session for it — this route must do
    // that itself. A mere cookie-presence check isn't enough since anyone
    // can send an unsigned/garbage belarro_session value and write
    // delivery confirmations with no real credentials.
    const token = request.cookies.get('belarro_session')?.value;
    const session = token ? await verifySession(token) : null;
    if (!hasSecret && !session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers });
    }

    const body = await request.json();
    let { status } = body;
    const { order_id, delivery_date, actual_qty, note, confirmed_by } = body;

    if (!order_id || !delivery_date || !status) {
      return NextResponse.json(
        { success: false, error: 'order_id, delivery_date, and status are required' },
        { status: 400, headers }
      );
    }
    if (!['delivered', 'adjusted', 'not_delivered'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400, headers });
    }
    // An "adjusted" confirmation with actual_qty 0 is really "not delivered"
    // — storing it as adjusted/0 renders as a confusing "Adjusted, Actual 0"
    // badge on both the field app and admin website, which reads like a bug.
    if (status === 'adjusted' && Number(actual_qty) === 0) status = 'not_delivered';

    const order = await fetchFromSupabase(`/belarro_v4_order?id=eq.${order_id}&select=*`);
    if (!order || order.length === 0) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404, headers });
    }
    const orderData = order[0];

    const [variant, customer] = await Promise.all([
      fetchFromSupabase(`/belarro_v4_product_variant?id=eq.${orderData.product_variant_id}&select=*`),
      fetchFromSupabase(`/belarro_v4_customer?id=eq.${orderData.customer_id}&select=id`),
    ]);
    const variantData = variant?.[0];
    if (!customer || customer.length === 0) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404, headers });
    }
    let cropName = 'Unknown';
    if (variantData) {
      const crop = await fetchFromSupabase(`/belarro_v4_crop?id=eq.${variantData.crop_id}&select=name_en`);
      if (crop && crop.length > 0) cropName = crop[0].name_en;
    }

    const expectedQty = orderData.quantity || 1;
    const resolvedActualQty = status === 'not_delivered' ? 0 : (actual_qty !== undefined && actual_qty !== null ? Number(actual_qty) : expectedQty);

    const row = {
      order_id,
      customer_id: orderData.customer_id,
      delivery_date,
      crop_name: cropName,
      size_name: variantData?.size_name || null,
      expected_qty: expectedQty,
      actual_qty: resolvedActualQty,
      unit_price_eur: variantData?.price_eur ?? 0,
      status,
      note: note || null,
      confirmed_by: confirmed_by || null,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Upsert on (order_id, delivery_date) — a correction replaces, never duplicates.
    // Must include soft-deleted rows here too: the DB has a real unique
    // constraint on (order_id, delivery_date) regardless of deleted_at, and
    // hard deletes are blocked at the DB level, so a soft-deleted row's key
    // is permanently occupied. Re-confirming has to find and revive it
    // (clearing deleted_at) instead of trying to INSERT a new row, which
    // would 409 on the unique constraint every time.
    const existing = await fetchFromSupabase(
      `/belarro_v4_delivery?order_id=eq.${order_id}&delivery_date=eq.${delivery_date}&select=id`
    );

    let saved;
    if (existing && existing.length > 0) {
      saved = await fetchFromSupabase(`/belarro_v4_delivery?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...row, deleted_at: null }),
      });
    } else {
      const id = crypto.randomUUID();
      saved = await fetchFromSupabase('/belarro_v4_delivery', {
        method: 'POST',
        body: JSON.stringify({ id, ...row }),
      });
    }

    return NextResponse.json({ success: true, data: saved ? saved[0] : row }, { headers });
  } catch (error) {
    console.error('Deliveries confirm POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers }
    );
  }
}
