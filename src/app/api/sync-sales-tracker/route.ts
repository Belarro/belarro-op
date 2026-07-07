import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

// Shared secret guards this public endpoint (Apps Script can't log in).
const SYNC_SECRET = process.env.SALETRACKER_SYNC_SECRET || '';

const FOLLOW_UP_DAYS = [0, 3, 7, 14, 30];

export async function POST(request: NextRequest) {
  try {
    // --- Auth: shared secret (header preferred; body fallback for Apps Script simplicity) ---
    const headerSecret = request.headers.get('x-sync-secret');
    const body = await request.json();
    const providedSecret = headerSecret || body.secret;
    if (!SYNC_SECRET || providedSecret !== SYNC_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // --- Map Apps Script payload → customer fields ---
    const restaurantName = String(body.locationName || '').trim();
    const contactPerson = String(body.contactPerson || '').trim();
    const phone = String(body.directPhone || '').trim();
    const email = body.directEmail ? String(body.directEmail).trim() : null;
    const city = body.city ? String(body.city).trim() : 'Berlin';
    const address = body.address ? String(body.address).trim() : null;

    if (!restaurantName || !contactPerson || !phone) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: locationName, contactPerson, directPhone' },
        { status: 400 }
      );
    }

    // --- Idempotency: skip if a customer with this restaurant_name already exists ---
    const existing = await fetchFromSupabase(
      `/belarro_v4_customer?restaurant_name=eq.${encodeURIComponent(restaurantName)}&select=id&limit=1`
    );
    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        id: existing[0].id,
        message: 'Customer already exists — skipped duplicate sync.',
        duplicate: true,
      });
    }

    // --- Create customer (status active = closed deal) ---
    const customerId = crypto.randomUUID();
    const now = new Date().toISOString();
    const whatsapp = phone.replace(/[^0-9]/g, '');

    await fetchFromSupabase('/belarro_v4_customer', {
      method: 'POST',
      body: JSON.stringify({
        id: customerId,
        name: restaurantName,
        restaurant_name: restaurantName,
        contact_person: contactPerson,
        address,
        city,
        email,
        phone,
        whatsapp,
        status: 'active',
        net_days: 30,
        first_contact_date: now,
      }),
    });

    // NOTE: no follow-ups on closed deals. Per spec, becoming a client STOPS
    // the follow-up sequence — the sales tracker sets pipeline_stage
    // closed_won on the location, which the follow-ups page filters out.
    // (Previously this seeded 5 customer_id-based follow-ups that no page
    // could display.)

    return NextResponse.json({
      success: true,
      id: customerId,
      message: 'Customer created from closed deal.',
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
