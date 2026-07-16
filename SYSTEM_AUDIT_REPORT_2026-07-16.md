# Belarro OP — Complete System Audit Report
**Date:** July 16, 2026 · **Scope:** full field/sales flow + platform health · **By:** Claude (takeover session)

Per instruction: nothing beyond today's two shipped fixes was changed. Everything below is
findings + tests, prioritized for you to decide.

---

## 1. What was broken today and is now FIXED and LIVE

| # | Bug | Root cause | Fix | Status |
|---|-----|-----------|-----|--------|
| 1 | Saving a visit "didn't save" / email looked different after save | Re-visiting a place matched by exact text on name/address. Google returns the same restaurant with different formatting between visits → a **second location row** was silently created with its own email/contact. Two rows for one restaurant. | Match by Google's stable `place_id` first (server + map search) | ✅ Live on admin.belarro.com, verified by you on mobile |
| 2 | Follow-up emails failed with 535-5.7.8 | **Expired Gmail App Password** — Google rejected the SMTP login. Not a code bug. | New app password set in both Vercel projects, both redeployed | ✅ Live, verified by you on mobile |
| 3 | Field follow-ups page had no email option at all | Feature was only ever built in admin, never in the field app | Added the same send-email flow to the field page | ✅ Live |

---

## 2. Test suite — what now protects you

### Jest regression tests (run in ~8s, no credentials needed): `npx jest --ci`
**42 tests, all green.** 17 new ones lock down today's exact bug class:

- **Revisit dedup:** re-visiting with a matching `place_id` must UPDATE the existing row — never insert a duplicate, and the new email must land on that same row.
- **Field preservation:** a save that omits email/phone/contact must NOT blank those fields in the database.
- **Follow-up seeding:** every new place gets its drip seeded exactly once (idempotent); 5-stage flow for fresh leads, 4-stage re-engage for leads older than 40 days; stage 1 due ~2h after the visit.
- **Stage advance safety:** double-click / retry on "mark sent" must not re-push the next stage's due date (this silently delays leads).
- **Data protection:** the follow-up delete flow performs zero hard deletes — everything is PATCH (skipped/archived), per the mandate.

### Playwright live E2E (runs against the real deployed app): `npx playwright test src/e2e/field-flows.spec.ts`
Covers the full chain a rep does on the street: **save new place → appears in list with email →
revisit with different Google formatting → SAME row updated, no duplicate → both visits in history →
follow-up drip seeded with a real message (no `[Name]` placeholder leaks) → email endpoint alive →
archive hides it (soft).** Cleans up after itself.

- 2 tests already passing against admin.belarro.com (auth redirect, login page).
- The 7 data-flow tests need a login: set `E2E_EMAIL` / `E2E_PASSWORD` env vars. **Recommendation:
  create a dedicated `e2e-test@belarro.com` user in admin_users so tests never run as you.**
- `E2E_BASE_URL` picks the target (defaults to staging — but see finding P0-1).

---

## 3. Findings — NOT fixed (your call on priority)

### P0 — undermines your own safety rules
1. **Staging is effectively dead.** `belarro-op-staging.vercel.app` returns 404; the underlying
   deployments are behind Vercel Deployment Protection (SSO redirect), so neither your phone nor a
   test runner can reach it. **Your staging-first workflow cannot actually be followed right now** —
   which is how today's fixes ended up going straight to admin. Fix: disable deployment protection
   on belarro-op-staging (Vercel → Settings → Deployment Protection) or give it a real domain
   (staging.belarro.com).
2. **Local development is dead.** `.env.local` has `SUPABASE_SERVICE_ROLE_KEY=""`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=""`, `SESSION_SECRET=""` — empty. Nobody can run or test this app
   locally, which forces the exact "fix live, hope it works" pattern you're tired of. Needs the real
   values restored (from Supabase dashboard → Settings → API).

### P1 — real risks, not urgent today
3. **Legacy plaintext passwords** in `admin_users` (login route still supports plain-text equality
   for un-upgraded rows). Anyone with DB read access reads passwords. Fix: one-time bcrypt migration
   for all remaining rows, then delete the legacy branch.
4. **Same-day re-save counts as a 2nd visit** — your street feedback #2, confirmed in code: every
   save against an existing location always inserts a new `belarro_op_visit` row. In the action plan
   (`FIELD_APP_ACTION_PLAN_2026-07-16.md`), not yet built per your instruction.
5. **Follow-up template cache never expires** (module-level cache in `/api/follow-ups`). Editing a
   template in admin may not show up until the serverless instance recycles. Cheap fix: short TTL.
6. **`or=(id.eq...)` URL construction** in `/api/follow-ups` and `/api/follow-ups/today` grows with
   every lead with pending follow-ups; at several hundred leads the request URL can exceed limits
   and the follow-ups list dies at exactly the moment the pipeline is fullest. Fix: use PostgREST
   `in.()` with chunking.
7. **Old crops E2E spec is broken** (`src/e2e/crops-admin.spec.ts`) — navigates without login,
   hangs on redirects. It predates auth. Delete or rewrite it; right now it poisons `npm run e2e`.

### P2 — hygiene
8. `.env.example` still documents the dead Gmail OAuth vars (`GMAIL_CLIENT_ID`/`SECRET`) instead of
   the SMTP vars actually used; the OAuth vars also still sit unused in both Vercel projects — remove.
9. Login rate limiter is in-memory — resets on every cold start, so it's near-useless on Vercel.
10. Build warnings: deprecated `middleware` convention (Next 16 wants `proxy`), invalid `swcMinify`
    key in next.config.ts, stray `pnpm-lock.yaml` in `C:\Users\The boss\` confusing Turbopack's
    workspace-root detection (that stray file is outside this repo — flagging, not touching).
11. Git push from this machine fails (SSH key not authorized for Belarro/belarro-op), so today's two
    commits (`db99ca7` fix, `c6754f8` tests) exist locally + deployed via Vercel CLI, but are **not
    on GitHub**. Push them from a machine with access, or the repo and production drift apart.

---

## 4. What "top dev company" discipline looks like from here (the short version)

1. Restore staging (P0-1) and local env (P0-2) → every change gets tested before admin again.
2. Create the e2e-test user, run the live suite before every deploy:
   `E2E_BASE_URL=<staging> E2E_EMAIL=... E2E_PASSWORD=... npx playwright test src/e2e/field-flows.spec.ts`
3. Push the two local commits to GitHub so code and production match.
4. Then work down P1 in order (passwords → same-day visit dedup → template TTL → URL chunking).

**Bottom line:** today's street bugs are fixed, live, and now covered by 42 automated tests plus a
live E2E chain. The two things that made this week painful are structural, not code: no working
staging and no working local environment. Fix those two and the "fix one thing, break another"
cycle ends.
