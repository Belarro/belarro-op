import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import {
  FRIDAY,
  TUESDAY,
  addDays,
  alignedFirstDelivery,
  deliversOnTuesday,
  effectiveGrowDays,
  firstSeedFor,
  fmt,
  growDaysFromProc,
  localMidnight,
  nextDayOnOrAfter,
  nextTuesdayOnOrAfter,
  seedDayFor,
  seedsAtSlot,
  ymd,
} from '@/lib/seeding';

/**
 * Production schedule.
 *
 * Every order line has a first-delivery Tuesday (next_delivery_date), set when
 * the order was created (aligned to the longest crop of the order event) or
 * when a crop was swapped (handover after the old crop's pipeline drains).
 *
 * Seeding: a crop seeds on its bucket day (Tue >10d, Fri ≤10d). Its first seed
 * date is derived backward from the line's first delivery; from there it
 * repeats weekly (biweekly = every 2nd week). So during ramp-up, long crops
 * appear first and short crops join later — all ready on the same Tuesday.
 *
 * Deliveries: only orders currently active on the Orders admin page appear
 * here — no grace-period/draining for removed orders.
 *
 * Standing orders (belarro_v4_standing_order / _item) are a SEPARATE table
 * from belarro_v4_order and were previously invisible to this route entirely
 * — a standing-order customer's crops never appeared in seeding, delivery, or
 * daily-ops no matter what was configured, because nothing here ever queried
 * that table. Standing-order items have no next_delivery_date/frequency
 * (no biweekly concept — "standing" means it repeats every week
 * indefinitely), so they're folded into the same seed/delivery schedule
 * unconditionally: every active item seeds on its crop's bucket day every
 * single week, and delivers every Tuesday.
 */
export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware

    const today = localMidnight(new Date());

    // Orders admin page is the single source of truth for one-time orders:
    // only orders active there may appear here. No "draining"/grace-period
    // logic for removed orders — if it's not active on Orders, it's not
    // shown on Production, period. Standing orders are folded in separately
    // below since they carry no per-line delivery/frequency fields.
    const [activeOrders, standingOrders, standingItems, variants, crops, procedures, customers, batches, harvests, mixComponents] = await Promise.all([
      fetchFromSupabase('/belarro_v4_order?status=in.(active,pending_seed,growing)&deleted_at=is.null&select=*'),
      fetchFromSupabase('/belarro_v4_standing_order?status=eq.active&select=id,customer_id'),
      fetchFromSupabase('/belarro_v4_standing_order_item?select=*'),
      fetchFromSupabase('/belarro_v4_product_variant?select=*'),
      fetchFromSupabase('/belarro_v4_crop?select=*'),
      fetchFromSupabase('/belarro_v4_growth_procedure?select=crop_id,stack_days,stack_enabled,blackout_days,blackout_enabled,light_days,light_enabled'),
      fetchFromSupabase('/belarro_v4_customer?select=id,name,restaurant_name&deleted_at=is.null'),
      fetchFromSupabase('/belarro_v4_seeding_batch?select=*'),
      fetchFromSupabase('/belarro_v4_harvest_record?select=*'),
      fetchFromSupabase('/belarro_v4_crop_mix_component?select=*'),
    ]);

    // Standing-order items don't carry product_variant_id/quantity/customer_id
    // directly (they reference their parent standing_order for customer),
    // so normalize them into the same shape componentsOf/lineItem expect.
    const standingOrderCustomer = new Map<string, string>((standingOrders || []).map((so: any) => [so.id, so.customer_id]));
    const standingLines = (standingItems || [])
      .map((it: any) => ({
        id: `standing:${it.id}`,
        customer_id: standingOrderCustomer.get(it.standing_order_id),
        product_variant_id: it.variant_id,
        quantity: it.quantity,
        is_standing: true,
      }))
      .filter((l: any) => l.customer_id); // drop items whose parent order isn't active/found

    const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
    const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
    const procMap = new Map<string, any>((procedures || []).map((p: any) => [p.crop_id, p]));
    const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));
    const mixComponentsMap = new Map<string, any[]>();
    for (const mc of (mixComponents || [])) {
      if (!mixComponentsMap.has(mc.mix_crop_id)) mixComponentsMap.set(mc.mix_crop_id, []);
      mixComponentsMap.get(mc.mix_crop_id)!.push(mc);
    }

    // Active batches (in the ground, not yet harvested)
    const harvestedIds = new Set((harvests || []).map((h: any) => h.seeding_batch_id));
    const activeBatches = (batches || [])
      .filter((b: any) => !harvestedIds.has(b.id))
      .map((b: any) => ({
        ...b,
        crop: cropMap.get(b.crop_id) || { name_en: 'Unknown', name_de: '' },
      }));
    const readyToHarvest = activeBatches.filter((b: any) => new Date(b.expected_harvest_date) <= today);

    // Trays already seeded, per crop per day — "unless we have enough".
    const seededTrays = new Map<string, number>(); // `${cropId}|${ymd}` → trays
    for (const b of (batches || [])) {
      const key = `${b.crop_id}|${ymd(new Date(b.seeding_date))}`;
      seededTrays.set(key, (seededTrays.get(key) || 0) + (b.quantity_trays || 0));
    }

    // ── PER-LINE FIRST DELIVERY ────────────────────────────────────────
    // Stored next_delivery_date wins (normalized to a Tuesday). Fallback for
    // legacy rows: re-derive the alignment from the order event (lines of the
    // same customer created within 10 minutes = one event).
    const firstDeliveryOf = (line: any, allLines: any[]): Date => {
      if (line.next_delivery_date) {
        return nextTuesdayOnOrAfter(localMidnight(new Date(line.next_delivery_date)));
      }
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
      return alignedFirstDelivery(createdAt, maxGrowDays || 10);
    };

    // Crops silently dropped from seeding because they have no growth
    // procedure row (or every stage disabled, netting 0 grow days) — surfaced
    // to the UI instead of just vanishing from the schedule with no trace.
    const missingProcedureCropIds = new Set<string>();

    // Expand a line into its component crops with grams.
    // Mixes split by percentage; each component keeps its own grow days.
    const componentsOf = (line: any): Array<{ cropId: string; grams: number; growDays: number }> => {
      const variant = varMap.get(line.product_variant_id);
      const crop = variant ? cropMap.get(variant.crop_id) : null;
      if (!crop) return [];
      const totalGrams = (line.quantity || 1) * (variant?.size_grams || 0);
      if (crop.is_mix) {
        const out: Array<{ cropId: string; grams: number; growDays: number }> = [];
        for (const comp of (mixComponentsMap.get(crop.id) || [])) {
          const growDays = growDaysFromProc(procMap.get(comp.component_crop_id));
          if (growDays === 0) {
            missingProcedureCropIds.add(comp.component_crop_id);
            continue;
          }
          out.push({ cropId: comp.component_crop_id, grams: totalGrams * (comp.percentage / 100), growDays });
        }
        return out;
      }
      const growDays = growDaysFromProc(procMap.get(crop.id));
      if (growDays === 0) {
        missingProcedureCropIds.add(crop.id);
        return [];
      }
      return [{ cropId: crop.id, grams: totalGrams, growDays }];
    };

    const lines = [
      ...(activeOrders || []).filter((o: any) => {
        const c = custMap.get(o.customer_id);
        return c?.name || c?.restaurant_name;
      }),
      ...standingLines.filter((l: any) => {
        const c = custMap.get(l.customer_id);
        return c?.name || c?.restaurant_name;
      }),
    ];

    // ── SEED SLOTS: next 4 Tuesdays + next 4 Fridays ──────────────────
    const nextTuesday = nextTuesdayOnOrAfter(today);
    const nextFriday = nextDayOnOrAfter(today, FRIDAY);
    const slots: Array<{ date: Date; day: 'Tuesday' | 'Friday' }> = [];
    for (let w = 0; w < 4; w++) {
      slots.push({ date: addDays(nextTuesday, w * 7), day: 'Tuesday' });
      slots.push({ date: addDays(nextFriday, w * 7), day: 'Friday' });
    }
    slots.sort((a, b) => a.date.getTime() - b.date.getTime());

    const slotItems = (slotDate: Date, slotDay: number) => {
      const grams = new Map<string, number>();
      for (const line of lines) {
        // Standing orders have no anchor date/frequency — they repeat every
        // single week indefinitely, so they seed on every occurrence of
        // their crop's bucket day with no firstSeed/cadence check.
        if (line.is_standing) {
          for (const comp of componentsOf(line)) {
            if (seedDayFor(comp.growDays) !== slotDay) continue;
            grams.set(comp.cropId, (grams.get(comp.cropId) || 0) + comp.grams);
          }
          continue;
        }
        const firstDelivery = firstDeliveryOf(line, lines);
        for (const comp of componentsOf(line)) {
          if (seedDayFor(comp.growDays) !== slotDay) continue;
          const firstSeed = firstSeedFor(firstDelivery, comp.growDays);
          if (!seedsAtSlot(slotDate, firstSeed, line.frequency, line.recurring)) continue;
          grams.set(comp.cropId, (grams.get(comp.cropId) || 0) + comp.grams);
        }
      }
      const items: any[] = [];
      for (const [cropId, gramsNeeded] of grams) {
        const crop = cropMap.get(cropId);
        if (!crop) continue;
        const yieldPerTray = crop.yield_per_tray_grams || null;
        const traysNeeded = yieldPerTray && gramsNeeded > 0 ? Math.ceil(gramsNeeded / yieldPerTray) : 1;
        const alreadySeeded = seededTrays.get(`${cropId}|${ymd(slotDate)}`) || 0;
        const trays = Math.max(0, traysNeeded - alreadySeeded);
        if (trays === 0) continue;
        const growDays = growDaysFromProc(procMap.get(cropId));
        const harvestTue = nextTuesdayOnOrAfter(addDays(slotDate, growDays));
        items.push({
          crop_name: crop.name_en,
          quantity_trays: trays,
          trays,
          grams_needed: Math.round(gramsNeeded),
          harvest_display: fmt(harvestTue),
        });
      }
      return items.sort((a, b) => a.crop_name.localeCompare(b.crop_name));
    };

    const seedSchedule = slots
      .map(({ date, day }) => {
        const items = slotItems(date, day === 'Tuesday' ? TUESDAY : FRIDAY);
        return {
          date: ymd(date),
          display: fmt(date),
          day,
          total_trays: items.reduce((s: number, i: any) => s + i.trays, 0),
          items,
        };
      })
      .filter(d => d.items.length > 0);

    const bySlotDate = new Map<string, any[]>(seedSchedule.map(s => [s.date, s.items]));
    const flatSeedDay = (dateKey: string) => bySlotDate.get(dateKey) || [];

    // ── DELIVERY SCHEDULE (per customer) ────────────────────────────────
    // Keyed by `${customerId}|${date}`, not just customerId — a customer can
    // have two crops on different cadences that land on different Tuesdays
    // within the window (e.g. weekly basil + biweekly pea shoots on their
    // off week). Keying by customer alone and stopping at the first match
    // silently dropped every delivery after the earliest one.
    const customerDeliveryMap = new Map<string, { harvest_date: string; harvest_display: string; customer_name: string; items: any[] }>();
    const upcomingTuesdays: Date[] = [];
    for (let w = 0; w < 6; w++) upcomingTuesdays.push(addDays(nextTuesday, w * 7));

    const lineItem = (line: any) => {
      const variant = varMap.get(line.product_variant_id);
      const crop = variant ? cropMap.get(variant.crop_id) : null;
      const orderQty = line.quantity || 1;
      const sizeGrams = variant?.size_grams || 0;
      const totalGrams = orderQty * sizeGrams;
      const yieldPerTray = crop?.yield_per_tray_grams || null;
      return {
        crop_name: crop?.name_en || 'Unknown',
        order_qty: orderQty,
        size_name: variant?.size_name || '',
        size_grams: sizeGrams,
        trays_needed: yieldPerTray && totalGrams > 0 ? Math.ceil(totalGrams / yieldPerTray) : orderQty,
      };
    };

    const customerIds = new Set<string>(lines.map((l: any) => l.customer_id));

    for (const customerId of customerIds) {
      const customer = custMap.get(customerId);
      if (!customer?.name && !customer?.restaurant_name) continue;

      for (const t of upcomingTuesdays) {
        const items: any[] = [];

        for (const line of lines) {
          if (line.customer_id !== customerId) continue;
          // Standing orders deliver every Tuesday, unconditionally — no
          // anchor/frequency to check against.
          if (line.is_standing) { items.push(lineItem(line)); continue; }
          const firstDelivery = firstDeliveryOf(line, lines);
          if (deliversOnTuesday(t, firstDelivery, line.frequency, line.recurring)) items.push(lineItem(line));
        }

        if (items.length > 0) {
          customerDeliveryMap.set(`${customerId}|${ymd(t)}`, {
            harvest_date: ymd(t),
            harvest_display: fmt(t),
            customer_name: customer.restaurant_name || customer.name,
            items,
          });
        }
      }
    }

    const schedule = Array.from(customerDeliveryMap.values()).sort((a, b) =>
      a.harvest_date.localeCompare(b.harvest_date) || a.customer_name.localeCompare(b.customer_name)
    );

    const missingProcedures = Array.from(missingProcedureCropIds)
      .map(id => cropMap.get(id)?.name_en || id)
      .sort();

    return NextResponse.json({
      success: true,
      data: {
        schedule,
        seed_today: flatSeedDay(ymd(today)),
        seed_tuesday: flatSeedDay(ymd(nextTuesday)),
        seed_friday: flatSeedDay(ymd(nextFriday)),
        seed_schedule: seedSchedule,
        active_batches: activeBatches,
        ready_to_harvest: readyToHarvest,
        today: ymd(today),
        next_tuesday: ymd(nextTuesday),
        next_friday: ymd(nextFriday),
        missing_procedures: missingProcedures,
      },
    });
  } catch (error) {
    console.error('Production GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
