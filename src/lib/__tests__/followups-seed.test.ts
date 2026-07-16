/**
 * @jest-environment node
 *
 * Follow-up drip seeding — every new place logged from the field must get its
 * drip scheduled exactly once (idempotent), with the right flow for its age.
 */
jest.mock('@/lib/supabase', () => ({
  fetchFromSupabase: jest.fn(),
}));

import { seedFollowUpsForLocation } from '../followups';
import { fetchFromSupabase } from '@/lib/supabase';

const mockFetch = fetchFromSupabase as jest.Mock;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function insertedStages() {
  return mockFetch.mock.calls
    .filter(([path, opts]: [string, RequestInit?]) =>
      path === '/belarro_v4_follow_up' && opts?.method === 'POST')
    .map(([, opts]: [string, RequestInit]) => JSON.parse(opts.body as string));
}

beforeEach(() => mockFetch.mockReset());

describe('seedFollowUpsForLocation', () => {
  it('is idempotent — does nothing when pending follow-ups already exist', async () => {
    mockFetch.mockResolvedValueOnce([{ id: 'existing-fu' }]);
    const result = await seedFollowUpsForLocation('loc-1');
    expect(result.created).toBe(false);
    expect(insertedStages()).toHaveLength(0);
  });

  it('seeds the 5-stage new-lead flow for a fresh visit', async () => {
    mockFetch.mockResolvedValue([]);
    const result = await seedFollowUpsForLocation('loc-2', new Date().toISOString());
    expect(result.created).toBe(true);

    const rows = insertedStages();
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.stage)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.every(r => r.location_id === 'loc-2')).toBe(true);
    expect(rows.every(r => r.status === 'pending')).toBe(true);
    // Stage 1 lands ~2h after the visit, not days later
    const firstDue = new Date(rows[0].due_date).getTime();
    expect(firstDue - Date.now()).toBeLessThan(3 * 60 * 60 * 1000);
  });

  it('seeds the 4-stage re-engage flow for a lead older than 40 days', async () => {
    mockFetch.mockResolvedValue([]);
    await seedFollowUpsForLocation('loc-3', daysAgo(60));
    const rows = insertedStages();
    expect(rows).toHaveLength(4);
    expect(rows.map(r => r.stage)).toEqual([1, 2, 3, 4]);
  });
});
