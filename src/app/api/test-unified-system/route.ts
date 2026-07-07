import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const results = {
    test_1_duplicate_via_web: { passed: false, details: '' },
    test_2_update_via_phone: { passed: false, details: '' },
    test_3_restaurant_pasternak_dedup: { passed: false, details: '' },
    test_4_idempotent_sync: { passed: false, details: '' },
  };

  try {
    // TEST 1: Add same customer twice via web, verify no duplicate
    console.log('TEST 1: Duplicate via web...');
    const testName1 = `Test Dup ${Date.now()}`;
    const testPhone1 = `+49999${Math.random().toString().slice(2, 7)}`;

    // First creation
    const cust1Res = await fetch('https://admin-staging-mu.vercel.app/api/sync-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationName: testName1,
        contactPerson: 'Test Person',
        directPhone: testPhone1,
        directEmail: `test1@${Date.now()}.de`,
        salesRep: 'Ron',
      }),
    });
    const cust1 = await cust1Res.json();

    // Second creation with same phone
    const cust2Res = await fetch('https://admin-staging-mu.vercel.app/api/sync-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationName: testName1,
        contactPerson: 'Test Person Updated',
        directPhone: testPhone1,
        directEmail: `test1@${Date.now()}.de`,
        salesRep: 'Ron',
      }),
    });
    const cust2 = await cust2Res.json();

    if (cust1.success && cust2.success && cust1.id === cust2.id) {
      results.test_1_duplicate_via_web = {
        passed: true,
        details: `✓ Same customer returned same ID. First: ${cust1.id}, Second: ${cust2.id}`,
      };
    } else {
      results.test_1_duplicate_via_web = {
        passed: false,
        details: `✗ Different IDs: ${cust1.id} vs ${cust2.id}`,
      };
    }

    // TEST 2: Add via sync-prospect, then update with same phone
    console.log('TEST 2: Update via phone...');
    const testPhone2 = `+49888${Math.random().toString().slice(2, 7)}`;

    const cust3Res = await fetch('https://admin-staging-mu.vercel.app/api/sync-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationName: 'Test Phone Update',
        contactPerson: 'Original',
        directPhone: testPhone2,
        directEmail: `test2@${Date.now()}.de`,
      }),
    });
    const cust3 = await cust3Res.json();

    const cust4Res = await fetch('https://admin-staging-mu.vercel.app/api/sync-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationName: 'Test Phone Update',
        contactPerson: 'Updated Contact',
        directPhone: testPhone2,
        directEmail: `test2@${Date.now()}.de`,
      }),
    });
    const cust4 = await cust4Res.json();

    if (cust3.success && cust4.success && cust3.id === cust4.id && !cust4.isNew) {
      results.test_2_update_via_phone = {
        passed: true,
        details: `✓ Update detected, isNew=false. ID: ${cust4.id}`,
      };
    } else {
      results.test_2_update_via_phone = {
        passed: false,
        details: `✗ isNew=${cust4.isNew}, IDs: ${cust3.id} vs ${cust4.id}`,
      };
    }

    // TEST 3: Check Restaurant Pasternak is not duplicated
    console.log('TEST 3: Restaurant Pasternak dedup...');
    const allCustomers = await fetchFromSupabase(
      '/belarro_v4_customer?name=ilike.%Pasternak%&select=id,name'
    );
    const pasternak = (allCustomers || []).filter((c: any) =>
      c.name?.toLowerCase().includes('pasternak')
    );

    if (pasternak.length === 1) {
      results.test_3_restaurant_pasternak_dedup = {
        passed: true,
        details: `✓ Single Pasternak record found: ${pasternak[0].name}`,
      };
    } else if (pasternak.length === 0) {
      results.test_3_restaurant_pasternak_dedup = {
        passed: true,
        details: '✓ No Pasternak (already cleaned)',
      };
    } else {
      results.test_3_restaurant_pasternak_dedup = {
        passed: false,
        details: `✗ ${pasternak.length} Pasternak records found`,
      };
    }

    // TEST 4: Idempotent sync — call sync-prospect 3x, verify 1 follow-up set
    console.log('TEST 4: Idempotent sync...');
    const testPhone4 = `+49777${Math.random().toString().slice(2, 7)}`;

    const syncRes = await fetch('https://admin-staging-mu.vercel.app/api/sync-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationName: 'Idempotent Test',
        contactPerson: 'Idempotent',
        directPhone: testPhone4,
        directEmail: `idempotent@${Date.now()}.de`,
      }),
    });
    const syncCust = await syncRes.json();

    // Call 2 more times with same data
    await fetch('https://admin-staging-mu.vercel.app/api/sync-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationName: 'Idempotent Test',
        contactPerson: 'Idempotent',
        directPhone: testPhone4,
        directEmail: `idempotent@${Date.now()}.de`,
      }),
    });

    await fetch('https://admin-staging-mu.vercel.app/api/sync-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationName: 'Idempotent Test',
        contactPerson: 'Idempotent',
        directPhone: testPhone4,
        directEmail: `idempotent@${Date.now()}.de`,
      }),
    });

    // Check follow-ups count
    const followups = await fetchFromSupabase(
      `/belarro_v4_follow_up?customer_id=eq.${syncCust.id}&select=id`
    );

    if (followups && followups.length === 5) {
      // Should be exactly 5 (Days 0, 3, 7, 14, 30)
      results.test_4_idempotent_sync = {
        passed: true,
        details: `✓ Exactly 5 follow-ups created (no duplicates)`,
      };
    } else {
      results.test_4_idempotent_sync = {
        passed: false,
        details: `✗ ${followups?.length || 0} follow-ups instead of 5`,
      };
    }
  } catch (error) {
    console.error('Test error:', error);
  }

  const allPassed = Object.values(results).every((r) => r.passed);

  return NextResponse.json({
    success: allPassed,
    summary: {
      passed: Object.values(results).filter((r) => r.passed).length,
      total: Object.keys(results).length,
    },
    results,
  });
}
