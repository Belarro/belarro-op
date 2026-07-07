import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed
import { logError } from '@/lib/logger';

/**
 * Size templates = product variants (size + grams + price) per crop, stored
 * in belarro_v4_product_variant. This route powers /admin/sizes-prices.
 *
 * GET    /api/size-templates              -> all variants grouped by crop
 * GET    /api/size-templates?crop_id=...  -> variants for one crop
 * POST   /api/size-templates              -> create variant
 * PUT    /api/size-templates              -> update variant (esp. price) by id
 * DELETE /api/size-templates              -> delete variant by id
 */

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const cropId = searchParams.get('crop_id');

    if (cropId) {
      const variants = await fetchFromSupabase(
        `/belarro_v4_product_variant?crop_id=eq.${cropId}&deleted_at=is.null&select=*&order=size_grams.asc`
      );
      return NextResponse.json({ success: true, data: variants || [] });
    }

    const crops = await fetchFromSupabase(
      `/belarro_v4_crop?deleted_at=is.null&select=id,name_en,name_de,status&order=name_en.asc`
    );
    const variants = await fetchFromSupabase(
      `/belarro_v4_product_variant?select=*&order=size_grams.asc`
    );
    const byCrop = new Map<string, any[]>();
    for (const v of variants || []) {
      const arr = byCrop.get(v.crop_id) || [];
      arr.push(v);
      byCrop.set(v.crop_id, arr);
    }

    const data = (crops || []).map((c: any) => ({
      crop: c,
      variants: byCrop.get(c.id) || [],
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Size-templates GET error:', error);
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
    const { crop_id, size_name, size_grams, price_eur, is_internal } = body;

    if (!crop_id || !size_name || size_grams === undefined || size_grams === null) {
      return NextResponse.json(
        { success: false, error: 'crop_id, size_name and size_grams are required' },
        { status: 400 }
      );
    }

    const grams = Number(size_grams);
    if (Number.isNaN(grams) || grams <= 0) {
      return NextResponse.json(
        { success: false, error: 'size_grams must be a positive number' },
        { status: 400 }
      );
    }

    const result = await fetchFromSupabase('/belarro_v4_product_variant', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        crop_id,
        size_name,
        size_grams: grams,
        price_eur: price_eur !== undefined && price_eur !== null && price_eur !== ''
          ? Number(price_eur)
          : null,
        is_internal: is_internal || false,
      }),
    });

    return NextResponse.json(
      { success: true, data: result ? result[0] : null },
      { status: 201 }
    );
  } catch (error) {
    console.error('Size-templates POST error:', error);
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
    const { id, size_name, size_grams, price_eur, is_internal } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (size_name !== undefined) updateData.size_name = size_name;
    if (size_grams !== undefined && size_grams !== null && size_grams !== '') {
      const grams = Number(size_grams);
      if (Number.isNaN(grams) || grams <= 0) {
        return NextResponse.json(
          { success: false, error: 'size_grams must be a positive number' },
          { status: 400 }
        );
      }
      updateData.size_grams = grams;
    }
    if (price_eur !== undefined) {
      updateData.price_eur = price_eur === null || price_eur === '' ? null : Number(price_eur);
    }
    if (is_internal !== undefined) updateData.is_internal = is_internal;

    const result = await fetchFromSupabase(
      `/belarro_v4_product_variant?id=eq.${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      }
    );

    return NextResponse.json({ success: true, data: result ? result[0] : null });
  } catch (error) {
    console.error('Size-templates PUT error:', error);
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

    await fetchFromSupabase(`/belarro_v4_product_variant?id=eq.${id}`, {
      method: 'DELETE',
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Size-templates DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
