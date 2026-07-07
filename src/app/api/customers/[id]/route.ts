import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed
import { logError } from '@/lib/logger';

type Params = {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, props: Params) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await props.params;

    // Fetch customer with related data (visits, orders, followups)
    const customer = await fetchFromSupabase(`/belarro_v4_customer?id=eq.${id}&select=*`);
    
    if (!customer || customer.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      );
    }

    const customerData = customer[0];

    const [visits, orders, followups] = await Promise.all([
      fetchFromSupabase(`/belarro_v4_visit?customer_id=eq.${id}&select=*&order=visit_date.desc`),
      fetchFromSupabase(`/belarro_v4_order?customer_id=eq.${id}&deleted_at=is.null&select=*&order=created_at.desc`),
      fetchFromSupabase(`/belarro_v4_follow_up?customer_id=eq.${id}&select=*&order=due_date.asc`),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...customerData,
        visits: visits || [],
        orders: orders || [],
        follow_ups: followups || [],
      },
    });
  } catch (error) {
    await logError('GET /api/customers/[id]', error, { status: 500 });
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
    const customer = await fetchFromSupabase(`/belarro_v4_customer?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    return NextResponse.json({
      success: true,
      data: customer ? customer[0] : body,
      message: 'Customer updated successfully',
    });
  } catch (error) {
    await logError('PUT /api/customers/[id]', error, { status: 500 });
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

    // Soft delete (Data Protection Mandate). Related rows are intentionally
    // left intact so the customer can be restored; lists filter on deleted_at.
    await fetchFromSupabase(`/belarro_v4_customer?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });

    return NextResponse.json({
      success: true,
      message: 'Customer deleted successfully',
    });
  } catch (error) {
    await logError('DELETE /api/customers/[id]', error, { status: 500 });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
