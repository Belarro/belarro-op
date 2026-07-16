/**
 * Live end-to-end tests for the field sales flows — the ones that broke on
 * the street on July 16. Runs against a real deployment with a real login,
 * writes one clearly-marked test place, and archives it again at the end
 * (soft delete only, per the data protection mandate).
 *
 * Needs env vars: E2E_EMAIL, E2E_PASSWORD (and optionally E2E_BASE_URL —
 * defaults to staging; point it at admin.belarro.com only on purpose).
 */
import { test, expect, APIRequestContext } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';

// One unique place per run so parallel/failed runs never collide.
const RUN_ID = `${Date.now()}`;
const TEST_PLACE = {
  location_name: `ZZZ E2E TEST ${RUN_ID}`,
  business_address: `Teststrasse ${RUN_ID.slice(-4)}, 10115 Berlin`,
  place_id: `E2E_PLACE_${RUN_ID}`,
};

let api: APIRequestContext;
let createdLocationId: string | null = null;

test.beforeAll(async ({ playwright, baseURL }) => {
  if (!EMAIL || !PASSWORD) return;
  // Log in once via the real login API; the returned cookie authenticates
  // every request after, exactly like the phone does it.
  api = await playwright.request.newContext({ baseURL: baseURL! });
  const res = await api.post('/api/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(res.ok(), 'login must succeed — check E2E_EMAIL/E2E_PASSWORD').toBe(true);
  const json = await res.json();
  expect(json.success).toBe(true);
});

test.afterAll(async () => {
  if (!api) return;
  // Cleanup: archive the test place (soft delete — recoverable).
  if (createdLocationId) {
    await api.patch('/api/field/locations', {
      data: { id: createdLocationId, archived: 'YES' },
    });
  }
  await api.dispose();
});

test.describe.serial('field visit save → revisit dedup → follow-ups', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run the live data flows');

  test('1. saving a new place from the field creates it and returns a location id', async () => {
    const res = await api.post('/api/field/locations', {
      data: {
        ...TEST_PLACE,
        contact_person: 'E2E Chef',
        direct_email: 'first-visit@example.com',
        notes: 'e2e first visit',
        interest_level: 'Lead',
        pipeline_stage: 'new_visit',
        lat: 52.52, lng: 13.405,
      },
    });
    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.location_id).toBeTruthy();
    createdLocationId = json.data.location_id;
  });

  test('2. the saved place appears in the field locations list with its email', async () => {
    const res = await api.get('/api/field/locations');
    const json = await res.json();
    expect(json.success).toBe(true);
    const mine = json.data.find((l: any) => l.id === createdLocationId);
    expect(mine, 'saved place must appear in the list').toBeTruthy();
    expect(mine.direct_email).toBe('first-visit@example.com');
    expect(mine.contact_person).toBe('E2E Chef');
  });

  test('3. REGRESSION: re-visiting with different address formatting updates the SAME row (no duplicate)', async () => {
    // Same place_id, deliberately different name/address formatting — the
    // exact situation that used to fork a duplicate row with its own email.
    const res = await api.post('/api/field/locations', {
      data: {
        location_name: TEST_PLACE.location_name.toUpperCase(),
        business_address: TEST_PLACE.business_address + ', Germany',
        place_id: TEST_PLACE.place_id,
        direct_email: 'second-visit@example.com',
        notes: 'e2e revisit',
      },
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.location_id, 'revisit must resolve to the SAME location').toBe(createdLocationId);

    // The list must show exactly ONE row for this place, with the new email.
    const list = await (await api.get('/api/field/locations')).json();
    const matches = list.data.filter((l: any) =>
      (l.location_name || '').toUpperCase().includes(`ZZZ E2E TEST ${RUN_ID}`)
    );
    expect(matches, 'must not fork a duplicate location').toHaveLength(1);
    expect(matches[0].direct_email).toBe('second-visit@example.com');
  });

  test('4. both visits are recorded in the visit history', async () => {
    const res = await api.get(`/api/field/locations?history=${createdLocationId}`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(2);
  });

  test('5. the new place got its follow-up drip seeded and shows in follow-ups', async () => {
    const res = await api.get('/api/follow-ups');
    const json = await res.json();
    expect(json.success).toBe(true);
    const fu = json.data.find((f: any) => f.location_id === createdLocationId && f.status === 'pending');
    expect(fu, 'new place must have a pending follow-up').toBeTruthy();
    expect(fu.stage).toBe(1);
    expect(fu.message_text, 'follow-up must have a real message').toBeTruthy();
    expect(fu.message_text).not.toContain('[Name]'); // placeholder must be substituted
    expect(fu.location.email).toBe('second-visit@example.com');
  });

  test('6. the follow-up email endpoint is reachable and authenticated (no send — validation only)', async () => {
    // Missing fields → 400 proves the route is alive and past auth,
    // without actually emailing anyone.
    const res = await api.post('/api/send-followup-email', { data: { to: '' } });
    expect(res.status()).toBe(400);
  });

  test('7. archiving hides the place from the field list (soft delete)', async () => {
    const res = await api.patch('/api/field/locations', {
      data: { id: createdLocationId, archived: 'YES' },
    });
    expect((await res.json()).success).toBe(true);

    const list = await (await api.get('/api/field/locations')).json();
    expect(list.data.find((l: any) => l.id === createdLocationId)).toBeFalsy();
    createdLocationId = null; // already cleaned up
  });
});

test.describe('field app pages render', () => {
  test.use({ storageState: undefined });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/field/visits');
    await page.waitForURL('**/login**');
    expect(page.url()).toContain('/login');
  });

  test('login page renders the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});
