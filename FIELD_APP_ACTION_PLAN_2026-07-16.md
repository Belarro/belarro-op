# Field App Action Plan — from today's street feedback (2026-07-16)

Source: Ron, walking real visits today. Three gaps, not yet built.

---

## 1. "Chef not there" — reuse the existing blue-dot lead marker, don't build a new one

**Clarified by Ron:** The blue dot already exists for this — it's the same
"lead, remember to visit" marker that's currently used for prospects bookmarked
from search (`prospects` table, `createProspectMarker` in `FieldMap.tsx`).

**The actual gap:** Right now that blue dot only means "bookmarked, never been
here." It needs to also cover: "we physically went, chef wasn't there, we
still need to go back." Same visual meaning to the rep (blue = needs a visit),
but a different underlying situation — an attempt was already made.

**What's wanted, concretely:**
- On arriving at a place and finding the chef absent, one tap marks it as a
  lead with the blue dot — same as an unvisited prospect looks on the map.
- Should NOT go through the full visit form (Outcome/Notes/Sample given/etc.)
  — that form is for an actual conversation that happened. This is a
  different, lighter action: "attempted, nobody to talk to, still a lead."
- Whatever gets attached to it (e.g. "chef's here mornings") should be a
  quick note, not the full visit-logging flow.

**Open question for next session:** does an "attempted, chef absent" place
literally become a `prospects` row (so it renders through the exact same
blue-dot code path that already exists), or does it need to carry a bit more
state than a prospect currently does (e.g. "we've already tried once, here's
what we learned") — which might mean extending `prospects` with an
optional note/attempt-count rather than inventing a new table or pipeline
stage.

---

## 2. Re-opening the same visit to add a forgotten detail creates a "2nd visit"

**What happened:** Saved a visit, then reopened the same place shortly after
(same day) to add something forgotten — a name, a note. The system logged it
as a second visit (visit_count went up, a new `belarro_op_visit` row was
created), when really it's the same conversation being corrected/completed.

**Root cause (confirmed in code, not guessed):** `POST /api/field/locations`
always inserts a new row into `belarro_op_visit` on every save against an
existing `location_id` — there's no concept of "this is still the same visit,
just update it" vs. "this is a genuinely new visit on a different day."

**What's wanted:** Some notion of a time window (e.g., same calendar day, or
within N hours of the last visit to this location) where re-saving the form
updates the existing visit record instead of appending a new one. Needs a
product decision on:
- What's the cutoff? Same day? A rolling N-hour window?
- Should the UI make this explicit ("Editing today's visit" vs. "New visit")
  so the rep knows which mode they're in, rather than it being invisible?
- Does this affect the follow-up drip timing/seeding logic, which currently
  fires off `timestamp`/visit creation?

---

## 3. Voice-to-text for visit notes, feeding a later AI analysis pass

**What's wanted:** Instead of typing a few rushed words into the Notes field
mid-conversation (or right after, standing on the sidewalk), record voice and
have it transcribed into text automatically. Goal: richer, more complete notes
per visit ("who we met, what they said, all of it") instead of a fragment —
specifically so a later AI pass can mine these notes for patterns, objections,
follow-up cues, etc. across all visits.

**What's wanted, concretely:**
- A record button in the visit form (mobile — this is used standing outside
  a restaurant, one-handed, so needs to be fast: tap to start, tap to stop,
  no fuss).
- Transcription to text, saved into (or alongside) the existing `notes` /
  `visit_notes` field.
- Should probably keep the raw transcript as a distinct, richer text blob
  rather than just replacing the short manual notes — the manual field is
  currently also used for follow-up template matching/quick-tap
  (`saveTemplate`), so the two purposes (a short reusable note vs. a full
  conversation transcript) may want to stay separate fields.
- Needs a decision on transcription approach (on-device vs. a cloud
  speech-to-text API) and language handling (reps speak German and English
  depending on the chef).

---

## Suggested priority (not decided — for discussion)

1. **#2 (duplicate visit on same-day re-save)** — smallest, clearest fix,
   directly parallels the place_id dedup fix just shipped. Low risk.
2. **#1 (chef-not-there marker)** — needs one product decision (new field vs.
   new stage) before building, otherwise straightforward.
3. **#3 (voice-to-text)** — biggest scope: needs a transcription
   provider decision, mobile recording UX, and a call on how the transcript
   relates to existing notes fields. Should be scoped as its own mini-project
   once #1 and #2 are settled.
