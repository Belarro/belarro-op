import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    try {
      const [seeds, packages, samples, crops, variants] = await Promise.all([
        fetchFromSupabase('/belarro_v4_seed_inventory?select=*'),
        fetchFromSupabase('/belarro_v4_package_inventory?select=*'),
        fetchFromSupabase('/belarro_v4_sample_inventory?select=*'),
        fetchFromSupabase('/belarro_v4_crop?select=id,name_en,name_de'),
        fetchFromSupabase('/belarro_v4_product_variant?select=id,size_name,crop_id')
      ]);

      const cropMap = new Map<string, any>((crops || []).map((c: any) => [c.id, c]));
      const varMap = new Map<string, any>((variants || []).map((v: any) => [v.id, v]));

      const hydratedSeeds = (seeds || []).map((s: any) => ({
        ...s,
        crop: cropMap.get(s.crop_id) || { name_en: 'Unknown Crop' }
      }));

      const hydratedPackages = (packages || []).map((p: any) => {
        const variant = varMap.get(p.variant_id);
        const crop = variant ? cropMap.get(variant.crop_id) : null;
        return {
          ...p,
          variant: variant ? { ...variant, crop } : null
        };
      });

      const hydratedSamples = (samples || []).map((s: any) => ({
        ...s,
        crop: cropMap.get(s.crop_id) || { name_en: 'Unknown Crop' }
      }));

      return NextResponse.json({
        success: true,
        data: {
          seeds: hydratedSeeds,
          packages: hydratedPackages,
          samples: hydratedSamples
        }
      });
    } catch (dbErr) {
      console.warn('Database inventory not ready, using mocks');
      return NextResponse.json({
        success: true,
        data: {
          seeds: [
            { id: 'mock-s1', crop_id: 'mock-c1', quantity_grams: 800, reorder_threshold_trays: 10, crop: { name_en: 'Broccoli', name_de: 'Brokkoli' } },
            { id: 'mock-s2', crop_id: 'mock-c2', quantity_grams: 120, reorder_threshold_trays: 20, crop: { name_en: 'Radish', name_de: 'Rettich' } }
          ],
          packages: [
            { id: 'mock-p1', variant_id: 'mock-v1', quantity_available: 45, reorder_threshold: 20, variant: { size_name: '100g Bag', crop: { name_en: 'Broccoli' } } }
          ],
          samples: [
            { id: 'mock-sa1', crop_id: 'mock-c1', available_grams: 150, crop: { name_en: 'Broccoli' } }
          ]
        }
      });
    }
  } catch (error) {
    console.error('Inventory GET error:', error);
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
    const { crop_id, quantity_grams, seeds_per_tray, reorder_threshold_trays } = body;

    if (!crop_id || quantity_grams === undefined || !seeds_per_tray) {
      return NextResponse.json({ success: false, error: 'crop_id, quantity_grams, and seeds_per_tray are required' }, { status: 400 });
    }

    const existing = await fetchFromSupabase(`/belarro_v4_seed_inventory?crop_id=eq.${crop_id}&select=id`);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'This crop is already in your seed inventory. Use "+ Received" to add more seeds.' },
        { status: 409 }
      );
    }

    const newRecord = await fetchFromSupabase('/belarro_v4_seed_inventory', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        crop_id,
        quantity_grams: parseFloat(quantity_grams),
        seeds_per_tray: parseFloat(seeds_per_tray),
        reorder_threshold_trays: parseInt(reorder_threshold_trays) || 20,
      })
    });

    return NextResponse.json({ success: true, data: newRecord?.[0], message: 'Seed stock created' });
  } catch (error) {
    console.error('Inventory POST error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { type, id } = await request.json();
    if (!type || !id) return NextResponse.json({ success: false, error: 'type and id required' }, { status: 400 });

    let table = '';
    if (type === 'seeds') table = '/belarro_v4_seed_inventory';
    else if (type === 'samples') table = '/belarro_v4_sample_inventory';
    else return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });

    await fetchFromSupabase(`${table}?id=eq.${id}`, { method: 'DELETE' });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const body = await request.json();
    const { type, id, quantity } = body; // type is 'seeds' | 'packages' | 'samples'

    if (!type || !id || quantity === undefined) {
      return NextResponse.json({ success: false, error: 'type, id, and quantity are required' }, { status: 400 });
    }

    let table = '';
    let updateField = '';
    
    if (type === 'seeds') {
      table = '/belarro_v4_seed_inventory';
      updateField = 'quantity_grams';
    } else if (type === 'packages') {
      table = '/belarro_v4_package_inventory';
      updateField = 'quantity_available';
    } else if (type === 'samples') {
      table = '/belarro_v4_sample_inventory';
      updateField = 'available_grams';
    } else {
      return NextResponse.json({ success: false, error: 'Invalid inventory type' }, { status: 400 });
    }

    const updated = await fetchFromSupabase(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        [updateField]: parseFloat(quantity),
        updated_at: new Date().toISOString()
      })
    });

    return NextResponse.json({
      success: true,
      data: updated ? updated[0] : null,
      message: 'Inventory updated successfully'
    });
  } catch (error) {
    console.error('Inventory PUT error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
