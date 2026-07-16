/**
 * @jest-environment node
 *
 * Regression tests for the field visit save flow — the exact bug class from
 * July 16: re-visiting a place must land on the SAME location row (matched by
 * place_id), never fork a duplicate with its own contact/email fields, and an
 * update must never blank out fields the form didn't send.
 */
import { POST, PATCH } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase', () => ({
  fetchFromSupabase: jest.fn(),
}));
jest.mock('@/lib/followups', () => ({
  seedFollowUpsForLocation: jest.fn().mockResolvedValue({ created: true }),
}));

import { fetchFromSupabase } from '@/lib/supabase';
import { seedFollowUpsForLocation } from '@/lib/followups';

const mockFetch = fetchFromSupabase as jest.Mock;
const mockSeed = seedFollowUpsForLocation as jest.Mock;

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/field/locations', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/field/locations', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// Collect calls made against a given path prefix, split by method.
function callsTo(pathPrefix: string, method?: string) {
  return mockFetch.mock.calls.filter(([path, opts]: [string, RequestInit?]) => {
    const m = (opts?.method || 'GET').toUpperCase();
    return path.startsWith(pathPrefix) && (!method || m === method.toUpperCase());
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSeed.mockClear();
});

describe('POST /api/field/locations — new place with place_id', () => {
  it('re-visiting a place matched by place_id UPDATES the existing row instead of creating a duplicate', async () => {
    mockFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      // place_id lookup finds the existing row
      if (path.startsWith('/locations?direct_link=ilike')) return [{ id: 'loc-existing-1' }];
      if (path.startsWith('/belarro_op_visit') && opts?.method === 'POST') return [{ id: 'visit-1' }];
      return null; // PATCH returns representation; null is fine for the handler
    });

    const res = await POST(postRequest({
      location_name: 'Ristorante Test',
      business_address: 'Teststr. 1, Berlin',   // slightly different formatting than stored
      place_id: 'GOOGLE_PLACE_ABC',
      direct_email: 'new-email@example.com',
      notes: 'second conversation',
    }));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.location_id).toBe('loc-existing-1');

    // Must NOT insert a new locations row
    expect(callsTo('/locations', 'POST')).toHaveLength(0);

    // Must PATCH the existing row with the new email
    const patches = callsTo('/locations?id=eq.loc-existing-1', 'PATCH');
    expect(patches).toHaveLength(1);
    const patchBody = JSON.parse(patches[0][1].body);
    expect(patchBody.direct_email).toBe('new-email@example.com');

    // Still logs the visit against the SAME location
    const visitInserts = callsTo('/belarro_op_visit', 'POST');
    expect(visitInserts).toHaveLength(1);
    expect(JSON.parse(visitInserts[0][1].body).location_id).toBe('loc-existing-1');

    // Existing places must not get a fresh follow-up drip seeded
    expect(mockSeed).not.toHaveBeenCalled();
  });

  it('place_id lookup runs BEFORE the name/address fallback', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/locations?direct_link=ilike')) return [{ id: 'loc-by-placeid' }];
      if (path.startsWith('/locations?location_name=eq.')) {
        throw new Error('name/address fallback must not run when place_id matched');
      }
      return [{ id: 'x' }];
    });

    const res = await POST(postRequest({
      location_name: 'Anything',
      business_address: 'Anywhere 1',
      place_id: 'GOOGLE_PLACE_ABC',
      notes: '',
    }));
    const json = await res.json();
    expect(json.data.location_id).toBe('loc-by-placeid');
  });

  it('falls back to exact name+address match when place_id finds nothing', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/locations?direct_link=ilike')) return [];
      if (path.startsWith('/locations?location_name=eq.')) return [{ id: 'loc-by-name' }];
      return [{ id: 'x' }];
    });

    const res = await POST(postRequest({
      location_name: 'Cafe Exact',
      business_address: 'Exactstr. 2, Berlin',
      place_id: 'UNKNOWN_PLACE',
      notes: '',
    }));
    const json = await res.json();
    expect(json.data.location_id).toBe('loc-by-name');
    expect(callsTo('/locations', 'POST')).toHaveLength(0);
  });

  it('creates the location and seeds follow-ups when nothing matches (genuinely new place)', async () => {
    mockFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      if (path.startsWith('/locations?direct_link=ilike')) return [];
      if (path.startsWith('/locations?location_name=eq.')) return [];
      if (path === '/locations' && opts?.method === 'POST') return [{ id: 'loc-new-1' }];
      return [{ id: 'v' }];
    });

    const res = await POST(postRequest({
      location_name: 'Brand New Bistro',
      business_address: 'Neue Str. 3, Berlin',
      place_id: 'FRESH_PLACE',
      direct_email: 'chef@newbistro.de',
      notes: 'first visit',
      lat: 52.5, lng: 13.4,
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.location_id).toBe('loc-new-1');
    expect(callsTo('/locations', 'POST')).toHaveLength(1);
    expect(mockSeed).toHaveBeenCalledWith('loc-new-1', expect.any(String));
  });

  it('rejects a new place without a name', async () => {
    const res = await POST(postRequest({ notes: 'no name given' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/field/locations — updating an existing location', () => {
  it('omitting a field in the form must NOT blank it in the database', async () => {
    mockFetch.mockImplementation(async () => [{ id: 'v' }]);

    await POST(postRequest({
      location_id: 'loc-77',
      notes: 'quick note added',
      // no direct_email, no contact_person, no direct_phone sent
    }));

    const patches = callsTo('/locations?id=eq.loc-77', 'PATCH');
    expect(patches).toHaveLength(1);
    const body = JSON.parse(patches[0][1].body);
    expect(body).not.toHaveProperty('direct_email');
    expect(body).not.toHaveProperty('contact_person');
    expect(body).not.toHaveProperty('direct_phone');
    expect(body.visit_notes).toBe('quick note added');
  });

  it('a fresh visit un-archives the place', async () => {
    mockFetch.mockImplementation(async () => [{ id: 'v' }]);
    await POST(postRequest({ location_id: 'loc-88', notes: '' }));
    const body = JSON.parse(callsTo('/locations?id=eq.loc-88', 'PATCH')[0][1].body);
    expect(body.archived).toBe('NO');
  });
});

describe('PATCH /api/field/locations — quick-send pipeline advance', () => {
  it('append_log_entry appends to notes_internal and bumps follow_up_count', async () => {
    mockFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      if (path.includes('select=notes_internal')) {
        return [{ notes_internal: '[old] line one', follow_up_count: '2' }];
      }
      return null;
    });

    const res = await PATCH(patchRequest({
      id: 'loc-99',
      pipeline_stage: 'follow_up_2',
      append_log_entry: '[2026-07-16] follow up 1 sent',
    }));
    expect((await res.json()).success).toBe(true);

    const patches = callsTo('/locations?id=eq.loc-99', 'PATCH');
    expect(patches).toHaveLength(1);
    const body = JSON.parse(patches[0][1].body);
    expect(body.notes_internal).toBe('[old] line one\n[2026-07-16] follow up 1 sent');
    expect(body.follow_up_count).toBe('3');
    expect(body.pipeline_stage).toBe('follow_up_2');
  });

  it('requires an id', async () => {
    const res = await PATCH(patchRequest({ archived: 'YES' }));
    expect(res.status).toBe(400);
  });
});
