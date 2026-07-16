/**
 * @jest-environment node
 *
 * Follow-up lifecycle — marking a stage sent must advance the next stage's
 * due date exactly once (double-click / retry safe), and the delete flow must
 * stay soft (data protection mandate: never hard-delete leads).
 */
import { PUT, DELETE } from '../[id]/route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase', () => ({
  fetchFromSupabase: jest.fn(),
}));

import { fetchFromSupabase } from '@/lib/supabase';
const mockFetch = fetchFromSupabase as jest.Mock;

function putRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/follow-ups/fu-1', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const params = { params: Promise.resolve({ id: 'fu-1' }) };

function callsTo(pathPrefix: string, method?: string) {
  return mockFetch.mock.calls.filter(([path, opts]: [string, RequestInit?]) => {
    const m = (opts?.method || 'GET').toUpperCase();
    return path.startsWith(pathPrefix) && (!method || m === method.toUpperCase());
  });
}

beforeEach(() => mockFetch.mockReset());

describe('PUT /api/follow-ups/[id]', () => {
  it('requires a status', async () => {
    const res = await PUT(putRequest({}), params);
    expect(res.status).toBe(400);
  });

  it('status=pending only records the channel — no stage advance', async () => {
    mockFetch.mockResolvedValue(null);
    const res = await PUT(putRequest({ status: 'pending', sent_via: 'email' }), params);
    expect((await res.json()).success).toBe(true);

    const patches = callsTo('/belarro_v4_follow_up?id=eq.fu-1', 'PATCH');
    expect(patches).toHaveLength(1);
    expect(JSON.parse(patches[0][1].body).sent_via).toBe('email');
    // No lookups of the next stage at all
    expect(callsTo('/belarro_v4_follow_up?location_id=')).toHaveLength(0);
  });

  it('completing a stage reschedules the next pending stage from the actual send time', async () => {
    mockFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') return null;
      if (path.includes('&select=status')) return [{ status: 'pending' }];
      if (path === '/belarro_v4_follow_up?id=eq.fu-1&select=*') {
        return [{ id: 'fu-1', location_id: 'loc-5', stage: 1 }];
      }
      if (path.includes('location_id=eq.loc-5&stage=eq.2')) {
        return [{ id: 'fu-2', stage: 2, follow_up_days: 2 }];
      }
      if (path.includes('/locations?id=eq.loc-5')) {
        return [{ timestamp: new Date().toISOString(), created_at: null }];
      }
      return [];
    });

    const res = await PUT(putRequest({ status: 'completed', sent_via: 'whatsapp' }), params);
    expect((await res.json()).success).toBe(true);

    // This stage marked completed with a sent_date
    const selfPatch = JSON.parse(callsTo('/belarro_v4_follow_up?id=eq.fu-1', 'PATCH')[0][1].body);
    expect(selfPatch.status).toBe('completed');
    expect(selfPatch.sent_date).toBeTruthy();

    // Next stage got a fresh due_date in the future
    const nextPatches = callsTo('/belarro_v4_follow_up?id=eq.fu-2', 'PATCH');
    expect(nextPatches).toHaveLength(1);
    const nextDue = new Date(JSON.parse(nextPatches[0][1].body).due_date).getTime();
    expect(nextDue).toBeGreaterThan(Date.now());
  });

  it('re-completing an already-completed stage does NOT re-advance the next stage (idempotency guard)', async () => {
    mockFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') return null;
      if (path.includes('&select=status')) return [{ status: 'completed' }]; // already done
      return [];
    });

    const res = await PUT(putRequest({ status: 'completed', sent_via: 'email' }), params);
    expect((await res.json()).success).toBe(true);

    // No next-stage lookup, no next-stage reschedule
    expect(callsTo('/belarro_v4_follow_up?location_id=')).toHaveLength(0);
  });
});

describe('DELETE /api/follow-ups/[id] — data protection', () => {
  it('soft-deletes: marks follow-ups skipped and archives the location, never a real DELETE', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (path.includes('select=location_id')) return [{ location_id: 'loc-9' }];
      return null;
    });

    const req = new NextRequest('http://localhost/api/follow-ups/fu-1', { method: 'DELETE' });
    const res = await DELETE(req, params);
    expect((await res.json()).success).toBe(true);

    // Every write was a PATCH — zero hard deletes anywhere
    const hardDeletes = mockFetch.mock.calls.filter(
      ([, opts]: [string, RequestInit?]) => opts?.method === 'DELETE'
    );
    expect(hardDeletes).toHaveLength(0);

    const fuPatch = JSON.parse(callsTo('/belarro_v4_follow_up?location_id=eq.loc-9', 'PATCH')[0][1].body);
    expect(fuPatch.status).toBe('skipped');
    const locPatch = JSON.parse(callsTo('/locations?id=eq.loc-9', 'PATCH')[0][1].body);
    expect(locPatch.archived).toBe('YES');
  });
});
