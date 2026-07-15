import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { localMidnight, nextTuesdayOnOrAfter, ymd } from '@/lib/seeding';
// import removed

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const body = await request.json();
    const { seeding_batch_id, harvest_date, actual_yield_grams, notes } = body;
    let { order_ids } = body;

    if (!seeding_batch_id || !harvest_date || actual_yield_grams === undefined) {
      return NextResponse.json(
        { success: false, error: 'seeding_batch_id, harvest_date, and actual_yield_grams are required' },
        { status: 400 }
      );
    }

    const harvestId = crypto.randomUUID();
    const yieldGrams = parseFloat(actual_yield_grams);

    // Get seeding batch info
    const batch = await fetchFromSupabase(`/belarro_v4_seeding_batch?id=eq.${seeding_batch_id}&select=*`);
    if (!batch || batch.length === 0) {
      return NextResponse.json({ success: false, error: 'Seeding batch not found' }, { status: 404 });
    }
    const batchData = batch[0];

    // If the caller (Production UI) didn't say which orders this batch
    // fulfills, resolve it ourselves: any active order for this crop whose
    // next delivery is this batch's harvest Tuesday. Previously the UI
    // always sent order_ids: [], so every harvest silently routed 100% to
    // sample inventory and real orders never advanced past "growing."
    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      const harvestTuesday = ymd(nextTuesdayOnOrAfter(localMidnight(new Date(harvest_date))));
      const [orders, variants] = await Promise.all([
        fetchFromSupabase("/belarro_v4_order?status=in.(active,pending_seed,growing)&deleted_at=is.null&select=*"),
        fetchFromSupabase('/belarro_v4_product_variant?select=id,crop_id'),
      ]);
      const variantIdsForCrop = new Set((variants || []).filter((v: any) => v.crop_id === batchData.crop_id).map((v: any) => v.id));
      order_ids = (orders || [])
        .filter((o: any) => variantIdsForCrop.has(o.product_variant_id))
        .filter((o: any) => o.next_delivery_date && ymd(nextTuesdayOnOrAfter(new Date(o.next_delivery_date))) === harvestTuesday)
        .map((o: any) => o.id);
    }

    // Simple allocation: allocate to orders first, remainder to samples
    let allocatedToOrders = 0;

    // Fetch orders if order_ids are provided
    if (order_ids && Array.isArray(order_ids) && order_ids.length > 0) {
      // Calculate total order grams needed
      // Fetch variant grams to calculate total needed
      const [orders, variants] = await Promise.all([
        fetchFromSupabase('/belarro_v4_order?select=*'),
        fetchFromSupabase('/belarro_v4_product_variant?select=*')
      ]);

      const ordMap = new Map<string, any>((orders || []).map((o: any) => [o.id, o]));
      const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));

      let totalNeeded = 0;
      for (const oid of order_ids) {
        const o = ordMap.get(oid);
        const v = o ? varMap.get(o.product_variant_id) : null;
        if (o && v) {
          totalNeeded += o.quantity * v.size_grams;
        }
      }

      // Running remainder of yield not yet claimed by an earlier order in
      // this loop — was previously computed once before the loop and never
      // decremented, so every order's allocated_grams came out as
      // Math.min(gramsNeeded, yieldGrams - min(yieldGrams,totalNeeded)),
      // i.e. 0 whenever yield fell short of total demand.
      let remainingYield = yieldGrams;

      // Create fulfillment records and update orders
      for (const oid of order_ids) {
        const o = ordMap.get(oid);
        const v = o ? varMap.get(o.product_variant_id) : null;
        if (o && v) {
          const gramsNeeded = o.quantity * v.size_grams;
          const allocated = Math.max(0, Math.min(gramsNeeded, remainingYield));
          remainingYield -= allocated;
          allocatedToOrders += allocated;

          try {
            // Create order fulfillment
            await fetchFromSupabase('/belarro_v4_order_fulfillment', {
              method: 'POST',
              body: JSON.stringify({
                id: crypto.randomUUID(),
                order_id: oid,
                harvest_record_id: harvestId,
                allocated_grams: allocated,
                packed_date: new Date().toISOString(),
                delivered: false
              })
            });

            // Update order status to 'ready_harvest' (or packed)
            await fetchFromSupabase(`/belarro_v4_order?id=eq.${oid}`, {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'ready_harvest'
              })
            });
          } catch (fulErr) {
            console.error(`Fulfillment logging failed for order ${oid}:`, fulErr);
          }
        }
      }
    }

    const allocatedToSamples = Math.max(0, yieldGrams - allocatedToOrders);

    // Save harvest record
    const newHarvest = await fetchFromSupabase('/belarro_v4_harvest_record', {
      method: 'POST',
      body: JSON.stringify({
        id: harvestId,
        seeding_batch_id,
        harvest_date: new Date(harvest_date).toISOString(),
        actual_yield_grams: yieldGrams,
        yield_used_for_orders_grams: allocatedToOrders,
        yield_available_samples_grams: allocatedToSamples,
        notes: notes || null
      })
    });

    // Update sample inventory if there's any remaining yield
    if (allocatedToSamples > 0) {
      try {
        const sampleInv = await fetchFromSupabase(`/belarro_v4_sample_inventory?crop_id=eq.${batchData.crop_id}&select=*`);
        if (sampleInv && sampleInv.length > 0) {
          const inv = sampleInv[0];
          await fetchFromSupabase(`/belarro_v4_sample_inventory?id=eq.${inv.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              available_grams: inv.available_grams + allocatedToSamples
            })
          });
        } else {
          await fetchFromSupabase('/belarro_v4_sample_inventory', {
            method: 'POST',
            body: JSON.stringify({
              id: crypto.randomUUID(),
              crop_id: batchData.crop_id,
              available_grams: allocatedToSamples
            })
          });
        }
      } catch (invErr) {
        console.warn('Sample inventory log warning:', invErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: newHarvest ? newHarvest[0] : { id: harvestId, seeding_batch_id, actual_yield_grams: yieldGrams },
      message: 'Harvest recorded and allocated successfully.'
    });
  } catch (error) {
    console.error('Harvest POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
