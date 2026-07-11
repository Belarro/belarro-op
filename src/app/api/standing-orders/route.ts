import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

/**
 * Standing (recurring) orders. A standing order belongs to a customer and has
 * one or more line items (variant + quantity + price + delivery day).
 * Tables: belarro_v4_standing_order, belarro_v4_standing_order_item.
 *
 * GET    /api/standing-orders      -> all standing orders, hydrated w/ customer + items
 * POST   /api/standing-orders      -> create { customer_id, status, notes, items: [...] }
 * PUT    /api/standing-orders      -> update { id, status?, notes?, items? } (items replaced)
 * DELETE /api/standing-orders      -> soft delete by id (items soft-deleted too)
 *
 * belarro_v4_standing_order and belarro_v4_standing_order_item have a
 * BEFORE DELETE trigger in the DB that raises on any hard DELETE (Data
 * Protection Mandate) — the previous hard-DELETE calls here threw every
 * time, so deleting a standing order or editing its items was broken.
 */

async function loadItems(standingOrderId: string) {
  return fetchFromSupabase(
    `/belarro_v4_standing_order_item?standing_order_id=eq.${standingOrderId}&deleted_at=is.null&select=*&order=created_at.asc`
  );
}

async function insertItems(standingOrderId: string, items: any[]) {
  for (const item of items) {
    if (!item || !item.variant_id || !item.quantity) continue;
    await fetchFromSupabase('/belarro_v4_standing_order_item', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        standing_order_id: standingOrderId,
        variant_id: item.variant_id,
        size_name: item.size_name || '',
        quantity: Number(item.quantity),
        price_at_time_eur: item.price_at_time_eur !== undefined && item.price_at_time_eur !== null && item.price_at_time_eur !== ''
          ? Number(item.price_at_time_eur)
          : 0,
        delivery_day_of_week: item.delivery_day_of_week !== undefined && item.delivery_day_of_week !== null && item.delivery_day_of_week !== ''
          ? Number(item.delivery_day_of_week)
          : null,
      }),
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const orders = await fetchFromSupabase(
      `/belarro_v4_standing_order?deleted_at=is.null&select=*&order=created_at.desc`
    );
    const customers = await fetchFromSupabase(
      `/belarro_v4_customer?select=id,name,restaurant_name`
    );
    const items = await fetchFromSupabase(
      `/belarro_v4_standing_order_item?deleted_at=is.null&select=*`
    );

    const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));
    const itemsByOrder = new Map<string, any[]>();
    for (const it of items || []) {
      const arr = itemsByOrder.get(it.standing_order_id) || [];
      arr.push(it);
      itemsByOrder.set(it.standing_order_id, arr);
    }

    const data = (orders || []).map((o: any) => ({
      ...o,
      customer: custMap.get(o.customer_id) || { name: 'Unknown Customer' },
      items: itemsByOrder.get(o.id) || [],
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Standing-orders GET error:', error);
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
    const { customer_id, status, notes, items } = body;

    if (!customer_id) {
      return NextResponse.json(
        { success: false, error: 'customer_id is required' },
        { status: 400 }
      );
    }

    // Integrity: customer must exist.
    const customer = await fetchFromSupabase(
      `/belarro_v4_customer?id=eq.${customer_id}&select=id`
    );
    if (!customer || customer.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      );
    }

    const standingOrderId = crypto.randomUUID();
    const created = await fetchFromSupabase('/belarro_v4_standing_order', {
      method: 'POST',
      body: JSON.stringify({
        id: standingOrderId,
        customer_id,
        status: status || 'active',
        notes: notes || null,
      }),
    });

    if (Array.isArray(items) && items.length > 0) {
      await insertItems(standingOrderId, items);
    }

    const itemRows = await loadItems(standingOrderId);

    return NextResponse.json(
      {
        success: true,
        data: { ...(created ? created[0] : { id: standingOrderId }), items: itemRows || [] },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Standing-orders POST error:', error);
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
    const { id, status, notes, items } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    await fetchFromSupabase(`/belarro_v4_standing_order?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });

    // If items provided, replace them wholesale (soft-delete the old rows —
    // the table has a no-hard-delete trigger, a real DELETE here throws).
    if (Array.isArray(items)) {
      await fetchFromSupabase(
        `/belarro_v4_standing_order_item?standing_order_id=eq.${id}&deleted_at=is.null`,
        { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString() }) }
      );
      await insertItems(id, items);
    }

    const updated = await fetchFromSupabase(
      `/belarro_v4_standing_order?id=eq.${id}&select=*`
    );
    const itemRows = await loadItems(id);

    return NextResponse.json({
      success: true,
      data: { ...(updated ? updated[0] : { id }), items: itemRows || [] },
    });
  } catch (error) {
    console.error('Standing-orders PUT error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    // Soft delete (Data Protection Mandate) — the table's no-hard-delete
    // trigger would reject a real DELETE anyway. Items are soft-deleted too
    // since there's no cascade on a soft delete.
    const deletedAt = new Date().toISOString();
    await fetchFromSupabase(`/belarro_v4_standing_order?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: deletedAt }),
    });
    await fetchFromSupabase(`/belarro_v4_standing_order_item?standing_order_id=eq.${id}&deleted_at=is.null`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: deletedAt }),
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Standing-orders DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
