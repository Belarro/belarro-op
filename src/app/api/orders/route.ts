import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import {
  alignedFirstDelivery,
  effectiveGrowDays,
  firstSeedFor,
  ymd,
} from '@/lib/seeding';

export async function GET(request: NextRequest) {
  try {
    // TODO: Re-enable auth once admin_users table is populated
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');
    const status = searchParams.get('status');

    let path = '/belarro_v4_order?deleted_at=is.null&select=*&order=created_at.desc';
    if (customerId) {
      path = `/belarro_v4_order?deleted_at=is.null&customer_id=eq.${customerId}&select=*&order=created_at.desc`;
    } else if (status) {
      path = `/belarro_v4_order?deleted_at=is.null&status=eq.${status}&select=*&order=created_at.desc`;
    }

    try {
      const orders = await fetchFromSupabase(path);
      const ords = orders || [];

      // Hydrate with Customer and Variant
      const [customers, variants, crops] = await Promise.all([
        fetchFromSupabase('/belarro_v4_customer?select=id,name,email,restaurant_name'),
        fetchFromSupabase('/belarro_v4_product_variant?select=*'),
        fetchFromSupabase('/belarro_v4_crop?select=id,name_en,name_de')
      ]);

      const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));
      const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
      const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));

      const hydrated = ords.map((o: any) => {
        const variant = varMap.get(o.product_variant_id);
        let crop = null;
        if (variant) {
          crop = cropMap.get(variant.crop_id);
        }
        return {
          ...o,
          customer: custMap.get(o.customer_id) || { name: 'Unknown Customer' },
          variant: variant ? {
            ...variant,
            crop: crop || { name_en: 'Unknown Crop', name_de: 'Unbekannt' }
          } : null
        };
      });

      return NextResponse.json({
        success: true,
        data: hydrated
      });
    } catch (dbErr) {
      console.warn('Database tables not ready, returning mock orders');
      return NextResponse.json({
        success: true,
        data: [
          {
            id: 'mock-o1',
            customer_id: 'mock-c1',
            product_variant_id: 'mock-v1',
            quantity: 5,
            order_date: new Date().toISOString(),
            expected_harvest_date: new Date().toISOString(),
            next_delivery_date: new Date().toISOString(),
            status: 'growing',
            recurring: true,
            customer: { name: 'Chefs Table' },
            variant: { size_name: '100g Bag', price_eur: 6.50, crop: { name_en: 'Broccoli', name_de: 'Brokkoli' } }
          }
        ]
      });
    }
  } catch (error) {
    console.error('Orders GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Create order lines. Accepts a single line or a bulk `lines` array.
 * All lines posted together form one order event: the FIRST delivery is
 * aligned to the longest crop in the event, so every crop is ready on the
 * same Tuesday. Shorter crops seed later (production derives their seed
 * dates backward from next_delivery_date).
 */
export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    const body = await request.json();
    const customer_id = body.customer_id;
    const lines: Array<{ product_variant_id: string; quantity: number; frequency?: string }> =
      Array.isArray(body.lines) && body.lines.length > 0
        ? body.lines
        : (body.product_variant_id
            ? [{ product_variant_id: body.product_variant_id, quantity: body.quantity, frequency: body.frequency }]
            : []);

    if (!customer_id || lines.length === 0 || lines.some(l => !l.product_variant_id || l.quantity === undefined)) {
      return NextResponse.json(
        { success: false, error: 'customer_id and at least one line with product_variant_id and quantity are required' },
        { status: 400 }
      );
    }

    const [variants, crops, procedures, mixComponents] = await Promise.all([
      fetchFromSupabase('/belarro_v4_product_variant?select=*'),
      fetchFromSupabase('/belarro_v4_crop?select=*'),
      fetchFromSupabase('/belarro_v4_growth_procedure?select=crop_id,stack_days,stack_enabled,blackout_days,blackout_enabled,light_days,light_enabled'),
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

    // Longest crop across the whole event sets the first delivery Tuesday.
    let maxGrowDays = 0;
    for (const line of lines) {
      const variant = varMap.get(line.product_variant_id);
      if (!variant) {
        return NextResponse.json({ success: false, error: `Product variant not found: ${line.product_variant_id}` }, { status: 404 });
      }
      const crop = cropMap.get(variant.crop_id);
      const days = effectiveGrowDays(crop, procMap, mixComponentsMap);
      if (days > maxGrowDays) maxGrowDays = days;
    }
    if (maxGrowDays === 0) maxGrowDays = 10;

    const orderDate = new Date();
    const firstDelivery = alignedFirstDelivery(orderDate, maxGrowDays);

    const created: any[] = [];
    for (const line of lines) {
      const variant = varMap.get(line.product_variant_id);
      const crop = cropMap.get(variant.crop_id);
      const growDays = effectiveGrowDays(crop, procMap, mixComponentsMap) || 10;
      const firstSeed = firstSeedFor(firstDelivery, growDays);
      const harvest = new Date(firstSeed);
      harvest.setDate(harvest.getDate() + growDays);

      const orderId = crypto.randomUUID();
      const newOrder = await fetchFromSupabase('/belarro_v4_order', {
        method: 'POST',
        body: JSON.stringify({
          id: orderId,
          customer_id,
          product_variant_id: line.product_variant_id,
          quantity: parseFloat(String(line.quantity)),
          order_date: orderDate.toISOString(),
          expected_harvest_date: `${ymd(harvest)}T00:00:00+02:00`,
          next_delivery_date: `${ymd(firstDelivery)}T00:00:00+02:00`,
          status: 'active',
          recurring: true,
          frequency: line.frequency === 'biweekly' ? 'biweekly' : 'weekly',
        }),
      });
      created.push(newOrder ? newOrder[0] : { id: orderId, customer_id, product_variant_id: line.product_variant_id });
    }

    return NextResponse.json({
      success: true,
      data: created.length === 1 ? created[0] : created,
      message: 'Order created successfully',
    });
  } catch (error) {
    console.error('Order POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
