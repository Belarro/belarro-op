import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import {
  alignedFirstDelivery,
  effectiveGrowDays,
  firstSeedFor,
  growDaysFromProc,
  localMidnight,
  nextDayOnOrAfter,
  nextTuesdayOnOrAfter,
  seedsAtSlot,
  ymd,
  fmt,
  FRIDAY,
  TUESDAY,
} from '@/lib/seeding';

interface DailyTask {
  crop_name: string;
  crop_id: string;
  grams_needed: number;
  trays_needed: number;
  task_type: 'soak' | 'seed_stack' | 'cover_soil' | 'blackout' | 'light' | 'harvest';
  notes?: string;
}

interface DailyOperation {
  date: string;
  display: string;
  day_of_week: string;
  tasks: DailyTask[];
}

interface SeedingPlan {
  seed_date: Date;
  crop_id: string;
  crop_name: string;
  grams_needed: number;
  trays_needed: number;
  procedure: any;
}

export async function GET(request: NextRequest) {
  try {
    const [orders, standingOrders, standingItems, variants, crops, procedures, mixComponents] = await Promise.all([
      fetchFromSupabase('/belarro_v4_order?status=in.(active,pending_seed,growing)&deleted_at=is.null&select=*'),
      fetchFromSupabase('/belarro_v4_standing_order?status=eq.active&select=id,customer_id'),
      fetchFromSupabase('/belarro_v4_standing_order_item?deleted_at=is.null&select=*'),
      fetchFromSupabase('/belarro_v4_product_variant?select=*'),
      fetchFromSupabase('/belarro_v4_crop?select=*'),
      fetchFromSupabase('/belarro_v4_growth_procedure?select=*'), // select=* already includes _enabled columns
      fetchFromSupabase('/belarro_v4_crop_mix_component?select=*'),
    ]);

    // Standing-order items (belarro_v4_standing_order_item) were previously
    // invisible here entirely — no code path in this route ever queried that
    // table, so a standing-order customer's crops never appeared on the
    // Daily Operations calendar no matter what was configured. They carry no
    // next_delivery_date/frequency (no biweekly concept — "standing" repeats
    // every week indefinitely).
    const standingOrderCustomer = new Map<string, string>((standingOrders || []).map((so: any) => [so.id, so.customer_id]));
    const standingLines = (standingItems || [])
      .map((it: any) => ({
        id: `standing:${it.id}`,
        customer_id: standingOrderCustomer.get(it.standing_order_id),
        product_variant_id: it.variant_id,
        quantity: it.quantity,
        is_standing: true,
      }))
      .filter((l: any) => l.customer_id);

    const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
    const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
    const procMap = new Map<string, any>((procedures || []).map((p: any) => [p.crop_id, p]));
    const mixComponentsMap = new Map<string, any[]>();
    for (const mc of (mixComponents || [])) {
      if (!mixComponentsMap.has(mc.mix_crop_id)) mixComponentsMap.set(mc.mix_crop_id, []);
      mixComponentsMap.get(mc.mix_crop_id)!.push(mc);
    }

    const today = localMidnight(new Date());

    // Same per-line first-delivery resolution as /api/production: stored
    // next_delivery_date wins; legacy rows without it fall back to aligning
    // from their order event (siblings created within 10 minutes).
    const lines = [...(orders || []), ...standingLines];
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

    const seedingPlans: SeedingPlan[] = [];

    const nextTuesday = nextTuesdayOnOrAfter(today);
    const nextFriday = nextDayOnOrAfter(today, FRIDAY);

    // Upcoming seed dates (next 4 Tuesdays and Fridays)
    const upcomingSeedDates: Date[] = [];
    for (let w = 0; w < 4; w++) {
      const tue = new Date(nextTuesday);
      tue.setDate(tue.getDate() + w * 7);
      const fri = new Date(nextFriday);
      fri.setDate(fri.getDate() + w * 7);
      upcomingSeedDates.push(tue);
      upcomingSeedDates.push(fri);
    }
    upcomingSeedDates.sort((a, b) => a.getTime() - b.getTime());

    // For each upcoming seed date, calculate what needs to be seeded
    for (const seedDate of upcomingSeedDates) {
      const dayOfWeek = seedDate.getDay();
      const isSeeding = dayOfWeek === TUESDAY || dayOfWeek === FRIDAY;

      if (!isSeeding) continue;

      const gramsForDay = new Map<string, number>();

      for (const order of lines) {
        const variant = varMap.get(order.product_variant_id);
        const crop = variant ? cropMap.get(variant.crop_id) : null;
        if (!crop) continue;

        const orderQty = order.quantity || 1;
        const sizeGrams = variant?.size_grams || 0;
        const totalGrams = orderQty * sizeGrams;

        // Standing orders have no anchor/frequency — they repeat every
        // single week indefinitely, so they belong on every occurrence of
        // their crop's bucket day with no firstSeed/cadence check.
        if (order.is_standing) {
          if (crop.is_mix) {
            for (const comp of (mixComponentsMap.get(crop.id) || [])) {
              const compGrowDays = growDaysFromProc(procMap.get(comp.component_crop_id));
              if (compGrowDays === 0) continue;
              const belongsHere = dayOfWeek === TUESDAY ? compGrowDays > 10 : compGrowDays <= 10;
              if (!belongsHere) continue;
              gramsForDay.set(
                comp.component_crop_id,
                (gramsForDay.get(comp.component_crop_id) || 0) + totalGrams * (comp.percentage / 100)
              );
            }
          } else {
            const growDays = growDaysFromProc(procMap.get(crop.id));
            if (growDays === 0) continue;
            const belongsHere = dayOfWeek === TUESDAY ? growDays > 10 : growDays <= 10;
            if (!belongsHere) continue;
            gramsForDay.set(crop.id, (gramsForDay.get(crop.id) || 0) + totalGrams);
          }
          continue;
        }

        const firstDelivery = firstDeliveryOf(order);

        // Mixes have no procedure of their own — expand into components and
        // bucket each component by ITS OWN grow days (a mix can span both
        // Tuesday and Friday seedings).
        if (crop.is_mix) {
          for (const comp of (mixComponentsMap.get(crop.id) || [])) {
            const compGrowDays = growDaysFromProc(procMap.get(comp.component_crop_id));
            if (compGrowDays === 0) continue;
            const belongsHere = dayOfWeek === TUESDAY ? compGrowDays > 10 : compGrowDays <= 10;
            if (!belongsHere) continue;
            const compFirstSeed = firstSeedFor(firstDelivery, compGrowDays);
            if (!seedsAtSlot(seedDate, compFirstSeed, order.frequency, order.recurring)) continue;
            gramsForDay.set(
              comp.component_crop_id,
              (gramsForDay.get(comp.component_crop_id) || 0) + totalGrams * (comp.percentage / 100)
            );
          }
        } else {
          const growDays = growDaysFromProc(procMap.get(crop.id));
          if (growDays === 0) continue;
          const belongsHere = dayOfWeek === TUESDAY ? growDays > 10 : growDays <= 10;
          if (!belongsHere) continue;
          const firstSeed = firstSeedFor(firstDelivery, growDays);
          if (!seedsAtSlot(seedDate, firstSeed, order.frequency, order.recurring)) continue;
          gramsForDay.set(crop.id, (gramsForDay.get(crop.id) || 0) + totalGrams);
        }
      }

      for (const [cropId, grams] of gramsForDay) {
        const crop = cropMap.get(cropId);
        if (!crop) continue;

        const proc = procMap.get(cropId);
        const yieldPerTray = crop.yield_per_tray_grams || null;
        const trays = yieldPerTray && grams > 0 ? Math.ceil(grams / yieldPerTray) : 1;

        seedingPlans.push({
          seed_date: seedDate,
          crop_id: cropId,
          crop_name: crop.name_en,
          grams_needed: Math.round(grams),
          trays_needed: trays,
          procedure: proc,
        });
      }
    }

    // Build daily operations calendar showing only phase transitions
    const dailyOpsMap = new Map<string, DailyTask[]>();

    for (const plan of seedingPlans) {
      const proc = plan.procedure;
      if (!proc) continue;

      const seedDate = plan.seed_date;

      // 1. Soak — 12h+ soaks start the day before seeding; short soaks (3-6h)
      // happen the same morning as seeding.
      if (proc.soak_enabled && proc.soak_hours) {
        const soakDate = new Date(seedDate);
        if (proc.soak_hours >= 12) {
          soakDate.setDate(soakDate.getDate() - 1);
        }
        const sameDay = proc.soak_hours < 12;
        const soakKey = ymd(soakDate);
        if (!dailyOpsMap.has(soakKey)) dailyOpsMap.set(soakKey, []);
        dailyOpsMap.get(soakKey)!.push({
          crop_name: plan.crop_name,
          crop_id: plan.crop_id,
          grams_needed: plan.grams_needed,
          trays_needed: plan.trays_needed,
          task_type: 'soak',
          notes: `Soak ${proc.soak_hours}h${sameDay ? ' (same day, before seeding)' : ' (for tomorrow\'s seeding)'}${proc.soak_notes ? ' - ' + proc.soak_notes : ''}`,
        });
      }

      // 2. Seed day: seed + cover soil + stack all happen together
      const seedKey = ymd(seedDate);
      if (!dailyOpsMap.has(seedKey)) dailyOpsMap.set(seedKey, []);

      let seedNote = 'Seed';
      if (proc.cover_soil_enabled) {
        seedNote += ' + Cover with soil' + (proc.cover_soil_notes ? ` (${proc.cover_soil_notes})` : '');
      }
      if (proc.stack_enabled && proc.stack_days) {
        seedNote += ` → Stack (${proc.stack_days}d)`;
      } else if (proc.blackout_enabled && proc.blackout_days && !proc.stack_enabled) {
        seedNote += ` → straight to blackout`;
      } else if (!proc.stack_enabled && !proc.blackout_enabled) {
        seedNote += ` → straight to light`;
      }

      dailyOpsMap.get(seedKey)!.push({
        crop_name: plan.crop_name,
        crop_id: plan.crop_id,
        grams_needed: plan.grams_needed,
        trays_needed: plan.trays_needed,
        task_type: 'seed_stack',
        notes: seedNote,
      });

      // 3. Blackout start (after stack, or right after seeding if no stack).
      // Only shown if there's a transition to make (skip if it starts on seed day —
      // that's already in the seed note).
      if (proc.blackout_enabled && proc.blackout_days) {
        const blackoutStart = new Date(seedDate);
        blackoutStart.setDate(blackoutStart.getDate() + (proc.stack_days || 0));
        const blackoutKey = ymd(blackoutStart);
        if (blackoutKey !== seedKey) {
          if (!dailyOpsMap.has(blackoutKey)) dailyOpsMap.set(blackoutKey, []);
          dailyOpsMap.get(blackoutKey)!.push({
            crop_name: plan.crop_name,
            crop_id: plan.crop_id,
            grams_needed: plan.grams_needed,
            trays_needed: plan.trays_needed,
            task_type: 'blackout',
            notes: `Move to blackout (${proc.blackout_days}d)${proc.blackout_notes ? ' - ' + proc.blackout_notes : ''}`,
          });
        }
      }

      // 4. Light start (after stack + blackout). Some crops (e.g. popcorn) never
      // go to light — light_days empty means it stays dark until harvest.
      if (proc.light_enabled && proc.light_days) {
        const lightStart = new Date(seedDate);
        lightStart.setDate(lightStart.getDate() + (proc.stack_days || 0) + (proc.blackout_days || 0));
        const lightKey = ymd(lightStart);

        const hasDome = proc.humidity_dome_enabled && proc.humidity_dome_days;
        let lightNote = `Move to light (${proc.light_days}d)`;
        if (hasDome) {
          lightNote += ` + put humidity dome (${proc.humidity_dome_days}d)`;
        }
        if (proc.light_notes) {
          lightNote += ` - ${proc.light_notes}`;
        }

        // Skip transition card if light starts on seed day (already in seed note),
        // but still show it if there's a dome to put on.
        if (lightKey !== seedKey || hasDome) {
          if (!dailyOpsMap.has(lightKey)) dailyOpsMap.set(lightKey, []);
          dailyOpsMap.get(lightKey)!.push({
            crop_name: plan.crop_name,
            crop_id: plan.crop_id,
            grams_needed: plan.grams_needed,
            trays_needed: plan.trays_needed,
            task_type: 'light',
            notes: lightKey === seedKey ? `On light with humidity dome (${proc.humidity_dome_days}d)` : lightNote,
          });
        }

        // 4b. Remove humidity dome — a real daily action, easy to forget.
        if (hasDome && proc.humidity_dome_days! < proc.light_days) {
          const domeOff = new Date(lightStart);
          domeOff.setDate(domeOff.getDate() + proc.humidity_dome_days!);
          const domeOffKey = ymd(domeOff);
          if (!dailyOpsMap.has(domeOffKey)) dailyOpsMap.set(domeOffKey, []);
          dailyOpsMap.get(domeOffKey)!.push({
            crop_name: plan.crop_name,
            crop_id: plan.crop_id,
            grams_needed: plan.grams_needed,
            trays_needed: plan.trays_needed,
            task_type: 'light',
            notes: 'Remove humidity dome',
          });
        }
      }

      // 6. Harvest (on next Tuesday after all growing days)
      const totalGrowDays = growDaysFromProc(proc);
      const harvestRaw = new Date(seedDate);
      harvestRaw.setDate(harvestRaw.getDate() + totalGrowDays);
      const harvestTuesday = nextTuesdayOnOrAfter(harvestRaw);
      const harvestKey = ymd(harvestTuesday);
      if (!dailyOpsMap.has(harvestKey)) dailyOpsMap.set(harvestKey, []);
      dailyOpsMap.get(harvestKey)!.push({
        crop_name: plan.crop_name,
        crop_id: plan.crop_id,
        grams_needed: plan.grams_needed,
        trays_needed: plan.trays_needed,
        task_type: 'harvest',
        notes: 'Ready to harvest',
      });
    }

    // Build final daily operations list
    const dailyOperations: DailyOperation[] = Array.from(dailyOpsMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([dateStr, tasks]) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d); // parse as local, not UTC
        return {
          date: dateStr,
          display: fmt(date),
          day_of_week: date.toLocaleDateString('en-DE', { weekday: 'long' }),
          tasks: tasks.sort((a, b) => {
            const priority: Record<string, number> = {
              'soak': 1,
              'seed_stack': 2,
              'blackout': 3,
              'light': 4,
              'harvest': 5,
            };
            return (priority[a.task_type] || 99) - (priority[b.task_type] || 99);
          }),
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        daily_operations: dailyOperations,
        today: ymd(today),
      },
    });
  } catch (error) {
    console.error('Daily-operations GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
