import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
// import removed

interface ImportRow {
  restaurant_name: string;
  address: string;
  contact_person: string;
  contact_title: string;
  phone: string;
  email: string;
  business_type: string;
  interest_level: string;
  visit_notes: string;
  visited_at: string;
  whatsapp: string;
  language: string;
  sample_given: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const { rows }: { rows: ImportRow[] } = await request.json();
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 });
    }

    let success = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        if (!row.restaurant_name) { skipped++; continue; }

        // Check if already exists by restaurant name
        const existing = await fetchFromSupabase(
          `/belarro_v4_customer?restaurant_name=eq.${encodeURIComponent(row.restaurant_name)}&select=id&limit=1`
        );
        if (existing && existing.length > 0) { skipped++; continue; }

        // Parse date — handle formats like "29-10-2025 14:25", "29/10/2025", ISO, etc.
        let visitDate = new Date().toISOString();
        if (row.visited_at) {
          // Try swapping DD-MM-YYYY or DD/MM/YYYY to YYYY-MM-DD
          const cleaned = row.visited_at.trim()
            .replace(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/, '$3-$2-$1')
            .replace(' ', 'T');
          const parsed = new Date(cleaned);
          if (!isNaN(parsed.getTime())) {
            visitDate = parsed.toISOString();
          }
        }
        const customerId = crypto.randomUUID();

        // Create customer as lead — only columns that exist in belarro_v4_customer
        await fetchFromSupabase('/belarro_v4_customer', {
          method: 'POST',
          body: JSON.stringify({
            id: customerId,
            name: row.contact_person || row.restaurant_name,
            restaurant_name: row.restaurant_name,
            contact_person: row.contact_person || null,
            phone: row.phone || null,
            whatsapp: row.whatsapp || row.phone || null,
            email: row.email || null,
            address: row.address || null,
            status: 'lead',
            first_contact_date: visitDate,
            created_at: visitDate,
          }),
        });

        // Manually create follow-up sequence (trigger may not fire via API)
        const base = new Date(visitDate).getTime();
        const stages = [
          { stage: 1, follow_up_number: 1, follow_up_days: 0, offset: 2 * 60 * 60 * 1000 },
          { stage: 2, follow_up_number: 2, follow_up_days: 2, offset: 2 * 24 * 60 * 60 * 1000 },
          { stage: 3, follow_up_number: 3, follow_up_days: 5, offset: 5 * 24 * 60 * 60 * 1000 },
          { stage: 4, follow_up_number: 4, follow_up_days: 14, offset: 14 * 24 * 60 * 60 * 1000 },
          { stage: 5, follow_up_number: 5, follow_up_days: 30, offset: 30 * 24 * 60 * 60 * 1000 },
        ];

        for (const s of stages) {
          await fetchFromSupabase('/belarro_v4_follow_up', {
            method: 'POST',
            body: JSON.stringify({
              id: crypto.randomUUID(),
              customer_id: customerId,
              follow_up_number: s.follow_up_number,
              follow_up_days: s.follow_up_days,
              stage: s.stage,
              due_date: new Date(base + s.offset).toISOString(),
              status: 'pending',
            }),
          });
        }

        success++;
      } catch (err) {
        errors.push(`${row.restaurant_name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      result: { success, skipped, errors },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
