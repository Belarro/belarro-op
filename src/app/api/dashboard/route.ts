import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { deliversOnTuesday, localMidnight, nextTuesdayOnOrAfter, ymd } from '@/lib/seeding';

function tuesdaysInMonth(year: number, month: number): Date[] {
  const tuesdays: Date[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month - 1) {
    tuesdays.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return tuesdays;
}

// All past Tuesdays from startYear/startMonth up to and including today
function allPastTuesdays(startYear: number, startMonth: number): Date[] {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const result: Date[] = [];
  let y = startYear;
  let m = startMonth;
  while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth() + 1)) {
    for (const t of tuesdaysInMonth(y, m)) {
      if (t <= today) result.push(t);
    }
    m++;
    if (m > 12) { m = 1; y++; }
    if (y > today.getFullYear() + 1) break; // safety
  }
  return result;
}

interface DeliveryStats {
  revenue: number;
  packages: number; // total quantity units
  grams: number;    // total grams (for kg display)
}

// Forward-looking projection from live order config — used only for Tuesdays
// that haven't happened yet (next delivery, remainder of this month). Skips
// any Tuesday before the order's own first delivery so a brand-new order
// doesn't get multiplied across weeks it couldn't have delivered in.
// Standing-order lines (is_standing) deliver every Tuesday unconditionally.
function calcProjected(
  tuesdays: Date[],
  orders: any[],
  varMap: Map<string, any>,
  cropMap: Map<string, any>,
  procMap: Map<string, any>
): DeliveryStats {
  let revenue = 0;
  let packages = 0;
  let grams = 0;

  for (const order of orders) {
    if (order.status === 'paused' || order.status === 'cancelled') continue;

    const variant = varMap.get(order.product_variant_id);
    if (!variant) continue;
    const crop = cropMap.get(variant.crop_id);
    if (!crop) continue;

    const qty = order.quantity || 1;
    const price = order.price_at_time_eur ?? variant.price_eur ?? 0;
    const proc = procMap.get(crop.id);
    const weightPerUnit = parseWeightFromSize(variant.size_name, proc);

    if (order.is_standing) {
      for (const _tuesday of tuesdays) {
        revenue += qty * price;
        packages += qty;
        grams += qty * weightPerUnit;
      }
      continue;
    }

    if (!order.next_delivery_date) continue;
    const firstDelivery = nextTuesdayOnOrAfter(new Date(order.next_delivery_date));

    for (const tuesday of tuesdays) {
      if (!deliversOnTuesday(tuesday, firstDelivery, order.frequency, order.recurring)) continue;
      revenue += qty * price;
      packages += qty;
      grams += qty * weightPerUnit;
    }
  }

  return { revenue: +revenue.toFixed(2), packages, grams };
}

// Ground truth for Tuesdays that have already happened — reads the
// immutable delivery ledger (what was actually confirmed delivered), not
// live order/price config. Matches /api/invoices/generate's source so the
// dashboard and invoices can never silently disagree about the past.
function calcFromLedger(deliveries: any[]): DeliveryStats {
  let revenue = 0;
  let packages = 0;
  let grams = 0;

  for (const d of deliveries) {
    if (d.status === 'not_delivered') continue;
    const qty = d.actual_qty ?? d.expected_qty ?? 1;
    const price = d.unit_price_eur ?? 0;
    revenue += qty * price;
    packages += qty;
    const match = (d.size_name || '').match(/(\d+)\s*g/i);
    grams += qty * (match ? parseInt(match[1]) : 0);
  }

  return { revenue: +revenue.toFixed(2), packages, grams };
}

function addStats(a: DeliveryStats, b: DeliveryStats): DeliveryStats {
  return {
    revenue: +(a.revenue + b.revenue).toFixed(2),
    packages: a.packages + b.packages,
    grams: a.grams + b.grams,
  };
}

function parseWeightFromSize(sizeName: string, proc: any): number {
  if (!sizeName) return 0;
  const match = sizeName.match(/(\d+)\s*g/i);
  if (match) return parseInt(match[1]);
  // fallback: use harvest_weight_grams from proc if available
  if (proc?.harvest_weight_grams) return proc.harvest_weight_grams;
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware

    const today = localMidnight(new Date());
    const thisYear = today.getFullYear();
    const thisMonth = today.getMonth() + 1;

    const monthTuesdaysAll = tuesdaysInMonth(thisYear, thisMonth);
    const monthPastTuesdays = monthTuesdaysAll.filter(t => t.getTime() <= today.getTime());
    const monthFutureTuesdays = monthTuesdaysAll.filter(t => t.getTime() > today.getTime());
    const allPastTuesdaysList = allPastTuesdays(2026, 1);

    const [crops, customers, orders, standingOrders, standingItems, variants, procs, batches, harvests, seedInv, packageInv, allTimeDeliveries] = await Promise.all([
      fetchFromSupabase('/belarro_v4_crop?select=id,status,deleted_at,name_en'),
      fetchFromSupabase('/belarro_v4_customer?deleted_at=is.null&select=id,name,restaurant_name,status,created_at'),
      fetchFromSupabase('/belarro_v4_order?deleted_at=is.null&select=*'),
      fetchFromSupabase('/belarro_v4_standing_order?status=eq.active&select=id,customer_id').catch(() => []),
      fetchFromSupabase('/belarro_v4_standing_order_item?deleted_at=is.null&select=*').catch(() => []),
      fetchFromSupabase('/belarro_v4_product_variant?select=id,price_eur,size_name,crop_id'),
      fetchFromSupabase('/belarro_v4_processing_step?select=*').catch(() => []),
      fetchFromSupabase('/belarro_v4_seeding_batch?select=id').catch(() => []),
      fetchFromSupabase('/belarro_v4_harvest_record?select=seeding_batch_id').catch(() => []),
      fetchFromSupabase('/belarro_v4_seed_inventory?select=*,crop:belarro_v4_crop(*)').catch(() => []),
      fetchFromSupabase('/belarro_v4_package_inventory?select=*').catch(() => []),
      // Ground truth for every past Tuesday since farm start — same ledger
      // /api/invoices/generate reads, so dashboard revenue can't silently
      // diverge from what customers are actually billed.
      allPastTuesdays(2026, 1).length > 0
        ? fetchFromSupabase(
            `/belarro_v4_delivery?delivery_date=gte.${ymd(allPastTuesdays(2026, 1)[0])}&deleted_at=is.null&select=*`
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    const nonDeletedCrops = (crops || []).filter((c: any) => !c.deleted_at);
    const activeCrops = nonDeletedCrops.filter((c: any) => c.status === 'active').length;

    const custs = customers || [];
    const activeCustomers = custs.filter((c: any) => c.status === 'active').length;

    const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
    const cropMap = new Map<string, any>(nonDeletedCrops.map((c: any) => [c.id, c]));
    const procMap = new Map<string, any>((procs || []).map((p: any) => [p.crop_id, p]));

    const ords = (orders || []);

    // Standing orders deliver every week — fold them into the forward
    // projection alongside one-time orders (they were previously invisible
    // to the dashboard entirely, same gap as Production had).
    const standingOrderCustomer = new Map<string, string>((standingOrders || []).map((so: any) => [so.id, so.customer_id]));
    const standingLines = (standingItems || [])
      .map((it: any) => ({
        id: `standing:${it.id}`,
        customer_id: standingOrderCustomer.get(it.standing_order_id),
        product_variant_id: it.variant_id,
        quantity: it.quantity,
        price_at_time_eur: it.price_at_time_eur,
        is_standing: true,
      }))
      .filter((l: any) => l.customer_id);

    // Active orders only (not paused/cancelled) — used for future projection only.
    const liveOrders = [
      ...ords.filter((o: any) => o.status !== 'cancelled' && o.status !== 'paused'),
      ...standingLines,
    ];

    const ledgerRows = allTimeDeliveries || [];
    const ledgerByDate = new Map<string, any[]>();
    for (const d of ledgerRows) {
      if (!ledgerByDate.has(d.delivery_date)) ledgerByDate.set(d.delivery_date, []);
      ledgerByDate.get(d.delivery_date)!.push(d);
    }
    const ledgerRowsInRange = (tuesdays: Date[]) =>
      tuesdays.flatMap(t => ledgerByDate.get(ymd(t)) || []);

    // This month: ledger for Tuesdays that already happened, live projection
    // for the rest of the month.
    const monthPastStats = calcFromLedger(ledgerRowsInRange(monthPastTuesdays));
    const monthFutureStats = calcProjected(monthFutureTuesdays, liveOrders, varMap, cropMap, procMap);
    const monthStats = addStats(monthPastStats, monthFutureStats);

    // All-time: ledger only — every one of these Tuesdays is in the past by definition.
    const allTimeStats = calcFromLedger(ledgerRowsInRange(allPastTuesdaysList));

    // Next Tuesday's expected revenue (forward-looking, 1 week) — always a
    // projection since it hasn't happened yet.
    const nextTuesdayDate = nextTuesdayOnOrAfter(today);
    const nextWeekStats = calcProjected([nextTuesdayDate], liveOrders, varMap, cropMap, procMap);

    // Active operations
    const bts = batches || [];
    const hvs = harvests || [];
    const harvestedBatchIds = new Set(hvs.map((h: any) => h.seeding_batch_id));
    const activeSeedingBatches = bts.filter((b: any) => !harvestedBatchIds.has(b.id)).length;

    const followups = await fetchFromSupabase('/belarro_v4_follow_up?select=id,status,due_date&location_id=not.is.null').catch(() => []);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const pendingFollowUps = (followups || []).filter((f: any) =>
      f.status === 'pending' && new Date(f.due_date) <= todayEnd
    ).length;

    // Reorder alerts. seeds_per_tray lives on belarro_v4_seed_inventory (the
    // field the Inventory page edits) — the crop row has seeds_per_tray_grams;
    // reading inv.crop.seeds_per_tray was always undefined, silently pinning
    // every crop's alert math to the 60g fallback.
    const seedReorderAlerts = (seedInv || []).filter((inv: any) => {
      if (!inv.crop) return false;
      const remainingTrays = Math.floor(inv.quantity_grams / (inv.seeds_per_tray || inv.crop.seeds_per_tray_grams || 60));
      return remainingTrays < (inv.reorder_threshold_trays || 20);
    }).length;
    const packageReorderAlerts = (packageInv || []).filter(
      (inv: any) => inv.quantity_available < inv.reorder_threshold
    ).length;

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          total_crops: nonDeletedCrops.length,
          active_crops: activeCrops,
          active_customers: activeCustomers,
          total_customers: custs.length,
          active_orders: liveOrders.length,
        },
        this_month: {
          label: today.toLocaleDateString('en-DE', { month: 'long', year: 'numeric' }),
          deliveries: monthPastTuesdays.length,
          revenue: monthStats.revenue,
          packages: monthStats.packages,
          kg: +(monthStats.grams / 1000).toFixed(1),
        },
        all_time: {
          revenue: allTimeStats.revenue,
          packages: allTimeStats.packages,
          kg: +(allTimeStats.grams / 1000).toFixed(1),
          deliveries: allPastTuesdaysList.length,
        },
        next_delivery: {
          date: ymd(nextTuesdayDate),
          revenue: nextWeekStats.revenue,
          packages: nextWeekStats.packages,
        },
        operations: {
          active_seeding_batches: activeSeedingBatches,
          pending_follow_ups: pendingFollowUps,
        },
        alerts: {
          seed_reorder_alerts: seedReorderAlerts,
          package_reorder_alerts: packageReorderAlerts,
        },
      },
    });
  } catch (error) {
    console.error('Dashboard GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
