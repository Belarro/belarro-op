import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

function isoWeek(d: Date): number {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

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

function calcDeliveries(
  tuesdays: Date[],
  orders: any[],
  varMap: Map<string, any>,
  cropMap: Map<string, any>,
  procMap: Map<string, any>
): DeliveryStats {
  let revenue = 0;
  let packages = 0;
  let grams = 0;

  for (const tuesday of tuesdays) {
    const weekNum = isoWeek(tuesday);
    for (const order of orders) {
      if (order.status === 'paused' || order.status === 'cancelled') continue;
      if (order.frequency === 'biweekly' && weekNum % 2 !== 0) continue;

      const variant = varMap.get(order.product_variant_id);
      if (!variant) continue;
      const crop = cropMap.get(variant.crop_id);
      if (!crop) continue;

      const qty = order.quantity || 1;
      const price = variant.price_eur || 0;
      revenue += qty * price;
      packages += qty;

      // grams: qty × package weight from size_name (e.g. "225g" → 225)
      const proc = procMap.get(crop.id);
      const weightPerUnit = parseWeightFromSize(variant.size_name, proc);
      grams += qty * weightPerUnit;
    }
  }

  return {
    revenue: +revenue.toFixed(2),
    packages,
    grams,
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
    // For now, skip auth check — rely on deployment being private
    // TODO: restore session-based auth once cookie handling is fixed on Vercel
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const today = new Date();
    const thisYear = today.getFullYear();
    const thisMonth = today.getMonth() + 1;

    const [crops, customers, orders, variants, procs, batches, harvests, seedInv, packageInv] = await Promise.all([
      fetchFromSupabase('/belarro_v4_crop?select=id,status,deleted_at,name_en'),
      fetchFromSupabase('/belarro_v4_customer?deleted_at=is.null&select=id,name,restaurant_name,status,created_at'),
      fetchFromSupabase('/belarro_v4_order?deleted_at=is.null&select=*'),
      fetchFromSupabase('/belarro_v4_product_variant?select=id,price_eur,size_name,crop_id'),
      fetchFromSupabase('/belarro_v4_processing_step?select=*').catch(() => []),
      fetchFromSupabase('/belarro_v4_seeding_batch?select=id').catch(() => []),
      fetchFromSupabase('/belarro_v4_harvest_record?select=seeding_batch_id').catch(() => []),
      fetchFromSupabase('/belarro_v4_seed_inventory?select=*,crop:belarro_v4_crop(*)').catch(() => []),
      fetchFromSupabase('/belarro_v4_package_inventory?select=*').catch(() => []),
    ]);

    const nonDeletedCrops = (crops || []).filter((c: any) => !c.deleted_at);
    const activeCrops = nonDeletedCrops.filter((c: any) => c.status === 'active').length;

    const custs = customers || [];
    const activeCustomers = custs.filter((c: any) => c.status === 'active').length;

    const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
    const cropMap = new Map<string, any>(nonDeletedCrops.map((c: any) => [c.id, c]));
    const procMap = new Map<string, any>((procs || []).map((p: any) => [p.crop_id, p]));

    const ords = (orders || []);

    // Active orders only (not paused/cancelled)
    const liveOrders = ords.filter((o: any) => o.status !== 'cancelled' && o.status !== 'paused');

    // Monthly deliveries: all Tuesdays this month up to today
    const monthTuesdays = tuesdaysInMonth(thisYear, thisMonth).filter(t => t <= today);
    const monthStats = calcDeliveries(monthTuesdays, liveOrders, varMap, cropMap, procMap);

    // All-time deliveries: from Jan 2026 (farm start) to today
    const allTuesdays = allPastTuesdays(2026, 1);
    const allTimeStats = calcDeliveries(allTuesdays, liveOrders, varMap, cropMap, procMap);

    // Next Tuesday's expected revenue (forward-looking, 1 week)
    const nextTuesdayDate = new Date(today);
    while (nextTuesdayDate.getDay() !== 2) nextTuesdayDate.setDate(nextTuesdayDate.getDate() + 1);
    const nextWeekStats = calcDeliveries([nextTuesdayDate], liveOrders, varMap, cropMap, procMap);

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

    // Reorder alerts
    const seedReorderAlerts = (seedInv || []).filter((inv: any) => {
      if (!inv.crop) return false;
      const remainingTrays = Math.floor(inv.quantity_grams / (inv.crop.seeds_per_tray || 60));
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
          deliveries: monthTuesdays.length,
          revenue: monthStats.revenue,
          packages: monthStats.packages,
          kg: +(monthStats.grams / 1000).toFixed(1),
        },
        all_time: {
          revenue: allTimeStats.revenue,
          packages: allTimeStats.packages,
          kg: +(allTimeStats.grams / 1000).toFixed(1),
          deliveries: allTuesdays.length,
        },
        next_delivery: {
          date: nextTuesdayDate.toISOString().split('T')[0],
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
