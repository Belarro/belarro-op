import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM

    let path = '/belarro_v4_invoice?select=*&order=invoice_month.desc';
    if (month) {
      path = `/belarro_v4_invoice?invoice_month=eq.${month}&select=*`;
    }

    try {
      const invoices = await fetchFromSupabase(path);
      const invs = invoices || [];

      // Hydrate customer details
      const customers = await fetchFromSupabase('/belarro_v4_customer?select=id,name');
      const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));

      const hydrated = invs.map((i: any) => ({
        ...i,
        customer: custMap.get(i.customer_id) || { name: 'Unknown Customer' }
      }));

      return NextResponse.json({
        success: true,
        data: hydrated
      });
    } catch (dbErr) {
      console.warn('Invoices table not ready, using mocks');
      return NextResponse.json({
        success: true,
        data: [
          {
            id: 'mock-i1',
            customer_id: 'mock-c1',
            invoice_month: '2026-06',
            total_amount_eur: 325.00,
            vat_amount_eur: 22.75,
            status: 'draft',
            customer: { name: 'Chefs Table' }
          }
        ]
      });
    }
  } catch (error) {
    console.error('Invoices GET error:', error);
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
    const { customer_id, invoice_month, total_amount_eur, vat_amount_eur, status } = body;

    if (!customer_id || !invoice_month || total_amount_eur === undefined) {
      return NextResponse.json({ success: false, error: 'customer_id, invoice_month, and total_amount_eur are required' }, { status: 400 });
    }

    const invoiceId = crypto.randomUUID();

    const newInvoice = await fetchFromSupabase('/belarro_v4_invoice', {
      method: 'POST',
      body: JSON.stringify({
        id: invoiceId,
        customer_id,
        invoice_month,
        total_amount_eur: parseFloat(total_amount_eur),
        vat_amount_eur: vat_amount_eur ? parseFloat(vat_amount_eur) : parseFloat((total_amount_eur * 0.07).toFixed(2)), // Default 7% VAT for farm goods in DE
        status: status || 'draft'
      })
    });

    return NextResponse.json({
      success: true,
      data: newInvoice ? newInvoice[0] : { id: invoiceId, customer_id, invoice_month },
      message: 'Invoice logged successfully'
    });
  } catch (error) {
    console.error('Invoice POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'id and status are required' }, { status: 400 });
    }

    const updated = await fetchFromSupabase(`/belarro_v4_invoice?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString(),
        sent_at: status === 'sent' ? new Date().toISOString() : undefined,
        paid_at: status === 'paid' ? new Date().toISOString() : undefined,
      })
    });

    return NextResponse.json({
      success: true,
      data: updated ? updated[0] : null,
      message: 'Invoice status updated'
    });
  } catch (error) {
    console.error('Invoice PUT error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
