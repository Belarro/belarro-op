import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { ymd } from '@/lib/seeding';

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
 * This is Ron's reconciliation copy — the thing he checks against before
 * billing on his other system — so it only ever shows what has ACTUALLY
 * been confirmed in belarro_v4_delivery. No predictions, no "expected this
 * week." A Tuesday that hasn't been confirmed yet (still Pending, or the
 * whole week hasn't happened) simply doesn't appear, same as one marked
 * 'not_delivered'. If the count looks low, that means something is still
 * waiting to be confirmed in Delivery > History, not that the math is off —
 * see /api/deliveries/due for what's still outstanding.
 *
 * Editing an order today can never change what an already-confirmed past
 * Tuesday billed, because that Tuesday's rows are already in the ledger and
 * this code only ever reads them, never recomputes them.
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

    const [customers, deliveries] = await Promise.all([
      fetchFromSupabase('/belarro_v4_customer?select=id,name,restaurant_name,email,address').catch((e: any) => { throw new Error('customers: ' + e.message); }),
      tuesdays.length > 0
        ? fetchFromSupabase(
            `/belarro_v4_delivery?delivery_date=gte.${ymd(tuesdays[0])}&delivery_date=lte.${ymd(tuesdays[tuesdays.length - 1])}&deleted_at=is.null&select=*`
          ).catch((e: any) => { throw new Error('deliveries: ' + e.message); })
        : Promise.resolve([]),
    ]);

    const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));

    // Group confirmed deliveries by customer — this is the only source for
    // this page. A customer with no confirmed deliveries this month simply
    // doesn't appear; there's nothing to reconcile yet.
    const deliveriesByCustomer = new Map<string, any[]>();
    for (const d of (deliveries || [])) {
      if (!deliveriesByCustomer.has(d.customer_id)) deliveriesByCustomer.set(d.customer_id, []);
      deliveriesByCustomer.get(d.customer_id)!.push(d);
    }

    const invoices = Array.from(deliveriesByCustomer.keys()).map((customerId) => {
      const customer = custMap.get(customerId);
      if (!customer) return null;
      const customerName = customer.restaurant_name || customer.name || 'Unknown';

      const lines: any[] = [];

      // Ground truth from the ledger only. Skipped deliveries aren't billed.
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
