import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import {
  addDays,
  deliversOnTuesday,
  effectiveGrowDays,
  localMidnight,
  nextTuesdayOnOrAfter,
  ymd,
} from '@/lib/seeding';

const SYNC_SECRET = process.env.SALETRACKER_SYNC_SECRET || '';

// Sales Tracker is a separate origin (Vercel project "sales-tracker") calling
// this route directly from the browser with a custom x-sync-secret header,
// which triggers a CORS preflight. Without these headers the browser blocks
// the request before our code ever runs ("Failed to fetch" in the console).
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-sync-secret',
    'Vary': 'Origin',
  };
}

/**
 * GET /api/deliveries/due?date=YYYY-MM-DD (defaults to next Tuesday on/after today)
 *
 * What each customer is due to receive on that Tuesday, with whatever has
 * already been confirmed in belarro_v4_delivery merged in — so Sales Tracker
 * can show "Pending" vs "Delivered" vs "Adjusted" vs "Not delivered" per line
 * without recomputing anything client-side.
 *
 * Auth: admin session cookie (browser) OR x-sync-secret header (Sales Tracker
 * app, which writes to Supabase directly and doesn't hold an admin session).
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);
  try {
    const headerSecret = request.headers.get('x-sync-secret');
    const hasSecret = !!SYNC_SECRET && headerSecret === SYNC_SECRET;
    // Fall through to middleware's session check if no valid secret — the
    // matcher already ran before this handler, so reaching here means either
    // a valid session or this route being explicitly public. We require one
    // of the two explicitly since this route also carries pricing data.
    if (!hasSecret && !request.cookies.get('belarro_session')?.value) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const today = localMidnight(new Date());
    const targetDate = dateParam ? localMidnight(new Date(`${dateParam}T00:00:00`)) : nextTuesdayOnOrAfter(today);
    const targetKey = ymd(targetDate);

    // Orders admin page is the single source of truth: only orders that are
    // currently active there may appear here. No "draining"/grace-period
    // logic for removed orders — if it's not active on Orders, it's not
    // shown on Deliveries, period (Ron: "the main orders will be the web
    // part... make sure it shows exactly how it needs to be").
    const [activeOrders, variants, crops, procedures, customers, mixComponents, confirmed] = await Promise.all([
      fetchFromSupabase('/belarro_v4_order?status=in.(active,pending_seed,growing)&deleted_at=is.null&select=*'),
      fetchFromSupabase('/belarro_v4_product_variant?select=*'),
      fetchFromSupabase('/belarro_v4_crop?select=*'),
      fetchFromSupabase('/belarro_v4_growth_procedure?select=crop_id,stack_days,blackout_days,light_days'),
      fetchFromSupabase('/belarro_v4_customer?select=id,name,restaurant_name,address,phone&deleted_at=is.null'),
      fetchFromSupabase('/belarro_v4_crop_mix_component?select=*'),
      fetchFromSupabase(`/belarro_v4_delivery?delivery_date=eq.${targetKey}&deleted_at=is.null&select=*`),
    ]);

    const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
    const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
    const procMap = new Map<string, any>((procedures || []).map((p: any) => [p.crop_id, p]));
    const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));
    const mixComponentsMap = new Map<string, any[]>();
    for (const mc of (mixComponents || [])) {
      if (!mixComponentsMap.has(mc.mix_crop_id)) mixComponentsMap.set(mc.mix_crop_id, []);
      mixComponentsMap.get(mc.mix_crop_id)!.push(mc);
    }
    const confirmedByOrderId = new Map<string, any>((confirmed || []).map((c: any) => [c.order_id, c]));

    const firstDeliveryOf = (line: any, allLines: any[]): Date => {
      if (line.next_delivery_date) return nextTuesdayOnOrAfter(localMidnight(new Date(line.next_delivery_date)));
      const createdAt = new Date(line.created_at || line.order_date || today);
      let maxGrowDays = 0;
      for (const sibling of allLines) {
        if (sibling.customer_id !== line.customer_id) continue;
        const siblingCreated = new Date(sibling.created_at || sibling.order_date || 0);
        if (Math.abs(siblingCreated.getTime() - createdAt.getTime()) > 10 * 60 * 1000) continue;
        const v = varMap.get(sibling.product_variant_id);
        const c = v ? cropMap.get(v.crop_id) : null;
        const d = effectiveGrowDays(c, procMap, mixComponentsMap);
        if (d > maxGrowDays) maxGrowDays = d;
      }
      return targetDate; // legacy row fallback: assume it's due
    };

    const lines = (activeOrders || []).filter((o: any) => custMap.get(o.customer_id)?.name);

    const buildLine = (order: any) => {
      const variant = varMap.get(order.product_variant_id);
      const crop = variant ? cropMap.get(variant.crop_id) : null;
      const qty = order.quantity || 1;
      const priceEur = variant?.price_eur ?? 0;
      const confirmedRow = confirmedByOrderId.get(order.id);
      return {
        order_id: order.id,
        crop_name: crop?.name_en || 'Unknown',
        size_name: variant?.size_name || '',
        expected_qty: qty,
        unit_price_eur: priceEur,
        status: confirmedRow ? confirmedRow.status : 'pending',
        actual_qty: confirmedRow ? confirmedRow.actual_qty : qty,
        note: confirmedRow?.note || null,
        confirmed_at: confirmedRow?.confirmed_at || null,
      };
    };

    const byCustomer = new Map<string, { customer_id: string; customer_name: string; address: string | null; phone: string | null; items: any[] }>();

    for (const line of lines) {
      const firstDelivery = firstDeliveryOf(line, lines);
      if (!deliversOnTuesday(targetDate, firstDelivery, line.frequency)) continue;
      const customer = custMap.get(line.customer_id);
      if (!byCustomer.has(line.customer_id)) {
        byCustomer.set(line.customer_id, {
          customer_id: line.customer_id,
          customer_name: customer.restaurant_name || customer.name,
          address: customer.address || null,
          phone: customer.phone || null,
          items: [],
        });
      }
      byCustomer.get(line.customer_id)!.items.push(buildLine(line));
    }

    const result = Array.from(byCustomer.values()).sort((a, b) => a.customer_name.localeCompare(b.customer_name));

    // ── UPCOMING ─────────────────────────────────────────────────────
    // Every active-order customer NOT due on targetDate still needs to show
    // up somewhere — otherwise the driver sees a customer "vanish" with no
    // explanation (e.g. an order just realigned to 3 weeks out after an
    // edit). For each such customer, find their next actual delivery Tuesday
    // within 8 weeks and summarize what's coming.
    const linesByCustomer = new Map<string, any[]>();
    for (const line of lines) {
      if (!linesByCustomer.has(line.customer_id)) linesByCustomer.set(line.customer_id, []);
      linesByCustomer.get(line.customer_id)!.push(line);
    }

    const upcoming: Array<{ customer_id: string; customer_name: string; next_delivery_date: string; crop_names: string[] }> = [];
    for (const [customerId, customerLines] of linesByCustomer) {
      if (byCustomer.has(customerId)) continue; // already due today
      const customer = custMap.get(customerId);
      if (!customer) continue;

      let earliest: Date | null = null;
      const cropsOnEarliest = new Set<string>();
      for (let w = 1; w <= 8; w++) {
        const candidate = addDays(targetDate, w * 7);
        for (const line of customerLines) {
          const firstDelivery = firstDeliveryOf(line, lines);
          if (!deliversOnTuesday(candidate, firstDelivery, line.frequency)) continue;
          if (!earliest || candidate.getTime() < earliest.getTime()) {
            earliest = candidate;
            cropsOnEarliest.clear();
          }
          if (earliest && candidate.getTime() === earliest.getTime()) {
            const variant = varMap.get(line.product_variant_id);
            const crop = variant ? cropMap.get(variant.crop_id) : null;
            cropsOnEarliest.add(crop?.name_en || 'Unknown');
          }
        }
        if (earliest) break; // first week with any match is the earliest (weeks ascend)
      }

      if (earliest) {
        upcoming.push({
          customer_id: customerId,
          customer_name: customer.restaurant_name || customer.name,
          next_delivery_date: ymd(earliest),
          crop_names: Array.from(cropsOnEarliest),
        });
      }
    }
    upcoming.sort((a, b) => a.next_delivery_date.localeCompare(b.next_delivery_date) || a.customer_name.localeCompare(b.customer_name));

    return NextResponse.json({ success: true, data: result, upcoming, date: targetKey }, { headers });
  } catch (error) {
    console.error('Deliveries due GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers }
    );
  }
}
