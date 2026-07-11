import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchFromSupabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    // TODO: Re-enable auth once admin_users table is populated
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    // Fetch Belarro customers + SalesTracker locations in parallel
    const [customers, locations] = await Promise.all([
      fetchFromSupabase('/belarro_v4_customer?deleted_at=is.null&select=*&order=created_at.desc').catch(() => []),
      fetchFromSupabase('/locations?archived=neq.YES&select=id,location_name,contact_person,direct_phone,business_phone,direct_email,business_email,pipeline_stage,interest_level,visit_notes,sales_rep,timestamp,created_at&order=timestamp.desc.nullslast&limit=500').catch(() => []),
    ]);

    // Normalize belarro_v4_customer rows
    const customerRows = (customers || []).map((c: any) => ({
      id: c.id,
      _source: 'belarro',
      name: c.restaurant_name || c.name,
      contact_person: c.contact_person || null,
      contact_title: c.contact_title || null,
      email: c.email || null,
      phone: c.phone || null,
      whatsapp: c.whatsapp || null,
      address: c.address || null,
      city: c.city || null,
      status: c.status, // 'active' | 'prospect' | 'paused' | 'inactive'
      net_days: c.net_days || 30,
      tax_number: c.tax_number || null,
      interest_level: null,
      visit_notes: null,
      visited_at: null,
      first_contact_date: c.first_contact_date,
      created_at: c.created_at,
    }));

    // Phone numbers are stored inconsistently ("01605937534" vs
    // "+491605937534" for the same German number), so a raw string match
    // between belarro_v4_customer.phone and locations.direct_phone missed
    // real dupes. Compare by the last 10 digits instead, which is stable
    // across local-prefix ("0...") and country-code ("+49...") formats.
    const normPhone = (p: string | null | undefined): string => {
      if (!p) return '';
      const digits = p.replace(/\D/g, '');
      return digits.slice(-10);
    };

    // Build lookup maps for deduplication. st_location_id is an exact FK link
    // set when a belarro customer was created from (or merged with) a
    // saletracker location — checked first since it's unambiguous, unlike
    // phone/email which can coincidentally collide or fail to match.
    const belarroCustIds = new Set(customerRows.map((c: any) => c.id));
    const belarroLinkedLocationIds = new Set(
      (customers || []).map((c: any) => c.st_location_id).filter(Boolean)
    );
    const belarroPhones = new Set(
      (customers || [])
        .flatMap((c: any) => [normPhone(c.phone), normPhone(c.whatsapp)])
        .filter(Boolean)
    );
    const belarroEmails = new Set(
      customerRows
        .map((c: any) => c.email)
        .filter((e: any) => e && e.trim().toLowerCase())
        .map((e: any) => e.toLowerCase())
    );
    const belarroEmailDomains = new Set(
      customerRows
        .map((c: any) => c.email)
        .filter((e: any) => e && e.includes('@'))
        .map((e: any) => e.split('@')[1].toLowerCase())
    );

    // Normalize locations rows — map pipeline_stage to status
    const stageToStatus = (stage: string | null): string => {
      if (!stage) return 'prospect';
      if (stage === 'active') return 'active';
      if (stage === 'snoozed') return 'paused';
      return 'prospect'; // new_visit, follow_up_1..5, etc.
    };

    const locationRows = (locations || [])
      .filter((loc: any) => {
        // Skip if ID already exists, or a belarro customer already links to
        // this location explicitly (st_location_id)
        if (belarroCustIds.has(loc.id)) return false;
        if (belarroLinkedLocationIds.has(loc.id)) return false;

        // Skip if phone matches (normalized)
        const locPhone = normPhone(loc.direct_phone || loc.business_phone || '');
        if (locPhone && belarroPhones.has(locPhone)) return false;

        // Skip if email matches
        const locEmail = (loc.direct_email || loc.business_email || '').toLowerCase();
        if (locEmail && belarroEmails.has(locEmail)) return false;

        // Skip if email domain matches
        const locEmailDomain = locEmail.includes('@') ? locEmail.split('@')[1].toLowerCase() : '';
        if (locEmailDomain && belarroEmailDomains.has(locEmailDomain)) return false;

        return true;
      })
      .map((loc: any) => ({
        id: loc.id,
        _source: 'saletracker',
        name: loc.location_name,
        contact_person: loc.contact_person || null,
        contact_title: null,
        email: loc.direct_email || loc.business_email || null,
        phone: loc.direct_phone || loc.business_phone || null,
        whatsapp: null,
        address: null,
        city: null,
        status: stageToStatus(loc.pipeline_stage),
        net_days: 30,
        tax_number: null,
        interest_level: loc.interest_level || null,
        visit_notes: loc.visit_notes || null,
        sales_rep: loc.sales_rep || null,
        visited_at: loc.timestamp || null,
        first_contact_date: loc.timestamp || loc.created_at,
        created_at: loc.created_at,
      }));

    const all = [...customerRows, ...locationRows];

    return NextResponse.json({ success: true, data: all, _test_marker: 'CLAUDE_TEST_12345_DEPLOYMENT_WORKING' });
  } catch (error) {
    console.error('Customers GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // TODO: Re-enable auth once admin_users table is populated
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const body = await request.json();
    const {
      name,
      restaurant_name,
      contact_person,
      contact_title,
      tax_number,
      address,
      city,
      email,
      whatsapp,
      phone,
      net_days,
      status,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    const customerId = crypto.randomUUID();
    const firstContactDate = new Date().toISOString();

    // Create customer record
    const newCustomer = await fetchFromSupabase('/belarro_v4_customer', {
      method: 'POST',
      body: JSON.stringify({
        id: customerId,
        name,
        email: email || null,
        phone: phone || null,
        whatsapp: whatsapp || null,
        status: status || 'prospect',
      }),
    });

    // Auto-generate 5 follow-ups
    const followUpDays = [0, 3, 7, 14, 30];
    const followUps = [];
    
    for (let i = 0; i < followUpDays.length; i++) {
      const days = followUpDays[i];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      
      const followUpId = crypto.randomUUID();
      const newFollowup = await fetchFromSupabase('/belarro_v4_follow_up', {
        method: 'POST',
        body: JSON.stringify({
          id: followUpId,
          customer_id: customerId,
          follow_up_number: i + 1,
          follow_up_days: days,
          due_date: dueDate.toISOString(),
          status: 'pending',
          sent_via: null,
          sent_date: null,
          notes: null,
        }),
      });
      followUps.push(newFollowup);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...(newCustomer ? newCustomer[0] : { id: customerId, name }),
        follow_ups: followUps,
      },
      message: 'Customer created successfully with 5 auto-generated follow-ups',
    });
  } catch (error) {
    console.error('Customer POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
