import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data: crops, error } = await supabase
      .from('belarro_v4_crop')
      .select(
        'id, name_en, name_de, flavor_en, flavor_de, photo_url, is_mix, category, sort_order, tags, belarro_v4_product_variant(size_name, size_grams, price_eur, is_internal, deleted_at), belarro_v4_growth_procedure(stack_enabled, stack_days, blackout_enabled, blackout_days, light_enabled, light_days)'
      )
      .is('deleted_at', null)
      .eq('status', 'active');

    if (error) {
      console.error('[products/public] Supabase error:', error);
      return Response.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    const products = (crops || [])
      .map((crop: any) => {
        const sizes = (crop.belarro_v4_product_variant || [])
          .filter((v: any) => !v.is_internal && v.price_eur != null && !v.deleted_at)
          .sort((a: any, b: any) => (a.size_grams || 0) - (b.size_grams || 0))
          .map((v: any) => ({
            label: v.size_name,
            price: v.price_eur,
            grams: v.size_grams,
          }));

        const procedure = Array.isArray(crop.belarro_v4_growth_procedure)
          ? crop.belarro_v4_growth_procedure[0]
          : crop.belarro_v4_growth_procedure;

        let growDays = 0;
        if (procedure?.stack_enabled && procedure?.stack_days)
          growDays += procedure.stack_days;
        if (procedure?.blackout_enabled && procedure?.blackout_days)
          growDays += procedure.blackout_days;
        if (procedure?.light_enabled && procedure?.light_days)
          growDays += procedure.light_days;

        return {
          id: crop.id,
          name: crop.name_en,
          name_de: crop.name_de,
          flavor_en: crop.flavor_en || '',
          flavor_de: crop.flavor_de || '',
          photo: crop.photo_url || '',
          category: crop.category || (crop.is_mix ? 'mix' : 'microgreen'),
          sort_order: crop.sort_order != null ? crop.sort_order : 999,
          sizes,
          growDays: growDays || null,
          tags: crop.tags || [],
        };
      })
      .filter((p: any) => p.sizes.length > 0)
      .sort(
        (a: any, b: any) =>
          a.sort_order - b.sort_order ||
          a.name.localeCompare(b.name)
      );

    return Response.json({ success: true, data: products });
  } catch (err) {
    console.error('[products/public]', err);
    return Response.json(
      { error: 'Failed to load products' },
      { status: 500 }
    );
  }
}
