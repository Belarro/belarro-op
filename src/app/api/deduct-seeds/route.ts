import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

// Called automatically by pg_cron every Tuesday and Friday at 06:00 Berlin time.
// Calculates what needs to be seeded today, deducts seeds from inventory,
// and logs each deduction to belarro_v4_seed_usage_log.

export async function POST(request: NextRequest) {
  try {
    // Verify internal cron secret to prevent unauthorized calls
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 2=Tuesday, 5=Friday

    if (dayOfWeek !== 2 && dayOfWeek !== 5) {
      return NextResponse.json({ success: true, message: 'Not a seeding day', deductions: [] });
    }

    // ISO week number — used for biweekly logic
    const tmp = new Date(today);
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
    const week1 = new Date(tmp.getFullYear(), 0, 4);
    const thisWeekNum = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);

    const [orders, variants, crops, procedures, mixComponents, seedInventory] = await Promise.all([
      fetchFromSupabase('/belarro_v4_order?status=in.(active,pending_seed,growing)&deleted_at=is.null&select=*'),
      fetchFromSupabase('/belarro_v4_product_variant?select=*'),
      fetchFromSupabase('/belarro_v4_crop?select=*'),
      fetchFromSupabase('/belarro_v4_growth_procedure?select=crop_id,stack_days,blackout_days,light_days'),
      fetchFromSupabase('/belarro_v4_crop_mix_component?select=*'),
      fetchFromSupabase('/belarro_v4_seed_inventory?select=*'),
    ]);

    const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
    const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
    const procMap = new Map<string, any>((procedures || []).map((p: any) => [p.crop_id, p]));
    const mixMap = new Map<string, any[]>();
    for (const mc of (mixComponents || [])) {
      if (!mixMap.has(mc.mix_crop_id)) mixMap.set(mc.mix_crop_id, []);
      mixMap.get(mc.mix_crop_id)!.push(mc);
    }
    // Inventory keyed by crop_id
    const invMap = new Map<string, any>((seedInventory || []).map((s: any) => [s.crop_id, s]));

    const TUESDAY = 2;
    const FRIDAY = 5;

    // Accumulate total grams needed per component crop today
    const gramsNeeded = new Map<string, number>();
    const addGrams = (cropId: string, grams: number) => {
      gramsNeeded.set(cropId, (gramsNeeded.get(cropId) || 0) + grams);
    };

    for (const order of (orders || [])) {
      if (order.frequency === 'biweekly' && thisWeekNum % 2 !== 0) continue;

      const variant = varMap.get(order.product_variant_id);
      const crop = variant ? cropMap.get(variant.crop_id) : null;
      if (!crop) continue;

      const orderQty = order.quantity || 1;
      const sizeGrams = variant?.size_grams || 0;
      const totalGrams = orderQty * sizeGrams;

      if (crop.is_mix) {
        const components = mixMap.get(crop.id) || [];
        for (const comp of components) {
          const compProc = procMap.get(comp.component_crop_id);
          const compGrowDays = compProc
            ? (compProc.stack_days || 0) + (compProc.blackout_days || 0) + (compProc.light_days || 0)
            : 0;
          const seedsOnDay = compGrowDays > 10 ? TUESDAY : FRIDAY;
          if (seedsOnDay !== dayOfWeek) continue;
          addGrams(comp.component_crop_id, totalGrams * (comp.percentage / 100));
        }
      } else {
        const proc = procMap.get(crop.id);
        const growDays = proc
          ? (proc.stack_days || 0) + (proc.blackout_days || 0) + (proc.light_days || 0)
          : 0;
        const seedsOnDay = growDays > 10 ? TUESDAY : FRIDAY;
        if (seedsOnDay !== dayOfWeek) continue;
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
          seeded_date: today.toISOString(),
        }),
      });

      deductions.push({
        crop_name: crop.name_en,
        trays,
        seeds_deducted_grams: seedsToDeduct,
        remaining_grams: newQty,
      });
    }

    return NextResponse.json({ success: true, date: today.toISOString().split('T')[0], deductions });
  } catch (error) {
    console.error('deduct-seeds error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
