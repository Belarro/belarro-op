import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

/**
 * Admin-side management of website leads.
 *
 * GET    /api/website-leads          -> all leads (newest first)
 * PUT    /api/website-leads          -> update { id, status?, ... }
 * POST   /api/website-leads          -> { action: 'convert', id } -> create customer from lead
 */

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    try {
      const leads = await fetchFromSupabase(
        '/belarro_v4_website_lead?select=*&order=created_at.desc'
      );
      return NextResponse.json({ success: true, data: leads || [] });
    } catch (dbErr) {
      // Table not applied yet — degrade gracefully (matches existing routes).
      console.warn('website_lead table not ready:', dbErr instanceof Error ? dbErr.message : dbErr);
      return NextResponse.json({ success: true, data: [], pending_migration: true });
    }
  } catch (error) {
    console.error('Website-leads GET error:', error);
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
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updateData.status = status;

    const result = await fetchFromSupabase(
      `/belarro_v4_website_lead?id=eq.${id}`,
      { method: 'PATCH', body: JSON.stringify(updateData) }
    );

    return NextResponse.json({ success: true, data: result ? result[0] : null });
  } catch (error) {
    console.error('Website-leads PUT error:', error);
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
    const { action, id } = body;

    if (action !== 'convert' || !id) {
      return NextResponse.json(
        { success: false, error: 'Unsupported action' },
        { status: 400 }
      );
    }

    const leads = await fetchFromSupabase(
      `/belarro_v4_website_lead?id=eq.${id}&select=*`
    );
    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }
    const lead = leads[0];

    if (lead.status === 'converted' && lead.converted_customer_id) {
      return NextResponse.json(
        { success: false, error: 'Lead already converted' },
        { status: 409 }
      );
    }

    // Create customer from lead.
    const customerId = crypto.randomUUID();
    const newCustomer = await fetchFromSupabase('/belarro_v4_customer', {
      method: 'POST',
      body: JSON.stringify({
        id: customerId,
        name: lead.name,
        restaurant_name: lead.restaurant_name || null,
        email: lead.email || null,
        phone: lead.phone || null,
        status: 'prospect',
        net_days: 30,
        first_contact_date: lead.created_at || new Date().toISOString(),
      }),
    });

    // Mark lead converted + link.
    await fetchFromSupabase(`/belarro_v4_website_lead?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'converted',
        converted_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }),
    });

    // Re-point the lead's pending follow-ups to the new customer.
    await fetchFromSupabase(
      `/belarro_v4_follow_up?website_lead_id=eq.${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ customer_id: customerId }),
      }
    );

    return NextResponse.json({
      success: true,
      data: newCustomer ? newCustomer[0] : { id: customerId, name: lead.name },
      message: 'Lead converted to customer.',
    });
  } catch (error) {
    console.error('Website-leads convert error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
