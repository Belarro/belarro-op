# Work Order — Follow-up Sending Channels (Email + WhatsApp) + Field App UX

**Owner:** Ron Ben-Yohanan · **Date:** July 15, 2026
**Context:** Follow-ups must start going out now. Email send fails, WhatsApp untested, field app follow-ups screen is not usable as a daily tool. Ground rules from `TEAM_WORK_ORDER_2026-07-14.md` §2 apply (real testing with proof, port don't redesign, no secrets in git).

---

## ISSUE 1 — Email send fails: Gmail rejects credentials (RON ACTION, 5 min)

**Symptom:** `Email failed: Invalid login: 535-5.7.8 Username and Password not accepted` on every send from `/admin/follow-ups`.

**Root cause (verified):** The app password stored in Vercel's `GMAIL_SMTP_APP_PASSWORD` is **15 characters** — Google app passwords are always **16** (4 groups of 4). A character was lost when copying. Config detection passes (both vars exist) but Gmail rejects the actual login.

**Fix (Ron, nobody else can do this):**
1. Google account `admin@belarro.com` → myaccount.google.com/apppasswords
2. Delete the stale entries ("Belarro OP" from Jul 14, "Belarro" from today) — they're dead weight and confusion risk.
3. Create one new app password, name it `belarro-op-prod`. **Copy all 16 characters**, remove spaces.
4. Vercel → belarro-op → Settings → Environment Variables → edit `GMAIL_SMTP_APP_PASSWORD` → paste → save.
5. Redeploy (Deployments → ⋯ → Redeploy). Env changes only apply on the next build — this bit us twice today.

**Proof required:** send one real follow-up email to a test address from `/admin/follow-ups`; screenshot of the received email with the flyer rendered. `GMAIL_SMTP_USER=admin@belarro.com` is correct as-is (the app password was generated inside that account; `hello@belarro.com` is its verified send-as alias, used automatically as From).

---

## ISSUE 2 — WhatsApp links break for German-format phone numbers (CODE FIX)

**Bug (verified in code):** `parsePhone()` in `src/app/api/follow-ups/route.ts:60` only does `strip spaces + leading 00 → +`. A number stored locally as `0170 1234567` becomes `01701234567`, so the button opens `wa.me/01701234567` — **invalid**: wa.me requires full international format (`491701234567`). Any lead whose phone was captured in local German format gets a dead WhatsApp button on BOTH the admin follow-ups page and the field follow-ups page.

**The correct normalization already exists in this repo** — `getFollowUpMessage()` in `src/app/field/followUpTemplates.ts:304-312` (handles `00`/`0` prefixes, `+49` etc., country-code dedupe). 

**Fix:**
1. Extract that phone-normalization block into `src/lib/phone.ts` as `normalizeWhatsAppPhone(raw): string | null`.
2. Use it in `src/app/api/follow-ups/route.ts` (replaces `parsePhone`), in `followUpTemplates.ts` (replace inline copy), and anywhere else building `wa.me`/`api.whatsapp.com` links (grep `wa.me` — currently admin follow-ups page + field followups page build links from `whatsapp_number` client-side; once the API returns a normalized number, client code needs no change, but verify).
3. Unit tests for: `0170...` → `49170...`, `+49 170...`, `0049170...`, `030 293694 63` (landline — still normalized; the landline *filter* is separate), empty/null.

**Proof:** jest green including new tests; one manual tap on a real lead with a `0…`-format number → WhatsApp opens the correct chat with the message pre-filled.

**Bonus gap (same area):** the field follow-ups page shows the WhatsApp button for **landlines** too — admin hides it via `isLandline()` (030/0[2-9] = no WhatsApp, per `citfarm_whatsapp_landline` rule). Move `isLandline()` to `src/lib/phone.ts` as well and apply it on the field page.

---

## ISSUE 3 — Field app follow-ups screen: bring to parity with admin (`src/app/field/followups/page.tsx`)

Ron's verdict: current screen "doesn't look professional, no UX." He's right — it's a bare list. It shares the API with the admin page but implements almost none of the workflow. Gaps, in priority order:

1. **No per-channel sent tracking (double-send risk — Ron's #1).** Admin persists ✓ marks per channel (`sent_via` while status stays `pending` — see `markChannelSent()` in `src/app/admin/follow-ups/page.tsx:280`) and only completes the stage on "Done — move to next stage". Field page has a single "Mark sent" that instantly completes — no record of which channel went out, nothing stopping a second send. **Port the admin flow:** WhatsApp/Email buttons get ✓ state (persisted via the same `PUT status:'pending', sent_via` call), then a separate "Done — next stage" button.
2. **No email button.** Field page can't send email at all even though the endpoint (`/api/send-followup-email`) is session-authenticated and works from any device. Add the same email button + sent-✓ as admin.
3. **No stage progress bar.** Admin shows the 5-dot (or 4-dot re-engage) progress with 2h/2d/5d/2w/1m labels — port that component (it's ~15 lines, `src/app/admin/follow-ups/page.tsx:437-454`).
4. **No WhatsApp confirmation.** Admin asks "Did you send it?" after the wa.me jump; field marks nothing. Use the same confirm pattern.
5. **No error surfacing on `markSent`** — same unchecked-response bug class fixed everywhere else on July 15. Check `res.ok`/`json.success`, show the error.
6. **No secondary actions** — Communicated/Snooze/Converted/Delete exist only in admin. Minimum for field: "💬 Communicated" (replied) and "Converted". Snooze/Delete can stay admin-only.
7. Cosmetics after the above: bigger tap targets, message preview expandable (currently `line-clamp-4` with no way to read the rest), contact phone/email shown on card.

**Recommended approach:** extract the admin page's `Card` component + channel-tracking logic into a shared component (`src/components/FollowUpCard.tsx`) with a `compact` prop for mobile, instead of maintaining two diverging implementations — this is exactly how the two screens drifted apart in the first place. Rule: one system, admin and app identical in behavior.

**Proof:** phone-width screenshots of the new field list; demo flow: send WhatsApp → ✓ appears → reload → ✓ persists → Done → stage advances; jest + tsc clean.

---

## Sequence

1. Issue 1 — Ron regenerates app password (5 min, unblocks email TODAY).
2. Issue 2 — phone normalization (small, unblocks WhatsApp correctness).
3. Issue 3 — field parity (the real build, ~half a day).

## Also still open from earlier today
- `supabase/migrations/20260715_followup_status_check.sql` — **not yet pasted** into Supabase SQL editor; until then, deleting a follow-up still fails (verified live).
- German template texts — Ron pastes into `/admin/follow-ups/templates` (text supplied in chat, July 15). English is already live.
- Supabase service-role key rotation — pending (key passed through chat 3×).
