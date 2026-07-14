# Feature Spec — Newsletter/Broadcast + Re-Visit Logging (July 14, 2026)

**Owner:** Ron Ben-Yohanan
**Status:** Approved for build. Decisions below are FINAL — do not re-litigate them.
**Ground rules:** same as `TEAM_WORK_ORDER_2026-07-14.md` §2 (no DDL from code — migrations go in `supabase/migrations/` for Ron to paste; soft deletes only; real 3-layer testing with proof; port existing patterns, don't invent new ones).

**Ron's locked decisions:**
1. A manual re-visit **does not touch** the automatic follow-up schedule. Just log the visit. No rescheduling, no pausing, nothing.
2. WhatsApp broadcast = tap-through checklist (wa.me deep links), NOT WhatsApp Business API.
3. Email broadcast = fully automatic server-side send via the SMTP transport in `src/app/api/send-followup-email/route.ts` (extract it to `src/lib/mailer.ts` and reuse — do not duplicate).

---

## FEATURE A — Newsletter / Broadcast

### What it is
Admin composes one message (DE + EN versions), picks an audience, and sends it — email automatically, WhatsApp as a rapid tap-through list. Every send is logged per recipient, forever.

### A1. Database (migration file: `supabase/migrations/<date>_broadcasts.sql`)

```sql
CREATE TABLE IF NOT EXISTS belarro_op_broadcast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body_de text,
  body_en text,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','both')),
  audience jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','done','failed')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS belarro_op_broadcast_recipient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES belarro_op_broadcast(id),
  location_id text,          -- from locations (leads)
  customer_id text,          -- from belarro_v4_customer
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  to_address text NOT NULL,  -- email address or phone number
  language text,             -- DE/EN resolved at prepare time
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  error text,
  sent_at timestamptz,
  UNIQUE (broadcast_id, to_address, channel)   -- nobody gets it twice
);

-- Opt-out flag, respected by broadcasts AND follow-ups
ALTER TABLE locations ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false;
ALTER TABLE belarro_v4_customer ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false;

ALTER TABLE belarro_op_broadcast ENABLE ROW LEVEL SECURITY;
ALTER TABLE belarro_op_broadcast_recipient ENABLE ROW LEVEL SECURITY;
-- service-role-only, same pattern as the other belarro_op_* tables
```

### A2. Audience filter (the `audience` jsonb)
```json
{
  "source": "all | leads | customers",
  "stages": ["new_visit", "follow_up_1", "..."],        // empty = any
  "interest": ["Follow Up", "Closed Deal"],             // empty = any
  "language": ["DE", "EN"],                             // empty = any
  "last_visit_before": "2026-04-01"                     // optional; from locations.timestamp
}
```
Resolution rules (at prepare time, server-side):
- `leads` = `locations` where `archived != 'YES'`; `customers` = `belarro_v4_customer` where `deleted_at IS NULL AND status = 'active'`; `all` = union.
- **Dedupe across the union by email (email channel) and by normalized phone (whatsapp channel)** — a lead that converted to a customer exists in both tables.
- Exclude anyone with `do_not_contact = true`. Log them as `skipped`, don't silently drop.
- Email channel: only contacts with an email. WhatsApp channel: only contacts with a phone. Channel `both`: each contact goes to email if they have one, ELSE whatsapp (not both to the same person — Ron does not want double messages).
- Language per recipient: their stored `language`, default DE.

### A3. API routes (all admin-only via existing middleware; NO new public routes)
- `POST /api/broadcasts` — create draft `{title, body_de, body_en, channel, audience}`
- `GET /api/broadcasts` — list, newest first, with sent/pending/failed counts
- `GET /api/broadcasts/[id]` — detail + recipients
- `POST /api/broadcasts/[id]/prepare` — resolves audience → inserts recipient rows, returns counts per channel. Idempotent (UNIQUE constraint absorbs re-runs). Status stays `draft` until send.
- `POST /api/broadcasts/[id]/send-email` — **batch worker**: sends up to 20 pending email recipients per call (Vercel function timeout is the constraint — do NOT try to send 200 in one invocation), marks each row sent/failed, returns `{sent, failed, remaining}`. The client loops calling it until `remaining = 0`, then status → `done`. ~1 send/sec pacing inside the batch.
- `PATCH /api/broadcasts/[id]/recipients/[rid]` — mark a WhatsApp recipient `sent` or `skipped` (driven by the tap-through UI).

Email content: recipient's language picks body_de/body_en; reuse the flyer HTML wrapper from the follow-up mailer; append opt-out line ("Antworten Sie STOP, um keine Nachrichten mehr zu erhalten." / "Reply STOP to unsubscribe."). When Ron gets a STOP reply he flips `do_not_contact` manually (a toggle in the UI — see A4).

### A4. UI — new admin page `/admin/newsletter`
1. **List view**: past broadcasts with status + counts; "New broadcast" button.
2. **Compose**: title, DE body, EN body (textareas), channel picker, audience filters with a LIVE recipient count ("→ 34 email · 12 WhatsApp"). Save = draft.
3. **Send screen**:
   - Email: progress bar driven by the batch loop ("18/34 sent…"), failures listed with error text.
   - WhatsApp: full-screen checklist, one recipient per row (name, place, language flag), primary button opens `wa.me/<phone>?text=<urlencoded body in their language>`; on return, the row shows **Sent / Skip** buttons; next pending row auto-highlights. Progress counter on top.
4. **Recipient log** on the detail page: who, channel, status, when — permanent record.
5. `do_not_contact` toggle: add to the customer edit form (`/admin/customers`) and to the VisitForm "Manage" section.
6. Sidebar entry: "Newsletter" with an icon, admin role only.

### A5. Acceptance criteria / proof required
1. Create broadcast → prepare → counts match a hand-checked filter query against the DB (show both numbers).
2. Email send to a **test list of 2 real addresses Ron provides** — show the received emails (screenshot), one DE one EN, correct body per language, flyer rendered.
3. Recipient with `do_not_contact = true` → appears as `skipped`, receives nothing.
4. Re-running prepare/send does NOT double-send (show the UNIQUE constraint doing its job).
5. WhatsApp checklist on a phone: tap → WhatsApp opens with the right message in the right language → mark sent → row completes, next highlights (screen recording or photo sequence).
6. A lead that is also a customer receives exactly ONE message.
7. Batch worker: seed 45+ pending recipients, verify the loop completes across 3 calls with correct remaining counts.

---

## FEATURE B — Re-Visit Logging Polish ("keep everything the chef said")

### Context — what already exists (do NOT rebuild)
- Every visit already writes a permanent `belarro_op_visit` row (date, rep, notes, interest, stage, sample). Re-saving an existing place appends a visit (dup-place 409 fixed July 14, commit 8d72a9d).
- The field VisitForm already shows visit history + a read-only pipeline-stage badge.
- **Locked decision:** a manual visit changes NOTHING about the automatic follow-up schedule. Do not add any rescheduling logic.

### B1. Conversation tags on visits
- Migration: `ALTER TABLE belarro_op_visit ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';`
- VisitForm: a row of tap-chips above the Notes field. Preset tags (exact strings, EN only in the DB):
  `wants samples` · `price concern` · `has supplier` · `call back later` · `interested in specific crop` · `decision maker absent` · `positive` · `negative`
- Multi-select; selected chips get the green active style used elsewhere in the form. Saved into the visit row via the existing POST `/api/field/locations` (add `tags` passthrough to the `belarro_op_visit` insert).
- Visit history entries (in VisitForm and admin timeline) render tags as small pills next to the date.

### B2. Admin conversation timeline
- New endpoint `GET /api/locations/[id]/timeline` returning, merged and sorted desc by date:
  - visits from `belarro_op_visit` (date, rep, notes, tags, sample)
  - follow-up sends from `belarro_v4_follow_up` (stage, sent_via, sent_date) — sent/completed ones only
- New UI: a slide-over "Place history" panel reachable from the admin follow-ups page (tap the place name) and from `/admin/customers` rows. Shows the full relationship: every visit, every message sent, everything the chef ever said, newest first.
- No editing in the timeline — it's a record. (Notes are edited only by logging a new visit.)

### B3. Acceptance criteria / proof required
1. Log a visit with 3 tags → tags visible in the field history AND the admin timeline after reload (screenshots).
2. Timeline for a place with visits + sent follow-ups shows both types interleaved in correct date order.
3. Confirm by test: logging a manual visit on a place with pending follow-ups changes NOTHING in `belarro_v4_follow_up` (row-for-row diff before/after).
4. `tags` column absent (migration not yet pasted) → visit save still works, tags silently dropped (use the established try/fallback pattern from `api/field/locations/route.ts`).

---

## Build order
1. B (half day): migration → tags in form → timeline endpoint → timeline panel.
2. A (about a day): migration → mailer extraction → API routes → compose/send UI → WhatsApp checklist.
3. Each feature ships only with its full proof list. Push to `main` = production deploy — coordinate with Ron before each push.
