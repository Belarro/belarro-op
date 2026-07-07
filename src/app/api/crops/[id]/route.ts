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

    // Fetch single crop with relations
    const crop = await fetchFromSupabase(`/belarro_v4_crop?id=eq.${id}&select=*`);

    if (!crop || crop.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Crop not found' },
        { status: 404 }
      );
    }

    const cropData = crop[0];

    const [procedure, variants, mixComponents] = await Promise.all([
      fetchFromSupabase(`/belarro_v4_growth_procedure?crop_id=eq.${id}&select=*`),
      fetchFromSupabase(`/belarro_v4_product_variant?crop_id=eq.${id}&deleted_at=is.null&select=*&order=size_grams.asc`),
      fetchFromSupabase(`/belarro_v4_crop_mix_component?mix_crop_id=eq.${id}&select=*`),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...cropData,
        procedure: procedure[0] || null,
        variants: variants || [],
        mix_components: mixComponents || [],
      },
    });
  } catch (error) {
    await logError('GET /api/crops/[id]', error, { status: 500 });
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

    let body: any;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    const { name_en, name_de, flavor_en, flavor_de, status, photo_url, seeds_per_tray_grams, yield_per_tray_grams, is_mix, mix_components, procedure, variants } = body;

    // Update crop
    const updateData: any = {};
    if (name_en) updateData.name_en = name_en;
    if (name_de) updateData.name_de = name_de;
    if (flavor_en !== undefined) updateData.flavor_en = flavor_en;
    if (flavor_de !== undefined) updateData.flavor_de = flavor_de;
    if (status) updateData.status = status;
    if (photo_url !== undefined) updateData.photo_url = photo_url;
    if (seeds_per_tray_grams !== undefined) updateData.seeds_per_tray_grams = seeds_per_tray_grams;
    if (yield_per_tray_grams !== undefined) updateData.yield_per_tray_grams = yield_per_tray_grams;
    if (is_mix !== undefined) updateData.is_mix = is_mix;
    updateData.updated_at = new Date().toISOString();

    try {
      await fetchFromSupabase(`/belarro_v4_crop?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });
    } catch (err) {
      console.error('Error updating crop:', err);
      throw err;
    }

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
          body: JSON.stringify({ ...procData, updated_at: new Date().toISOString() }),
        });
      } else {
        await fetchFromSupabase('/belarro_v4_growth_procedure', {
          method: 'POST',
          body: JSON.stringify({
            id: crypto.randomUUID(),
            crop_id: id,
            ...procData,
          }),
        });
      }
    }

    // Update variants — restore existing by size_name to avoid unique constraint
    if (variants && Array.isArray(variants) && variants.length > 0) {
      const existingVariants = await fetchFromSupabase(
        `/belarro_v4_product_variant?crop_id=eq.${id}&select=id,size_name`
      );
      const existingMap = new Map<string, string>(
        (existingVariants || []).map((v: any) => [v.size_name, v.id])
      );

      await fetchFromSupabase(`/belarro_v4_product_variant?crop_id=eq.${id}&deleted_at=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      });

      for (const variant of variants) {
        if (!variant.size_name || !variant.size_grams) continue;
        const existingId = existingMap.get(variant.size_name);
        if (existingId) {
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

    // Save mix components (replace all)
    if (is_mix && Array.isArray(mix_components)) {
      await fetchFromSupabase(`/belarro_v4_crop_mix_component?mix_crop_id=eq.${id}`, {
        method: 'DELETE',
      });
      for (const comp of mix_components) {
        if (!comp.component_crop_id || !comp.percentage) continue;
        await fetchFromSupabase('/belarro_v4_crop_mix_component', {
          method: 'POST',
          body: JSON.stringify({
            id: crypto.randomUUID(),
            mix_crop_id: id,
            component_crop_id: comp.component_crop_id,
            percentage: parseFloat(comp.percentage),
          }),
        });
      }
    }

    // Fetch updated crop
    const [fullCrop, procedure_data, variants_data, mix_components_data] = await Promise.all([
      fetchFromSupabase(`/belarro_v4_crop?id=eq.${id}&select=*`),
      fetchFromSupabase(`/belarro_v4_growth_procedure?crop_id=eq.${id}&select=*`),
      fetchFromSupabase(`/belarro_v4_product_variant?crop_id=eq.${id}&deleted_at=is.null&select=*&order=size_grams.asc`),
      fetchFromSupabase(`/belarro_v4_crop_mix_component?mix_crop_id=eq.${id}&select=*`),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...fullCrop[0],
        procedure: procedure_data[0] || null,
        variants: variants_data || [],
        mix_components: mix_components_data || [],
      },
    });
  } catch (error) {
    await logError('PUT /api/crops/[id]', error, { status: 500 });
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

    // Soft delete
    await fetchFromSupabase(`/belarro_v4_crop?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    await logError('DELETE /api/crops/[id]', error, { status: 500 });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
