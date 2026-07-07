import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    // Fetch all non-archived locations
    const locations = await fetchFromSupabase(
      '/locations?archived=neq.YES&select=*&order=created_at.desc&limit=500'
    );

    if (!locations || locations.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No locations to migrate',
        migrated: 0,
      });
    }

    const migratedCustomers = [];
    const skipped = [];
    const errors = [];

    // Migrate each location to customer
    for (const loc of locations) {
      try {
        // Check if customer already exists by phone or email
        let existing = null;

        if (loc.direct_phone || loc.business_phone) {
          const phone = loc.direct_phone || loc.business_phone;
          const result = await fetchFromSupabase(
            `/belarro_v4_customer?phone=eq.${encodeURIComponent(phone)}&select=id`
          ).catch(() => null);
          if (result && result.length > 0) {
            existing = result[0];
          }
        }

        if (!existing && (loc.direct_email || loc.business_email)) {
          const email = (loc.direct_email || loc.business_email).toLowerCase();
          const result = await fetchFromSupabase(
            `/belarro_v4_customer?email=eq.${encodeURIComponent(email)}&select=id`
          ).catch(() => null);
          if (result && result.length > 0) {
            existing = result[0];
          }
        }

        if (existing) {
          skipped.push({
            location_id: loc.id,
            reason: 'Already exists as customer',
          });
          continue;
        }

        // Map pipeline_stage to status
        const stageToStatus = (stage: string | null): string => {
          if (!stage) return 'prospect';
          if (stage === 'active') return 'active';
          if (stage === 'snoozed') return 'paused';
          return 'prospect';
        };

        // Create customer from location
        const customerId = loc.id; // Keep same ID for referential integrity
        const customerData = {
          id: customerId,
          name: loc.location_name || 'Unknown',
          restaurant_name: loc.location_name || 'Unknown',
          contact_person: loc.contact_person || null,
          contact_title: loc.contact_title || null,
          phone: loc.direct_phone || null,
          email: loc.direct_email || null,
          whatsapp: null,
          address: null,
          city: null,
          business_phone: loc.business_phone || null,
          business_email: loc.business_email || null,
          business_website: loc.business_website || null,
          business_types: loc.business_types || null,
          visit_notes: loc.visit_notes || null,
          interest_level: loc.interest_level || 'prospect',
          sales_rep: loc.sales_rep || null,
          language: loc.language || 'DE',
          notes_internal: loc.notes_internal || null,
          uses_microgreens: loc.uses_microgreens === 'YES' || false,
          status: stageToStatus(loc.pipeline_stage),
          st_location_id: customerId,
          source: 'saletracker',
          last_synced_at: new Date().toISOString(),
          created_at: loc.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const created = await fetchFromSupabase('/belarro_v4_customer', {
          method: 'POST',
          body: JSON.stringify(customerData),
        });

        migratedCustomers.push({
          location_id: loc.id,
          customer_id: customerId,
          name: loc.location_name,
        });

        // Update follow_up rows to reference customer_id
        if (loc.id) {
          try {
            await fetchFromSupabase(`/belarro_v4_follow_up?location_id=eq.${loc.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                customer_id: customerId,
              }),
            });
          } catch (err) {
            console.warn(`Could not update follow-ups for location ${loc.id}:`, err);
          }
        }
      } catch (err) {
        errors.push({
          location_id: loc.id,
          name: loc.location_name,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      migrated: migratedCustomers.length,
      skipped: skipped.length,
      errors: errors.length,
      details: {
        migrated: migratedCustomers,
        skipped,
        errors,
      },
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
