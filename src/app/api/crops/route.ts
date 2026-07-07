import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchFromSupabase } from '@/lib/supabase';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { searchParams } = new URL(request.url);
    const cropId = searchParams.get('id');

    if (cropId) {
      // Fetch single crop with relations
      const crop = await fetchFromSupabase(
        `/belarro_v4_crop?id=eq.${cropId}&select=*`
      );

      if (!crop || crop.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Crop not found' },
          { status: 404 }
        );
      }

      const cropData = crop[0];

      // Fetch growth procedure
      const procedure = await fetchFromSupabase(
        `/belarro_v4_growth_procedure?crop_id=eq.${cropId}&select=*`
      );

      // Fetch variants
      const variants = await fetchFromSupabase(
        `/belarro_v4_product_variant?crop_id=eq.${cropId}&deleted_at=is.null&select=*&order=size_grams.asc`
      );

      return NextResponse.json({
        success: true,
        data: {
          ...cropData,
          procedure: procedure[0] || null,
          variants: variants || [],
        },
      });
    }

    // Fetch all crops with their variants
    const [crops, variants] = await Promise.all([
      fetchFromSupabase(`/belarro_v4_crop?deleted_at=is.null&select=*&order=created_at.desc`),
      fetchFromSupabase(`/belarro_v4_product_variant?deleted_at=is.null&select=*`),
    ]);

    const cropsWithVariants = (crops || []).map((crop: Record<string, unknown>) => ({
      ...crop,
      variants: (variants || []).filter((v: Record<string, unknown>) => v.crop_id === crop.id),
    }));

    return NextResponse.json({
      success: true,
      data: cropsWithVariants,
    });
  } catch (error) {
    await logError('GET /api/crops', error, { status: 500 });
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
    const { name_en, name_de, flavor_en, flavor_de, status, photo_url, procedure, variants } = body;

    if (!name_en || !name_de) {
      return NextResponse.json(
        { success: false, error: 'name_en and name_de are required' },
        { status: 400 }
      );
    }

    // Generate UUIDs for all records
    const cropId = crypto.randomUUID();
    const procedureId = procedure ? crypto.randomUUID() : null;
    const variantIds: string[] = variants ? variants.map(() => crypto.randomUUID()) : [];

    // Create crop
    const crops = await fetchFromSupabase('/belarro_v4_crop', {
      method: 'POST',
      body: JSON.stringify({
        id: cropId,
        name_en,
        name_de,
        flavor_en: flavor_en || null,
        flavor_de: flavor_de || null,
        status: status || 'active',
        photo_url: photo_url || null,
      }),
    });

    const crop = crops[0];

    // Create growth procedure if provided
    if (procedure) {
      await fetchFromSupabase('/belarro_v4_growth_procedure', {
        method: 'POST',
        body: JSON.stringify({
          id: procedureId,
          crop_id: cropId,
          soak_enabled: procedure.soak_enabled || false,
          soak_hours: procedure.soak_enabled ? (procedure.soak_hours || null) : null,
          cover_soil_enabled: procedure.cover_soil_enabled || false,
          stack_enabled: procedure.stack_enabled || false,
          stack_days: procedure.stack_enabled ? (procedure.stack_days || null) : null,
          blackout_enabled: procedure.blackout_enabled || false,
          blackout_days: procedure.blackout_enabled ? (procedure.blackout_days || null) : null,
          humidity_dome_enabled: procedure.humidity_dome_enabled || false,
          humidity_dome_days: procedure.humidity_dome_enabled ? (procedure.humidity_dome_days || null) : null,
          light_enabled: procedure.light_enabled !== false,
          light_days: procedure.light_enabled !== false ? (procedure.light_days || null) : null,
        }),
      });
    }

    // Create variants if provided
    if (variants && Array.isArray(variants) && variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        if (variant.size_name && variant.size_grams) {
          await fetchFromSupabase('/belarro_v4_product_variant', {
            method: 'POST',
            body: JSON.stringify({
              id: variantIds[i],
              crop_id: cropId,
              size_name: variant.size_name,
              size_grams: variant.size_grams,
              price_eur: variant.price_eur || null,
              is_internal: variant.is_internal || false,
              container_size: variant.container_size || null,
              container_qty: variant.container_qty || 1,
            }),
          });
        }
      }
    }

    // Fetch full crop with relations
    const fullCrop = await fetchFromSupabase(
      `/belarro_v4_crop?id=eq.${cropId}&select=*`
    );

    const procedure_data = await fetchFromSupabase(
      `/belarro_v4_growth_procedure?crop_id=eq.${cropId}&select=*`
    );

    const variants_data = await fetchFromSupabase(
      `/belarro_v4_product_variant?crop_id=eq.${cropId}&deleted_at=is.null&select=*&order=size_grams.asc`
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          ...fullCrop[0],
          procedure: procedure_data[0] || null,
          variants: variants_data || [],
        },
      },
      { status: 201 }
    );
  } catch (error) {
    await logError('POST /api/crops', error, { status: 500 });
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
    const { id, name_en, name_de, flavor_en, flavor_de, status, photo_url, procedure, variants } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    // Update crop
    const updateData: any = {};
    if (name_en) updateData.name_en = name_en;
    if (name_de) updateData.name_de = name_de;
    if (flavor_en !== undefined) updateData.flavor_en = flavor_en;
    if (flavor_de !== undefined) updateData.flavor_de = flavor_de;
    if (status) updateData.status = status;
    if (photo_url !== undefined) updateData.photo_url = photo_url;

    await fetchFromSupabase(`/belarro_v4_crop?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });

    // Update growth procedure
    if (procedure) {
      const existing = await fetchFromSupabase(
        `/belarro_v4_growth_procedure?crop_id=eq.${id}&select=id`
      );

      const procData = {
        soak_enabled: procedure.soak_enabled || false,
        soak_hours: procedure.soak_enabled ? (procedure.soak_hours || null) : null,
        cover_soil_enabled: procedure.cover_soil_enabled || false,
        stack_enabled: procedure.stack_enabled || false,
        stack_days: procedure.stack_enabled ? (procedure.stack_days || null) : null,
        blackout_enabled: procedure.blackout_enabled || false,
        blackout_days: procedure.blackout_enabled ? (procedure.blackout_days || null) : null,
        humidity_dome_enabled: procedure.humidity_dome_enabled || false,
        humidity_dome_days: procedure.humidity_dome_enabled ? (procedure.humidity_dome_days || null) : null,
        light_enabled: procedure.light_enabled !== false,
        light_days: procedure.light_enabled !== false ? (procedure.light_days || null) : null,
      };

      if (existing && existing.length > 0) {
        await fetchFromSupabase(`/belarro_v4_growth_procedure?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify(procData),
        });
      } else {
        await fetchFromSupabase('/belarro_v4_growth_procedure', {
          method: 'POST',
          body: JSON.stringify({ crop_id: id, ...procData }),
        });
      }
    }

    // Update variants — only if explicitly sent in the request
    if (variants && Array.isArray(variants) && variants.length > 0) {
      // Fetch existing variants (including soft-deleted) to avoid unique constraint violations
      const existingVariants = await fetchFromSupabase(
        `/belarro_v4_product_variant?crop_id=eq.${id}&select=id,size_name,deleted_at`
      );
      const existingMap = new Map<string, string>(
        (existingVariants || []).map((v: any) => [v.size_name, v.id])
      );

      // Mark all current live variants as deleted first
      await fetchFromSupabase(`/belarro_v4_product_variant?crop_id=eq.${id}&deleted_at=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      });

      for (const variant of variants) {
        if (!variant.size_name || !variant.size_grams) continue;
        const existingId = existingMap.get(variant.size_name);
        if (existingId) {
          // Restore and update the existing record — avoids unique constraint
          await fetchFromSupabase(`/belarro_v4_product_variant?id=eq.${existingId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              size_grams: variant.size_grams,
              price_eur: variant.price_eur || null,
              is_internal: variant.is_internal || false,
              container_size: variant.container_size || null,
              container_qty: variant.container_qty || 1,
              deleted_at: null,
            }),
          });
        } else {
          await fetchFromSupabase('/belarro_v4_product_variant', {
            method: 'POST',
            body: JSON.stringify({
              id: crypto.randomUUID(),
              crop_id: id,
              size_name: variant.size_name,
              size_grams: variant.size_grams,
              price_eur: variant.price_eur || null,
              is_internal: variant.is_internal || false,
              container_size: variant.container_size || null,
              container_qty: variant.container_qty || 1,
            }),
          });
        }
      }
    }

    // Fetch updated crop
    const fullCrop = await fetchFromSupabase(
      `/belarro_v4_crop?id=eq.${id}&select=*`
    );

    const procedure_data = await fetchFromSupabase(
      `/belarro_v4_growth_procedure?crop_id=eq.${id}&select=*`
    );

    const variants_data = await fetchFromSupabase(
      `/belarro_v4_product_variant?crop_id=eq.${id}&deleted_at=is.null&select=*&order=size_grams.asc`
    );

    return NextResponse.json({
      success: true,
      data: {
        ...fullCrop[0],
        procedure: procedure_data[0] || null,
        variants: variants_data || [],
      },
    });
  } catch (error) {
    await logError('PUT /api/crops', error, { status: 500 });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // // auth handled by middleware
    // // if (!auth.ok) return auth.response;
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    // Soft delete
    await fetchFromSupabase(`/belarro_v4_crop?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    await logError('DELETE /api/crops', error, { status: 500 });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
