import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { logError } from '@/lib/logger';
import {
  addDays,
  effectiveGrowDays,
  lastDeliveryAfterStop,
  ymd,
} from '@/lib/seeding';

type Params = {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, props: Params) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await props.params;

    const order = await fetchFromSupabase(`/belarro_v4_order?id=eq.${id}&select=*`);
    if (!order || order.length === 0) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const orderData = order[0];

    // Hydrate Customer and Variant details
    const [customer, variant] = await Promise.all([
      fetchFromSupabase(`/belarro_v4_customer?id=eq.${orderData.customer_id}&select=*`),
      fetchFromSupabase(`/belarro_v4_product_variant?id=eq.${orderData.product_variant_id}&select=*`)
    ]);

    let crop = null;
    if (variant && variant.length > 0) {
      const cr = await fetchFromSupabase(`/belarro_v4_crop?id=eq.${variant[0].crop_id}&select=*`);
      if (cr && cr.length > 0) crop = cr[0];
    }

    return NextResponse.json({
      success: true,
      data: {
        ...orderData,
        customer: customer ? customer[0] : null,
        variant: variant ? { ...variant[0], crop } : null
      }
    });
  } catch (error) {
    await logError('GET /api/orders/[id]', error, { status: 500 });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, props: Params) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await props.params;
    const body = await request.json();

    // ── CROP SWAP ────────────────────────────────────────────────────
    // "Change the parsley to sunflower": the old crop's batches already in
    // the ground keep delivering. The new crop's first delivery is the
    // Tuesday AFTER the old crop's last batch delivers — seamless handover.
    // Implemented as: soft-delete the old line, create a new line whose
    // next_delivery_date is the handover Tuesday.
    if (body.swap_to_variant_id) {
      const existing = await fetchFromSupabase(`/belarro_v4_order?id=eq.${id}&deleted_at=is.null&select=*`);
      if (!existing || existing.length === 0) {
        return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
      }
      const oldLine = existing[0];

      const [variants, crops, procedures, mixComponents] = await Promise.all([
        fetchFromSupabase('/belarro_v4_product_variant?select=*'),
        fetchFromSupabase('/belarro_v4_crop?select=*'),
        fetchFromSupabase('/belarro_v4_growth_procedure?select=crop_id,stack_days,blackout_days,light_days'),
        fetchFromSupabase('/belarro_v4_crop_mix_component?select=*'),
      ]);
      const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
      const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
      const procMap = new Map<string, any>((procedures || []).map((p: any) => [p.crop_id, p]));
      const mixComponentsMap = new Map<string, any[]>();
      for (const mc of (mixComponents || [])) {
        if (!mixComponentsMap.has(mc.mix_crop_id)) mixComponentsMap.set(mc.mix_crop_id, []);
        mixComponentsMap.get(mc.mix_crop_id)!.push(mc);
      }

      const newVariant = varMap.get(body.swap_to_variant_id);
      if (!newVariant) {
        return NextResponse.json({ success: false, error: 'New product variant not found' }, { status: 404 });
      }

      const oldVariant = varMap.get(oldLine.product_variant_id);
      const oldCrop = oldVariant ? cropMap.get(oldVariant.crop_id) : null;
      const oldGrowDays = effectiveGrowDays(oldCrop, procMap, mixComponentsMap) || 10;

      // Old crop's last batch was seeded at its most recent seed slot.
      const lastOldDelivery = lastDeliveryAfterStop(new Date(), oldGrowDays);
      const handover = addDays(lastOldDelivery, 7);

      // Soft-delete the old line (Data Protection Mandate — never hard-delete).
      await fetchFromSupabase(`/belarro_v4_order?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      });

      const newId = crypto.randomUUID();
      const createdRows = await fetchFromSupabase('/belarro_v4_order', {
        method: 'POST',
        body: JSON.stringify({
          id: newId,
          customer_id: oldLine.customer_id,
          product_variant_id: body.swap_to_variant_id,
          quantity: body.quantity !== undefined ? parseFloat(String(body.quantity)) : oldLine.quantity,
          order_date: new Date().toISOString(),
          next_delivery_date: `${ymd(handover)}T00:00:00+02:00`,
          status: 'active',
          recurring: true,
          frequency: body.frequency || oldLine.frequency || 'weekly',
        }),
      });

      return NextResponse.json({
        success: true,
        data: createdRows ? createdRows[0] : { id: newId },
        message: `Crop swapped. Old crop delivers until ${ymd(lastOldDelivery)}, new crop starts ${ymd(handover)}.`,
      });
    }

    const order = await fetchFromSupabase(`/belarro_v4_order?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    return NextResponse.json({
      success: true,
      data: order ? order[0] : body,
      message: 'Order updated successfully',
    });
  } catch (error) {
    await logError('PUT /api/orders/[id]', error, { status: 500 });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: Params) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await props.params;

    // Soft delete (Data Protection Mandate).
    await fetchFromSupabase(`/belarro_v4_order?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });

    return NextResponse.json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error) {
    await logError('DELETE /api/orders/[id]', error, { status: 500 });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
