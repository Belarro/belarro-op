import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import {
  alignedFirstDelivery,
  effectiveGrowDays,
  firstSeedFor,
  growDaysFromProc,
  localMidnight,
  seedDayFor,
  seedsAtSlot,
  ymd,
} from '@/lib/seeding';

// Called automatically by pg_cron every Tuesday and Friday at 06:00 Berlin time.
// Calculates what needs to be seeded today, deducts seeds from inventory,
// and logs each deduction to belarro_v4_seed_usage_log.
//
// Cadence math (which crops seed today, biweekly on/off, one-off "recurring:
// false" extras) is shared with /api/production via lib/seeding.ts — this
// route previously reimplemented it with a global ISO-week-parity check for
// "biweekly," anchored to the calendar instead of each order line's own
// first-seed date, and had no concept of one-off orders at all. Two biweekly
// customers whose orders started a week apart would fall in opposite phase
// under that check while /api/production (correctly) staggered them by their
// own anchors — the same crop could be "on" here and "off" there for the same
// week, silently double-deducting or skipping seed inventory relative to what
// Production actually scheduled.

export async function POST(request: NextRequest) {
  try {
    // Verify internal cron secret to prevent unauthorized calls
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = localMidnight(new Date());
    const dayOfWeek = today.getDay(); // 2=Tuesday, 5=Friday

    if (dayOfWeek !== 2 && dayOfWeek !== 5) {
      return NextResponse.json({ success: true, message: 'Not a seeding day', deductions: [] });
    }

    const [orders, variants, crops, procedures, mixComponents, seedInventory] = await Promise.all([
      fetchFromSupabase('/belarro_v4_order?status=in.(active,pending_seed,growing)&deleted_at=is.null&select=*'),
      fetchFromSupabase('/belarro_v4_product_variant?select=*'),
      fetchFromSupabase('/belarro_v4_crop?select=*'),
      fetchFromSupabase('/belarro_v4_growth_procedure?select=crop_id,stack_days,stack_enabled,blackout_days,blackout_enabled,light_days,light_enabled'),
      fetchFromSupabase('/belarro_v4_crop_mix_component?select=*'),
      fetchFromSupabase('/belarro_v4_seed_inventory?select=*'),
    ]);

    const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
    const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
    const procMap = new Map<string, any>((procedures || []).map((p: any) => [p.crop_id, p]));
    const mixComponentsMap = new Map<string, any[]>();
    for (const mc of (mixComponents || [])) {
      if (!mixComponentsMap.has(mc.mix_crop_id)) mixComponentsMap.set(mc.mix_crop_id, []);
      mixComponentsMap.get(mc.mix_crop_id)!.push(mc);
    }
    // Inventory keyed by crop_id
    const invMap = new Map<string, any>((seedInventory || []).map((s: any) => [s.crop_id, s]));

    // Same per-line first-delivery resolution as /api/production: stored
    // next_delivery_date wins; legacy rows without it fall back to aligning
    // from their order event (siblings created within 10 minutes).
    const lines = orders || [];
    const firstDeliveryOf = (line: any): Date => {
      if (line.next_delivery_date) {
        return localMidnight(new Date(line.next_delivery_date));
      }
      const createdAt = new Date(line.created_at || line.order_date || today);
      let maxGrowDays = 0;
      for (const sibling of lines) {
        if (sibling.customer_id !== line.customer_id) continue;
        const siblingCreated = new Date(sibling.created_at || sibling.order_date || 0);
        if (Math.abs(siblingCreated.getTime() - createdAt.getTime()) > 10 * 60 * 1000) continue;
        const v = varMap.get(sibling.product_variant_id);
        const c = v ? cropMap.get(v.crop_id) : null;
        const d = effectiveGrowDays(c, procMap, mixComponentsMap);
        if (d > maxGrowDays) maxGrowDays = d;
      }
      return alignedFirstDelivery(createdAt, maxGrowDays || 10);
    };

    // Accumulate total grams needed per component crop today
    const gramsNeeded = new Map<string, number>();
    const addGrams = (cropId: string, grams: number) => {
      gramsNeeded.set(cropId, (gramsNeeded.get(cropId) || 0) + grams);
    };

    for (const order of lines) {
      const variant = varMap.get(order.product_variant_id);
      const crop = variant ? cropMap.get(variant.crop_id) : null;
      if (!crop) continue;

      const firstDelivery = firstDeliveryOf(order);
      const orderQty = order.quantity || 1;
      const sizeGrams = variant?.size_grams || 0;
      const totalGrams = orderQty * sizeGrams;

      if (crop.is_mix) {
        for (const comp of (mixComponentsMap.get(crop.id) || [])) {
          const compGrowDays = growDaysFromProc(procMap.get(comp.component_crop_id));
          if (compGrowDays === 0) continue;
          if (seedDayFor(compGrowDays) !== dayOfWeek) continue;
          const firstSeed = firstSeedFor(firstDelivery, compGrowDays);
          if (!seedsAtSlot(today, firstSeed, order.frequency, order.recurring)) continue;
          addGrams(comp.component_crop_id, totalGrams * (comp.percentage / 100));
        }
      } else {
        const growDays = growDaysFromProc(procMap.get(crop.id));
        if (growDays === 0) continue;
        if (seedDayFor(growDays) !== dayOfWeek) continue;
        const firstSeed = firstSeedFor(firstDelivery, growDays);
        if (!seedsAtSlot(today, firstSeed, order.frequency, order.recurring)) continue;
        addGrams(crop.id, totalGrams);
      }
    }

    // For each crop with grams needed today, calculate trays and deduct seeds
    const deductions: { crop_name: string; trays: number; seeds_deducted_grams: number; remaining_grams: number }[] = [];

    for (const [cropId, totalGramsNeeded] of gramsNeeded) {
      const crop = cropMap.get(cropId);
      if (!crop) continue;

      const inv = invMap.get(cropId);
      if (!inv) continue; // no inventory record — skip, can't deduct

      const yieldPerTray = crop.yield_per_tray_grams || null;
      const trays = yieldPerTray && totalGramsNeeded > 0
        ? Math.ceil(totalGramsNeeded / yieldPerTray)
        : 1;

      const seedsPerTray = inv.seeds_per_tray || crop.seeds_per_tray_grams || 0;
      if (seedsPerTray === 0) continue;

      const seedsToDeduct = trays * seedsPerTray;
      const newQty = Math.max(0, (inv.quantity_grams || 0) - seedsToDeduct);

      // Deduct from inventory
      await fetchFromSupabase(`/belarro_v4_seed_inventory?id=eq.${inv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity_grams: newQty, updated_at: new Date().toISOString() }),
      });

      // Log the usage
      await fetchFromSupabase('/belarro_v4_seed_usage_log', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          crop_id: cropId,
          quantity_used_grams: seedsToDeduct,
          trays_seeded: trays,
          seeded_date: ymd(today),
        }),
      });

      deductions.push({
        crop_name: crop.name_en,
        trays,
        seeds_deducted_grams: seedsToDeduct,
        remaining_grams: newQty,
      });
    }

    return NextResponse.json({ success: true, date: ymd(today), deductions });
  } catch (error) {
    console.error('deduct-seeds error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
