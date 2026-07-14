# Belarro — Team Work Order (July 14, 2026)

**Owner:** Ron Ben-Yohanan
**Goal:** One system, one database, zero duplicates. Seven tasks, in the exact order below. Every task has acceptance criteria and required test proof — a task is DONE only when the proof is shown.

---

## 1. System overview (read before touching anything)

| Piece | Repo / folder | Deploys to | What it is |
|---|---|---|---|
| **Belarro OP** | `Belarro OP/` (GitHub `Belarro/belarro-op`, branch `main`) | **admin.belarro.com** (Vercel project `belarro-op`, auto-deploy on push) | THE app. Next.js. Admin on web (crops, prices, customers, orders, production, invoices, follow-ups) + field PWA on phone (map, visits, prospects, follow-ups, deliveries). Roles: `admin` (everything), `field` (field app only), `farm` (production + inventory only) — enforced in `src/middleware.ts`. |
| **Website** | `belarro-website/` (GitHub `Belarro/belarro-website`) | **belarro.com** (Vercel project `website`, auto-deploy on push) | Static HTML brand site, EN + DE. Reads crops/prices live from Supabase. `/for-chefs` = the price/order page chefs get in follow-up messages (WhatsApp ordering — WORKS, do not touch). |
| **Sales Tracker** | `saletracker/` | sales.belarro.com | OLD app, Google Sheets backend. Being retired — Task 5. Do not develop on it. |
| **belarro-v4** | `belarro-v4/` | nothing (Vercel projects deleted July 9) | Dead code. Being archived — Task 6. Do not develop on it. |

**One database for everything:** Supabase project `wbqzlxdyjdmbzifhsyil`.
- Leads / visited places: `locations` (89 rows). Visit history: `belarro_op_visit`. Prospects ("to visit"): `belarro_op_prospect`.
- Paying customers: `belarro_v4_customer`. Leads become customers via `POST /api/locations/convert`.
- Follow-up templates (EN/DE, DB-backed): `belarro_v4_followup_template`. Follow-ups: `belarro_v4_follow_up`.
- Website sample-form config (ZIP zones/days): `belarro_v4_sample_config` (live, row id=1).

**Follow-up system (already working — Task 2 only changes one number):**
- **New-lead flow:** 5 stages — +2h / +2d / +5d / +14d / +30d after the visit.
- **Re-engage flow** (old places): 4 stages — now / +2d / +5d / +30d.
- Which flow a lead gets is decided by `isOldLead()` — currently "older than 30 days".

---

## 2. Ground rules (non-negotiable)

1. **Never touch** the Vercel projects `sales-tracker` (until Task 5) or anything SmrtCom. Never touch `belarro-v4` except Task 6.
2. **No DDL from code.** New tables/columns go in a migration file under `Belarro OP/supabase/migrations/`; Ron pastes them into the Supabase SQL editor himself. Code must degrade gracefully until the migration is applied (see the try/fallback pattern in `src/app/api/field/locations/route.ts`).
3. **No secrets in git.** No `.env*`, keys, or tokens committed. Check `git status` + `git diff --cached` before every commit.
4. **No hard deletes** of user data — ever. Soft deletes only (`deleted_at` / `archived`). A DB trigger blocks hard deletes on key tables.
5. **Testing is real.** "It compiles" is not done. Every task below ends with: type-check (`npx tsc --noEmit`), unit tests (`npx jest`), and a real E2E check (curl against the running app / form submitted in a real browser) — with the actual output shown in the report.
6. **Before pushing Belarro OP:** `npx tsc --noEmit` clean + `npx jest` green + E2E on `localhost:3002` (`npx next dev -p 3002`). Push to `main` auto-deploys production.
7. **Website testing:** local server (`python -m http.server` in `belarro-website/`), verify, then push (auto-deploys), verify once on production.
8. **Port, don't redesign.** Match existing code style, existing CSS classes, existing patterns. No new frameworks, no refactors nobody asked for.

---

## 3. Tasks

### TASK 1 — Website: one sample experience on every button ⭐ highest priority

**Problem (verified live July 14):** the homepage has 4 "Request Samples" buttons. The header button goes to `/support`, which has the NEW form with ZIP-code → delivery-day picker. The other 3 buttons (hero, mobile sticky bar, footer) scroll to `#samples` — the OLD inline homepage form with no ZIP picker. Most clicks get the old experience.

**Fix:** add the existing ZIP + day/time picker to the homepage `#samples` form, both languages. All 4 buttons then deliver the same experience.

**Files:**
- `belarro-website/index.html` — add PLZ input + schedule block markup to the `#samples` form (copy the markup pattern from `support.html` lines ~62–80: `input[name=plz]`, `#schedule-block[hidden]` with `#schedule-zone`, `#schedule-days`, `#schedule-windows`, `#schedule-fallback[hidden]`).
- `belarro-website/de/index.html` — same, German texts (copy from `de/support.html`).
- `belarro-website/js/main.js` — the scheduler already exists (section "SAMPLE SCHEDULING": `initSampleScheduling()`, `zoneForPlz()`, `nextZoneDates()`). Currently it initializes only the support-page form. Make it initialize EVERY `#sample-form` on the page (it must handle two forms existing across pages; IDs are per-page so this is one init call per page). Validation (PLZ required, 5 digits; day + window required when a zone matches) must apply to the homepage form too.
- `belarro-website/css/styles.css` — only if spacing breaks inside the homepage form section; reuse existing `.schedule-chip`, `.form-schedule` classes. Do not restyle.
- Keep `support.html` as is (it keeps its form — it's the same one experience now). Do NOT remove pages.

**How it must behave (same as /support today):**
- Chef types 5-digit Berlin PLZ → zone line appears ("West — Charlottenburg · Wilmersdorf…") + next 2 delivery dates of that zone's weekday (min 2 days lead) + Morning/Afternoon chips. Must pick one day + one window.
- Non-Berlin/unknown PLZ → fallback line "Outside our regular routes — we'll contact you…", submit allowed without day/window.
- Submission payload includes `delivery_address` ("PLZ 10627 — West …"), `preferred_days`, `preferred_times` — the backend (`api/form-submit.js` → `form_submissions` table) already supports these fields, no server change.

**Acceptance criteria / proof required:**
1. Screenshot: homepage form (EN) with PLZ `10627` typed → West zone + 2 Wednesday dates + 2 time windows visible.
2. Screenshot: same on `de/index.html` with German labels.
3. Submit a test request from the homepage form → show the new row in the `form_submissions` table with `delivery_address` + `preferred_days` + `preferred_times` filled. Mark/delete the test row after.
4. PLZ `99999` → fallback note shows, submit still works.
5. All 4 CTA buttons verified: each lands on a form with the ZIP picker.
6. Verified once on production (belarro.com) after deploy.

---

### TASK 2 — Belarro OP: re-engage threshold 30 → 40 days

**Problem:** a lead "older than 30 days" gets the re-engage message sequence. Ron decided the cutoff is **40 days**.

**Fix:** change `const OLD_LEAD_DAYS = 30;` to `40` in ALL THREE places (they are separate copies — all must match):
- `src/app/api/follow-ups/route.ts:5`
- `src/app/api/follow-ups/[id]/route.ts:27`
- `src/app/api/locations/seed-followups/route.ts:5`

Better: while there, move the constant to one shared module (e.g. `src/lib/followups.ts`) and import it in all three — small, safe, prevents this class of drift. If that grows beyond 30 minutes, just change the three numbers.

**Proof required:** `grep -rn "OLD_LEAD_DAYS" src/` output showing 40 everywhere (or the single shared constant); type-check clean; one E2E: seed follow-ups for a test lead dated 35 days ago → gets the **new-lead** flow (5 stages), and one dated 45 days ago → gets **re-engage** (4 stages). Show the API responses. Delete test data (soft) after.

---

### TASK 3 — Apply the 2 pending DB migrations (RON ACTION + team verify)

**Problem (verified against live DB July 14):** columns `locations.lat`, `locations.lng`, `locations.pin_color` **do not exist** in production. Result: map pins are re-geocoded on every load (slow) and manual pin colors don't persist.

**Ron pastes** into the Supabase SQL editor (files already in repo):
- `Belarro OP/supabase/migrations/20260708_locations_latlng.sql`
- `Belarro OP/supabase/migrations/20260708_locations_pin_color.sql`

**Team verifies after paste:**
```
GET https://wbqzlxdyjdmbzifhsyil.supabase.co/rest/v1/locations?select=lat,lng,pin_color&limit=1
```
returns 200 (not "column does not exist"), and on the field map a saved location shows its pin instantly on reload (stored coords, no geocode delay).

---

### TASK 4 — Migrate Google Sheet history → Supabase

**Problem:** the old Sales Tracker's visit history + prospects live in a Google Sheet. The new app's `belarro_op_visit` table has only 9 rows (visits logged since launch). History must move before Sales Tracker dies.

**Fix:** run the already-written script `Belarro OP/scripts/migrate-sheet.js`. It needs two values **from Ron**: `SHEET_ID` and `SHEETS_API_KEY` (put in env/local invocation only — NOT committed).

**Proof required:**
1. Row counts before/after for `belarro_op_visit` and `belarro_op_prospect`, matched against the Sheet's row counts (show both numbers).
2. Spot-check 3 random historical visits in the field app UI: open the place → visit history shows the old visits with correct dates/notes.
3. No duplicates created for places that already exist in `locations` (the script matches by name|address — verify count of `locations` didn't explode; it was 89 before).

---

### TASK 5 — Retire Sales Tracker (ONLY after Task 4 is verified)

1. Confirm with Ron that Task 4 proof is accepted.
2. In Vercel project `sales-tracker`: repoint `sales.belarro.com` to a redirect → `https://admin.belarro.com/field` (a tiny static redirect deploy on that project is fine), or remove the alias entirely — Ron's call at handover.
3. Do NOT delete the GitHub repo or the Google Sheet — they stay as read-only archive.
4. **Proof:** `curl -I https://sales.belarro.com` showing the redirect (or the removal), and Ron confirms his phone home-screen icon now points at the field app.

---

### TASK 6 — Archive belarro-v4

Nothing runs from it (Vercel projects deleted July 9). Move the folder `belarro-v4/` into the archive location Ron names at handover. Do not delete. No code changes. One line in the report: old path → new path.

---

### TASK 7 — Fix the 5 stale unit tests (Belarro OP)

**Problem (verified July 14):** `npx jest` → 11/16 pass. The 5 failures in `src/app/admin/crops/__tests__/page.test.tsx` are stale expectations, not product bugs — the page moved to REST-style calls (`/api/crops/1`) while tests still expect query-style (`/api/crops?id=1`), and the page now also fetches `/api/packaging-stock`.

**Fix:** update the test expectations to the current API contract. Do NOT change product code to satisfy old tests. Failing tests: "should load crop data when selected", "should calculate total growth days correctly", "should display existing variants", "should add new variant when in edit mode", "should validate growth environment days".

**Proof:** `npx jest` output — 16/16 green.

---

## 4. Explicitly do NOT touch

- WhatsApp ordering on `/for-chefs` — works, leave it.
- The admin follow-ups pages/logic (beyond the Task 2 constant) — recently QA'd, working.
- Auth/session/middleware — recently security-audited, working (verified July 14: no-cookie → 401/redirect, forged cookie → 401).
- `admin` / `admin-staging` — these Vercel projects no longer exist; if you ever see them referenced, stop and ask.
- Prices are intentionally NOT shown on the public website (only on `/for-chefs`). Don't "fix" that.
- Tuesday is delivery day. Never schedule anything that conflicts with it.

## 5. Definition of done (whole order)

- [ ] Every "Request Samples" button on belarro.com (EN + DE) leads to the ZIP day-picker form; test submission visible in admin Submissions.
- [ ] Re-engage cutoff = 40 days, one shared constant, E2E-proven with 35-day and 45-day test leads.
- [ ] `lat`/`lng`/`pin_color` live in DB; map pins instant.
- [ ] Full visit history + prospects in Supabase, counts match the Sheet.
- [ ] sales.belarro.com redirects to the field app; nobody can write to the Sheet path anymore.
- [ ] belarro-v4 folder archived.
- [ ] 16/16 unit tests green, `tsc --noEmit` clean, all pushed, production verified.

**Report format per task:** what changed (files), proof (command output / screenshots), anything found along the way. Short. No essays.
