import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function GET() {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const data = await fetchFromSupabase('/belarro_v4_packaging_stock?select=*&order=size_name.asc');
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { size_name, quantity } = await request.json();
    if (!size_name) return NextResponse.json({ success: false, error: 'size_name is required' }, { status: 400 });

    const existing = await fetchFromSupabase(`/belarro_v4_packaging_stock?size_name=eq.${encodeURIComponent(size_name)}&select=id`);
    if (existing && existing.length > 0) {
      return NextResponse.json({ success: false, error: 'Size already exists' }, { status: 409 });
    }

    const record = await fetchFromSupabase('/belarro_v4_packaging_stock', {
      method: 'POST',
      body: JSON.stringify({ id: crypto.randomUUID(), size_name, quantity: parseInt(quantity) || 0 }),
    });
    return NextResponse.json({ success: true, data: record?.[0] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    await fetchFromSupabase(`/belarro_v4_packaging_stock?id=eq.${id}`, { method: 'DELETE' });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { id, quantity, mode } = await request.json();
    if (!id || quantity === undefined) return NextResponse.json({ success: false, error: 'id and quantity required' }, { status: 400 });

    let newQty = parseInt(quantity) || 0;
    if (mode === 'add') {
      const existing = await fetchFromSupabase(`/belarro_v4_packaging_stock?id=eq.${id}&select=quantity`);
      if (existing && existing.length > 0) newQty = (existing[0].quantity || 0) + newQty;
    }

    const updated = await fetchFromSupabase(`/belarro_v4_packaging_stock?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: newQty, updated_at: new Date().toISOString() }),
    });
    return NextResponse.json({ success: true, data: updated?.[0] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
