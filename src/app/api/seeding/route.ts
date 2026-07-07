import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    try {
      const [crops, orders, batches, harvests, variants] = await Promise.all([
        fetchFromSupabase('/belarro_v4_crop?select=*'),
        fetchFromSupabase('/belarro_v4_order?select=*'),
        fetchFromSupabase('/belarro_v4_seeding_batch?select=*'),
        fetchFromSupabase('/belarro_v4_harvest_record?select=*'),
        fetchFromSupabase('/belarro_v4_product_variant?select=*')
      ]);

      const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
      const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));

      // 1. Orders ready to seed today
      // Filter orders that are in 'pending_seed' status
      const pendingOrders = (orders || []).filter((o: any) => o.status === 'pending_seed');
      
      const ordersToSeed = pendingOrders.map((o: any) => {
        const variant = varMap.get(o.product_variant_id);
        const crop = variant ? cropMap.get(variant.crop_id) : null;
        return {
          ...o,
          variant,
          crop
        };
      });

      // 2. Active seeding batches (not harvested yet)
      const bts = batches || [];
      const hvs = harvests || [];
      const harvestedBatchIds = new Set(hvs.map((h: any) => h.seeding_batch_id));
      
      const activeBatches = bts.filter((b: any) => !harvestedBatchIds.has(b.id)).map((b: any) => ({
        ...b,
        crop: cropMap.get(b.crop_id) || { name_en: 'Unknown Crop' }
      }));

      // 3. Batches ready to harvest (active batches where expected_harvest_date is <= today)
      const today = new Date();
      const readyToHarvest = activeBatches.filter((b: any) => new Date(b.expected_harvest_date) <= today);

      return NextResponse.json({
        success: true,
        data: {
          orders_to_seed: ordersToSeed,
          active_batches: activeBatches,
          ready_to_harvest: readyToHarvest
        }
      });
    } catch (dbErr) {
      console.warn('Seeding tables not ready, using mocks');
      return NextResponse.json({
        success: true,
        data: {
          orders_to_seed: [
            { id: 'mock-o1', quantity: 5, variant: { size_name: '100g Bag' }, crop: { id: 'mock-c1', name_en: 'Broccoli', name_de: 'Brokkoli' } }
          ],
          active_batches: [
            { id: 'mock-b1', crop_id: 'mock-c1', seeding_date: new Date().toISOString(), quantity_trays: 3, batch_type: 'order', expected_harvest_date: new Date().toISOString(), crop: { name_en: 'Broccoli' } }
          ],
          ready_to_harvest: [
            { id: 'mock-b1', crop_id: 'mock-c1', seeding_date: new Date().toISOString(), quantity_trays: 3, batch_type: 'order', expected_harvest_date: new Date().toISOString(), crop: { name_en: 'Broccoli' } }
          ]
        }
      });
    }
  } catch (error) {
    console.error('Seeding GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const body = await request.json();
    const { crop_id, seeding_date, quantity_trays, batch_type, order_ids } = body;

    if (!crop_id || !seeding_date || !quantity_trays || !batch_type) {
      return NextResponse.json(
        { success: false, error: 'crop_id, seeding_date, quantity_trays, and batch_type are required' },
        { status: 400 }
      );
    }

    // Fetch crop growth days
    const procedure = await fetchFromSupabase(`/belarro_v4_growth_procedure?crop_id=eq.${crop_id}&select=*`);
    let growthDays = 10;
    if (procedure && procedure.length > 0) {
      const p = procedure[0];
      const lightsDays = p.light_enabled ? (p.light_days || 0) : 0;
      let envDays = 0;
      if (lightsDays > 0) {
        envDays = lightsDays;
      } else if (p.blackout_enabled && p.blackout_days) {
        envDays = p.blackout_days;
      } else {
        envDays = p.growth_env_days || 0;
      }
      growthDays = (p.stack_enabled ? (p.stack_days || 0) : 0) + envDays;
    }

    const seedingDateObj = new Date(seeding_date);
    const expectedHarvestDate = new Date(seedingDateObj);
    expectedHarvestDate.setDate(expectedHarvestDate.getDate() + growthDays);

    const batchId = crypto.randomUUID();

    // Insert seeding batch
    const newBatch = await fetchFromSupabase('/belarro_v4_seeding_batch', {
      method: 'POST',
      body: JSON.stringify({
        id: batchId,
        crop_id,
        seeding_date: seedingDateObj.toISOString(),
        quantity_trays: parseInt(quantity_trays),
        batch_type,
        expected_harvest_date: expectedHarvestDate.toISOString()
      })
    });

    // Deduct seeds from inventory
    try {
      const seedInv = await fetchFromSupabase(`/belarro_v4_seed_inventory?crop_id=eq.${crop_id}&select=*`);
      if (seedInv && seedInv.length > 0) {
        const inv = seedInv[0];
        const seedsPerTray = 60; // 60g default
        const seedsNeeded = parseInt(quantity_trays) * seedsPerTray;
        await fetchFromSupabase(`/belarro_v4_seed_inventory?id=eq.${inv.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            quantity_grams: Math.max(0, inv.quantity_grams - seedsNeeded)
          })
        });
      }
    } catch (invErr) {
      console.warn('Inventory deduction warning:', invErr);
    }

    // Log seed usage
    try {
      await fetchFromSupabase('/belarro_v4_seed_usage_log', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          crop_id,
          quantity_used_grams: parseInt(quantity_trays) * 60,
          trays_seeded: parseInt(quantity_trays),
          seeded_date: seedingDateObj.toISOString()
        })
      });
    } catch (logErr) {
      console.warn('Seed usage log warning:', logErr);
    }

    // Update order statuses from 'pending_seed' to 'growing'
    if (order_ids && Array.isArray(order_ids)) {
      for (const orderId of order_ids) {
        try {
          await fetchFromSupabase(`/belarro_v4_order?id=eq.${orderId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'growing'
            })
          });
        } catch (ordErr) {
          console.warn(`Order status update failed for ${orderId}:`, ordErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: newBatch ? newBatch[0] : { id: batchId, crop_id, seeding_date },
      message: 'Batch seeded successfully and orders set to growing.'
    });
  } catch (error) {
    console.error('Seeding POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
