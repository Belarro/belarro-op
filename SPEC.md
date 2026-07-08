# Belarro OP — Sales Tracker Parity Spec

**Goal:** Belarro OP = the old admin (belarro-v4) + the old Sales Tracker, combined into ONE app that works on web (admin) and phone (field/PWA). Everything that existed in Sales Tracker must exist here — **ported, not reinvented**. This spec lists every remaining gap, found by reading every source file in both old apps and diffing against the current state of this repo.

**Date:** July 8, 2026. Audit method: full file-by-file read of `saletracker/src/**` and `belarro-v4` follow-up logic vs. `Belarro OP/src/app/field/**` + `api/field/**`.

---

## Ground rules for the implementing agent

1. **Port, don't redesign.** The reference implementation for every item is a specific file in `C:\Users\The boss\Downloads\Claude Code\saletracker`. Same fields, same options, same behavior. Mobile-friendly restyling with Tailwind is fine; changing what a feature does is not.
2. **Data lives in Supabase** (project wbqzlxdyjdmbzifhsyil), never Google Sheets. Master record per place = `locations` table (same one follow-ups use). Visit history = `belarro_op_visit`. Prospects will need a table (see P0-4; `belarro_op_prospect` already exists in the schema from `supabase/migrations/20260707_belarro_op_setup.sql` — use it).
3. **Auth = the existing cookie session** (`belarro_session`, roles admin/field/farm in middleware.ts). No Google OAuth. Google-OAuth-dependent features (live Calendar API writes) get the no-token fallback instead (`.ics` / calendar URL — see P2-15).
4. **DDL cannot be run by the agent.** Any new columns/tables go in a migration file under `supabase/migrations/` and Ron pastes it into the Supabase SQL editor. Write code to degrade gracefully until the migration is applied (see `api/field/locations/route.ts` for the established try/fallback pattern).
5. **Deploys:** push to `origin main` → Vercel auto-deploys `belarro-op.vercel.app`. Type-check (`npx tsc --noEmit`) + build + E2E on localhost:3002 before pushing. NEVER touch the old `admin`/`admin-staging` Vercel projects.
6. **Already verified as done — do not redo:** login/roles/users page, PWA shell, map with GPS dot + colored pins + POI-click-to-log + search + quick-add, VisitForm full field set (contact name/title, phone w/ country code, email, business type, website, outcome, notes+templates, sample given, uses-microgreens, language), deliveries tab w/ upcoming list, drip follow-ups (admin page is *better* than Sales Tracker's FollowUpsView), follow-up auto-seeding after new visit, email sending, note-template add.

---

## P0 — Ron notices immediately in daily use

### P0-1. Follow-up date field + snapped presets in VisitForm
Saving a visit with outcome "Follow Up" must auto-set a follow-up date: `calculateSnappedFollowUpDate(7)` (snaps to next Monday/Thursday), editable, with preset buttons **3 Days / 1 Week / 2 Weeks** (`CONFIG.FOLLOW_UP_PRESETS`). Store on `locations.follow_up_date` + `next_action_date` (columns exist).
- Reference: `saletracker/src/components/LocationPanel.jsx` lines 180–186, 199–209; `saletracker/src/utils/dateUtils.js` (`calculateSnappedFollowUpDate`, `calculateNextActionDate`, `toEUDateString`).
- Acceptance: pick "Follow Up" → date appears pre-filled and snapped; presets change it; saved date visible on reopen.

### P0-2. Quick-send message preview right after saving a visit
After save, show the stage-appropriate WhatsApp/email message with **Copy / Send WhatsApp / Send Email / Send Both** buttons and a "Did you send it?" confirm that logs the send and advances the pipeline stage. This is the core rep flow: log visit → send intro message immediately.
- Reference: `LocationPanel.jsx` lines 849–1123; message generation `saletracker/src/utils/followUpTemplates.js` (`getFollowUpMessage`, incl. both-languages-combined when language blank).
- Acceptance: save a visit → preview panel appears with working WA deep-link and mailto/send-email; confirming "sent" records it.

### P0-3. Archive + Delete in VisitForm ("Manage" section)
No way to hide/remove a location from the field app today. Add Archive (sets `locations.archived='YES'`) and Delete (soft — set archived + a deleted flag; hard deletes are forbidden by the DB trigger). Needs a PATCH/DELETE handler in `api/field/locations/route.ts`.
- Reference: `LocationPanel.jsx` lines 322–360, 1244–1301.
- Acceptance: archive → place disappears from map/list; delete → same with confirm dialog; both survive reload.

### P0-4. Prospect / "To Visit" layer (map + data)
Whole missing feature: bookmark a place to visit later without logging a visit. Blue markers on the map (distinct from visited pins), added from search results (bookmark icon per result), removable ("Remove from To Visit"), counted in the map counter ("X visited · Y to visit"). Table `belarro_op_prospect` already exists (name, address, lat, lng, notes, uses_microgreens). Needs `/api/field/prospects` (GET/POST/soft-DELETE) + FieldMap `prospects` prop + blue-marker layer + search-result save button.
- Reference: `SimpleMap.jsx` lines 339–360, 400–413, 1010–1071; sheet functions `googleSheets.js` `addProspect`/`deleteProspect` (behavior reference only).
- Acceptance: search a place → bookmark it → blue pin appears; tap blue pin → panel offers "log visit" (converts to a real location) or "remove".

### P0-5. GPS proximity auto-detection ("you're at a restaurant — log it")
Every 60s while the map is open: fresh GPS fix; if moved >30m, Places `searchByText` (restaurant OR cafe OR bar OR bistro) within 80m; exactly one match and different from last-fired → show dismissible green banner "📍 {name} — Tap to log a visit", auto-hide 12s, tap opens VisitForm pre-filled.
- Reference: `saletracker/src/hooks/useNearbyDetection.js` (whole file, 128 lines — port constants exactly: WATCH_INTERVAL 60s, MIN_MOVE_METERS 30, DETECTION_RADIUS 80), banner UI `App.jsx` lines 58–70, 291–332.
- Acceptance: walking near a restaurant with map open triggers the banner once, not repeatedly for the same place.

### P0-6. Visit history + pipeline stage badge in VisitForm
Reopening a place must show: colored pipeline-stage badge (New Visit / Follow-up 1–4 / Order Confirmed / …), colored status dot + label, "Open in Maps" link, and the last up-to-8 visits (date, rep, sample badge, notes). Backend already supports it: `GET /api/field/locations?history=<id>` returns `belarro_op_visit` rows — the UI just never calls it.
- Reference: `LocationPanel.jsx` lines 133–142, 424–487, 1159–1242.
- Acceptance: open an existing place → stage badge + history list render; new place → neither.

### P0-7. Repeat-visit count badges on map pins
Pins must show visit count when >1 (Sales Tracker grouped by name|address and printed the count inside the pin circle). With `belarro_op_visit` this becomes: count visits per location and pass into the marker. Cheapest: add a count subquery/param to the locations GET (or a second lightweight endpoint) and use it in `FieldMap.plotLocation`.
- Reference: `SimpleMap.jsx` lines 259–276 (grouping), 373–381 (badge rendering — `count > 1 ? count : ''`).
- Acceptance: a place with 3 logged visits shows "3" in its pin.

---

## P1 — Workflow-shaping, notice within a week

### P1-8. Field follow-ups page: three-way split + one-tap Send & Done + stage dots + history log
Rebuild `/field/followups` to match TodaysTasks.jsx: separate **Overdue / Today / Upcoming** sections with counts; per-card stage-dot progress (Intro/FU1/FU2/FU3/Close/Order); expandable per-card history log; primary button = **Send Follow-up & Done** (opens WhatsApp AND marks done AND advances in one tap — with a date-picker sub-flow when stage is order_confirmed to choose next Tuesday delivery); secondary Copy + Email buttons.
- Reference: `saletracker/src/components/TodaysTasks.jsx` whole file (StageDots 57–82; history 107–111, 308–324; send+done 121–188).
- Acceptance: one tap sends and completes; overdue vs today vs upcoming visually distinct.

### P1-9. Field dashboard / stats
New Overview surface (tab or slide-in): tiles for Overdue, Due Today, This Week, Total Visits, Deals Closed + quick-action shortcuts. Data derivable from existing locations + follow-ups endpoints.
- Reference: `saletracker/src/components/Dashboard.jsx`, `StatsCard.jsx` (both small).

### P1-10. Visits list: sort, filter, CSV export, outcome coloring
Add Recent/Name sort toggle, All/Interested/Follow Up/Not Interested filter, **Export CSV** button (Name/Address/Interest/Notes/Date of filtered rows), colored left-border by `interest_level` (not raw `pipeline_stage` badge — reps think in outcomes).
- Reference: `saletracker/src/components/ListView.jsx` (sort/filter 12–67, CSV 69–87, styling 15–27).

### P1-11. Note-templates admin management
Small admin page/section listing all templates with remove; add DELETE (soft) to `api/field/note-templates/route.ts`.
- Reference: `saletracker/src/components/AdminSetup.jsx` lines 107–114, 275–300.

### P1-12. Full pin-color semantics + manual override
Port all 6 color states from `colorUtils.js` (incl. Orange "hot lead" = interested+sample given, Blue "bring samples", manual `pinColor` override) into FieldMap + visits list. May need a `pin_color` column (migration file).
- Reference: `saletracker/src/utils/colorUtils.js` whole file.

### P1-13. Post-sale nurture sequence
Sales Tracker had lifecycle stages after closing: **order_confirmed → delivery_reminder (day before) → post_delivery (feedback ask) → active_customer (6-week check-in) → inactive**, each with bilingual message templates. Belarro OP's drip system stops at closed_won. Design decision needed: extend `belarro_v4_follow_up` flows with a "post-sale" flow seeded on conversion, reusing the DB-backed template table. Port the message copy from the reference.
- Reference: `saletracker/src/utils/followUpTemplates.js` lines 244–411 (templates), `config.js` PIPELINE_STAGES.
- Acceptance: converting a lead to a customer seeds the post-sale sequence; delivery-reminder stage ties to actual next delivery date where available.

---

## P2 — Polish

- **P2-14. Save-to-Contacts vCard export** after save (Android contact w/ Belarro group). Ref: `LocationPanel.jsx` 17–53, 1125–1157.
- **P2-15. Calendar fallback for follow-ups:** "Add to Calendar" (Google Calendar URL) + `.ics` download on follow-up cards. Port `calendarUtils.js` only (the OAuth `googleCalendar.js` path is not portable — no Google login anymore).
- **P2-16. Morning notification + settings panel:** browser Notification at configured time with overdue/today counts, once per day, tap deep-links to follow-ups; settings panel for enable/time/phone. Needs `notificationclick` handler added to `public/sw.js`. Redesign around Web Push is acceptable here (the one place redesign is allowed, since the old mechanism was tied to the app being open). Ref: `NotificationSettings.jsx`, `App.jsx` 79–113, `useSettings.js`, saletracker `sw.js` 9–25.
- **P2-17. "Send me today's summary" WhatsApp self-digest.** Ref: `summaryUtils.js`, `TodaysTasks.jsx` 511–527.
- **P2-18. First-run map hint tooltip** ("Tap any business…", localStorage-gated, 12s auto-dismiss). Ref: `SimpleMap.jsx` 79–94, 779–816.
- **P2-19. Search-result "SAVED" badge + inline microgreens toggle** (depends on P0-4). Ref: `SimpleMap.jsx` 1010–1071.
- **P2-20. Session inactivity timeout parity check** — Sales Tracker auto-signed-out after 30 min idle; verify whether Belarro OP's 7-day cookie needs an idle-timeout complement (ask Ron before building).

---

## Explicitly NOT gaps (verified — leave alone)

- Google OAuth login → replaced by admin_users + roles (intentional upgrade).
- AdminSetup's admin/team allow-lists → replaced by /admin/users.
- Google Sheets mirroring (`syncSheets.js`) and cross-app sync (`syncBelarro.js`) → obsolete; the one real behavior inside them (auto-seeding follow-ups after a new visit) is already ported and verified.
- Email sending for follow-ups → already exists (`api/send-followup-email`, wired in admin follow-ups).
- `MATERIALS_LIST`, `AUTOMATION_STATUS` config constants → dead/n8n-legacy, skip.
- Marker clustering → never existed in Sales Tracker either (library loaded but unused).
- Admin follow-ups page → Belarro OP's version is a superset of Sales Tracker's FollowUpsView (keep ours).

## Data migration still pending (separate from features)
- `scripts/migrate-sheet.js` (visit history + prospects + templates from the Google Sheet → Supabase) — written, not yet run; needs `SHEET_ID` + `SHEETS_API_KEY` from Ron.
- `supabase/migrations/20260708_locations_latlng.sql` (lat/lng columns) — Ron to paste in SQL editor; app already handles both pre/post states.
