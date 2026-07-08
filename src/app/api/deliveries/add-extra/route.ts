import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

/**
 * POST /api/deliveries/add-extra
 * body: { customer_id, product_variant_id, quantity, delivery_date (YYYY-MM-DD), note? }
 *
 * A one-off extra added to a single week's delivery — Ron: "if I wanna add
 * something that I gave extra... choose a crop, a size, and how many." This
 * is NOT a new standing order: it must never repeat next week and must not
 * clutter the Orders admin page as a new recurring line.
 *
 * belarro_v4_delivery.order_id has a real FK to belarro_v4_order (and the
 * ledger's unique key is order_id+delivery_date), so an extra still needs a
 * backing order row to hang off of — it's marked recurring:false, which
 * deliversOnTuesday()/seedsAtSlot() treat as "only this exact date, never
 * again" (see src/lib/seeding.ts). frequency is DB NOT NULL + CHECK'd to
 * 'weekly'/'biweekly' only, so it's set to 'weekly' as an inert placeholder
 * — recurring:false makes the frequency value irrelevant either way.
 *
 * The order is created already confirmed as delivered in the ledger, since
 * by definition this is something that was actually handed over.
 */
export async function POST(request: NextRequest) {
  try {
    if (!request.cookies.get('belarro_session')?.value) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { customer_id, product_variant_id, quantity, delivery_date, note } = body;

    if (!customer_id || !product_variant_id || !quantity || !delivery_date) {
      return NextResponse.json(
        { success: false, error: 'customer_id, product_variant_id, quantity, and delivery_date are required' },
        { status: 400 }
      );
    }

    const [variant, customer] = await Promise.all([
      fetchFromSupabase(`/belarro_v4_product_variant?id=eq.${product_variant_id}&select=*`),
      fetchFromSupabase(`/belarro_v4_customer?id=eq.${customer_id}&select=id`),
    ]);
    if (!variant || variant.length === 0) {
      return NextResponse.json({ success: false, error: 'Product variant not found' }, { status: 404 });
    }
    if (!customer || customer.length === 0) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }
    const variantData = variant[0];

    let cropName = 'Unknown';
    const crop = await fetchFromSupabase(`/belarro_v4_crop?id=eq.${variantData.crop_id}&select=name_en`);
    if (crop && crop.length > 0) cropName = crop[0].name_en;

    const qty = parseFloat(String(quantity));
    const orderId = crypto.randomUUID();
    const deliveryDateIso = `${delivery_date}T00:00:00+02:00`;

    const newOrder = await fetchFromSupabase('/belarro_v4_order', {
      method: 'POST',
      body: JSON.stringify({
        id: orderId,
        customer_id,
        product_variant_id,
        quantity: qty,
        order_date: new Date().toISOString(),
        expected_harvest_date: deliveryDateIso,
        next_delivery_date: deliveryDateIso,
        status: 'active',
        recurring: false,
        frequency: 'weekly',
      }),
    });

    const deliveryId = crypto.randomUUID();
    const deliveryRow = await fetchFromSupabase('/belarro_v4_delivery', {
      method: 'POST',
      body: JSON.stringify({
        id: deliveryId,
        order_id: orderId,
        customer_id,
        delivery_date,
        crop_name: cropName,
        size_name: variantData.size_name || null,
        expected_qty: qty,
        actual_qty: qty,
        unit_price_eur: variantData.price_eur ?? 0,
        status: 'delivered',
        note: note || null,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      success: true,
      data: {
        order: newOrder ? newOrder[0] : { id: orderId },
        delivery: deliveryRow ? deliveryRow[0] : null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Deliveries add-extra POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
