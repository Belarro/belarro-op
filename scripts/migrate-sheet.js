/**
 * One-time migration: Google Sheet -> Supabase.
 *
 * What moves (the only data NOT already in Supabase — the `locations` table
 * already mirrors the Sheet's location/pipeline data, 77 rows verified):
 *   - Visit HISTORY rows  -> belarro_op_visit (matched to locations by name)
 *   - "ToVisit" prospects -> belarro_op_prospect
 *   - Note templates      -> belarro_op_note_template
 *
 * Usage (dry run by default, APPLY=1 to write):
 *   SHEET_ID=<google sheet id> SHEETS_API_KEY=<key> node scripts/migrate-sheet.js
 *   ... APPLY=1 node scripts/migrate-sheet.js
 *
 * Requirements: the Sheet must be readable by the API key (link-sharing on,
 * or the key's project has access). Reads SUPABASE_SERVICE_ROLE_KEY and
 * NEXT_PUBLIC_SUPABASE_URL from .env.local in the project root.
 */
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const SB_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const SB_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim().replace(/\/$/, '');
const SHEET_ID = process.env.SHEET_ID;
const API_KEY = process.env.SHEETS_API_KEY;
const APPLY = process.env.APPLY === '1';

if (!SHEET_ID || !API_KEY) {
  console.error('Set SHEET_ID and SHEETS_API_KEY env vars.');
  process.exit(1);
}

const SB_HDRS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

async function sheetRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheet read failed for ${range}: ${res.status} ${t.slice(0, 200)}`);
  }
  return (await res.json()).values || [];
}

async function sb(method, pathname, body) {
  const res = await fetch(`${SB_URL}/rest/v1${pathname}`, {
    method, headers: SB_HDRS, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathname}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function main() {
  // Supabase locations for name matching
  const locRes = await fetch(`${SB_URL}/rest/v1/locations?select=id,location_name`, { headers: SB_HDRS });
  const locations = await locRes.json();
  const locByName = new Map(locations.map(l => [String(l.location_name || '').trim().toLowerCase(), l.id]));
  console.log(`Supabase locations: ${locations.length}`);

  // ── 1. Visit history ──
  // The Sheet's History tab: [locationName, address, visitDate, notes, rep, ...]
  // Adjust the tab name below if yours differs (common: 'History' / 'Visits').
  let history = [];
  for (const tab of ['History', 'Visits', 'VisitHistory']) {
    try { history = await sheetRange(`${tab}!A2:H`); if (history.length) { console.log(`history tab: ${tab} (${history.length} rows)`); break; } }
    catch { /* try next */ }
  }

  let matched = 0, unmatched = 0;
  const visitRows = [];
  for (const row of history) {
    const [name, , visitDate, notes, rep] = [row[0], row[1], row[2], row[3], row[4]];
    const locId = locByName.get(String(name || '').trim().toLowerCase());
    if (!locId) { unmatched++; continue; }
    matched++;
    visitRows.push({
      location_id: locId,
      visit_date: visitDate ? new Date(visitDate).toISOString() : new Date().toISOString(),
      notes: notes || null,
      sales_rep: rep || null,
    });
  }
  console.log(`visit history: ${matched} matched, ${unmatched} unmatched (no location by that name)`);

  // ── 2. Prospects (ToVisit tab): [id?, name, address, notes, lat, lng, usesMicrogreens] ──
  let prospects = [];
  for (const tab of ['ToVisit', 'Prospects']) {
    try { prospects = await sheetRange(`${tab}!A2:G`); if (prospects.length) { console.log(`prospects tab: ${tab} (${prospects.length} rows)`); break; } }
    catch { /* try next */ }
  }
  const prospectRows = prospects
    .filter(r => (r[1] || r[0] || '').trim())
    .map(r => ({
      id: crypto.randomUUID(),
      name: (r[1] || r[0] || '').trim(),
      address: r[2] || null,
      notes: r[3] || null,
      lat: r[4] ? Number(r[4]) : null,
      lng: r[5] ? Number(r[5]) : null,
      uses_microgreens: String(r[6] || '').toLowerCase() === 'true',
    }));

  // ── 3. Note templates ──
  let templates = [];
  for (const tab of ['NoteTemplates', 'Templates']) {
    try { templates = await sheetRange(`${tab}!A2:A`); if (templates.length) { console.log(`templates tab: ${tab} (${templates.length} rows)`); break; } }
    catch { /* try next */ }
  }
  const templateRows = templates.filter(r => (r[0] || '').trim())
    .map(r => ({ id: crypto.randomUUID(), template: r[0].trim() }));

  console.log(`\nWill write: ${visitRows.length} visits, ${prospectRows.length} prospects, ${templateRows.length} templates`);
  if (!APPLY) { console.log('DRY RUN — set APPLY=1 to write.'); return; }

  for (let i = 0; i < visitRows.length; i += 100) await sb('POST', '/belarro_op_visit', visitRows.slice(i, i + 100));
  for (let i = 0; i < prospectRows.length; i += 100) await sb('POST', '/belarro_op_prospect', prospectRows.slice(i, i + 100));
  if (templateRows.length) await sb('POST', '/belarro_op_note_template', templateRows);
  console.log('APPLIED.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
