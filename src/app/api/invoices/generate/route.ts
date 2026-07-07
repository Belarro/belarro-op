import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { deliversOnTuesday, localMidnight, nextTuesdayOnOrAfter, ymd } from '@/lib/seeding';

// All Tuesdays in a given YYYY-MM
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

/**
 * Invoices are split at "today":
 *
 * - Tuesdays <= today read belarro_v4_delivery — the immutable ledger written
 *   when a delivery is confirmed in Sales Tracker. Only rows that actually
 *   exist there appear; a line the customer hasn't received yet (because the
 *   order was just placed/edited) shows nothing, and 'not_delivered' rows are
 *   excluded from billing. Editing an order today can NEVER change what an
 *   already-confirmed past Tuesday billed, because that Tuesday's rows are
 *   already in the ledger and this code doesn't touch them.
 *
 * - Tuesdays > today have no delivery yet by definition, so they're a
 *   forward-looking PREDICTION built from the current live order config
 *   (same math as /api/production). Each such line is flagged `predicted:
 *   true` so the UI can mark it clearly as not-yet-real.
 */
export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month param required (YYYY-MM)' }, { status: 400 });
    }

    const [year, mon] = month.split('-').map(Number);
    const tuesdays = tuesdaysInMonth(year, mon);
    const today = localMidnight(new Date());
    const pastTuesdays = tuesdays.filter(t => t.getTime() <= today.getTime());
    const futureTuesdays = tuesdays.filter(t => t.getTime() > today.getTime());

    const [orders, variants, crops, customers, deliveries] = await Promise.all([
      fetchFromSupabase('/belarro_v4_order?deleted_at=is.null&select=*').catch((e: any) => { throw new Error('orders: ' + e.message); }),
      fetchFromSupabase('/belarro_v4_product_variant?select=*').catch((e: any) => { throw new Error('variants: ' + e.message); }),
      fetchFromSupabase('/belarro_v4_crop?select=id,name_en&deleted_at=is.null').catch((e: any) => { throw new Error('crops: ' + e.message); }),
      fetchFromSupabase('/belarro_v4_customer?select=id,name,restaurant_name,email,address').catch((e: any) => { throw new Error('customers: ' + e.message); }),
      pastTuesdays.length > 0
        ? fetchFromSupabase(
            `/belarro_v4_delivery?delivery_date=gte.${ymd(pastTuesdays[0])}&delivery_date=lte.${ymd(pastTuesdays[pastTuesdays.length - 1])}&deleted_at=is.null&select=*`
          ).catch((e: any) => { throw new Error('deliveries: ' + e.message); })
        : Promise.resolve([]),
    ]);

    const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));
    const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
    const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));

    // Group orders by customer (for the future/predicted portion)
    const ordersByCustomer = new Map<string, any[]>();
    for (const order of (orders || [])) {
      if (!ordersByCustomer.has(order.customer_id)) ordersByCustomer.set(order.customer_id, []);
      ordersByCustomer.get(order.customer_id)!.push(order);
    }

    // Group confirmed deliveries by customer (ground truth for the past)
    const deliveriesByCustomer = new Map<string, any[]>();
    for (const d of (deliveries || [])) {
      if (!deliveriesByCustomer.has(d.customer_id)) deliveriesByCustomer.set(d.customer_id, []);
      deliveriesByCustomer.get(d.customer_id)!.push(d);
    }

    const customerIds = new Set<string>([...ordersByCustomer.keys(), ...deliveriesByCustomer.keys()]);

    const invoices = Array.from(customerIds).map((customerId) => {
      const customer = custMap.get(customerId);
      if (!customer) return null;
      const customerName = customer.restaurant_name || customer.name || 'Unknown';

      const lines: any[] = [];

      // Past: ground truth from the ledger. Skipped deliveries aren't billed.
      for (const d of (deliveriesByCustomer.get(customerId) || [])) {
        if (d.status === 'not_delivered') continue;
        const qty = d.actual_qty ?? d.expected_qty ?? 1;
        lines.push({
          id: `${d.order_id}-${d.delivery_date}`,
          order_id: d.order_id,
          delivery_date: d.delivery_date,
          crop_name: d.crop_name,
          size_name: d.size_name,
          qty,
          unit_price: d.unit_price_eur ?? 0,
          line_total: +(qty * (d.unit_price_eur ?? 0)).toFixed(2),
          removed: false,
          qty_override: null as number | null,
          predicted: false,
          delivery_status: d.status,
        });
      }

      // Future: prediction from current live order config.
      for (const order of (ordersByCustomer.get(customerId) || [])) {
        const variant = varMap.get(order.product_variant_id);
        const crop = variant ? cropMap.get(variant.crop_id) : null;
        if (!variant || !crop) continue;

        const unitPrice = variant.price_eur ?? 0;
        const qty = order.quantity || 1;
        const firstDelivery = order.next_delivery_date
          ? nextTuesdayOnOrAfter(new Date(order.next_delivery_date))
          : null;
        if (!firstDelivery) continue;

        for (const tuesday of futureTuesdays) {
          if (!deliversOnTuesday(tuesday, firstDelivery, order.frequency)) continue;

          lines.push({
            id: `${order.id}-${ymd(tuesday)}`,
            order_id: order.id,
            delivery_date: ymd(tuesday),
            crop_name: crop.name_en,
            size_name: variant.size_name,
            qty,
            unit_price: unitPrice,
            line_total: +(qty * unitPrice).toFixed(2),
            removed: false,
            qty_override: null as number | null,
            predicted: true,
          });
        }
      }

      lines.sort((a, b) => a.delivery_date.localeCompare(b.delivery_date) || a.crop_name.localeCompare(b.crop_name));

      const subtotal = lines.reduce((s, l) => s + (l.removed ? 0 : l.line_total), 0);

      return {
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customer.email || null,
        customer_address: customer.address || null,
        customer_tax_number: null,
        net_days: 30,
        month,
        lines,
        subtotal: +subtotal.toFixed(2),
        vat: +(subtotal * 0.07).toFixed(2),
        total: +(subtotal * 1.07).toFixed(2),
      };
    }).filter(Boolean).sort((a: any, b: any) => a.customer_name.localeCompare(b.customer_name));

    return NextResponse.json({
      success: true,
      data: invoices,
      tuesdays: tuesdays.map(t => ymd(t)),
      _debug: {
        order_count: (orders || []).length,
        variant_count: (variants || []).length,
        crop_count: (crops || []).length,
        customer_count: (customers || []).length,
        delivery_ledger_rows: (deliveries || []).length,
        invoices_generated: invoices.length,
      }
    });
  } catch (error) {
    console.error('Invoice generate error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
