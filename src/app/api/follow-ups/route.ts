import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { isOldLead } from '@/lib/followups';
// import removed

// ─── TEMPLATES ───────────────────────────────────────────────────────────────
// Source of truth is now the belarro_v4_followup_template DB table (Part 3 of
// FOLLOWUP_SYSTEM_SPEC.md), not hardcoded objects. Loaded once per request and
// cached in-memory — no need for heavier caching at current volume (~150 msgs/week).

type TemplateRow = { flow: string; stage: number; language: string; title: string; body: string };

let templateCache: Map<string, TemplateRow> | null = null;

async function loadTemplates(): Promise<Map<string, TemplateRow>> {
  if (templateCache) return templateCache;
  const rows: TemplateRow[] = await fetchFromSupabase('/belarro_v4_followup_template?select=flow,stage,language,title,body');
  const map = new Map<string, TemplateRow>();
  for (const r of rows || []) {
    map.set(`${r.flow}:${r.stage}:${r.language}`, r);
  }
  templateCache = map;
  return map;
}

// Only [Name] is a supported placeholder. Validated on read as a defense in
// depth (also validated on save in /api/follow-up-templates) so an unfilled
// bracket token — the exact class of bug that shipped literal "[Restaurant]"
// to a real chef — never reaches a send.
function assertNoUnknownPlaceholders(text: string): void {
  const matches = text.match(/\[([^\]]+)\]/g) || [];
  for (const m of matches) {
    if (m !== '[Name]') {
      console.error(`Follow-up template has unsupported placeholder ${m} — shipping without substitution would repeat the [Restaurant] bug.`);
    }
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function buildMessage(flow: 'new' | 'reengage', stage: number, lang: string, contactName: string): Promise<{ title: string; text: string }> {
  const name = contactName || 'there';
  const isEN = lang === 'en';
  const language = isEN ? 'en' : 'de';
  const templates = await loadTemplates();

  const key = `${flow}:${stage}:${language}`;
  const fallbackKey = `${flow}:1:${language}`;
  const msg = templates.get(key) || templates.get(fallbackKey);

  if (!msg) {
    // No templates seeded yet — fail loudly rather than shipping blank/garbled text.
    throw new Error(`No follow-up template found for flow=${flow} stage=${stage} language=${language}`);
  }

  assertNoUnknownPlaceholders(msg.body);
  return { title: msg.title, text: msg.body.replace(/\[Name\]/g, name) };
}

function parsePhone(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/\s+/g, '').replace(/^00/, '+');
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

    const followups = await fetchFromSupabase(
      '/belarro_v4_follow_up?location_id=not.is.null&select=*&status=neq.skipped&order=due_date.asc'
    );
    const fls = followups || [];
    if (fls.length === 0) return NextResponse.json({ success: true, data: [] });

    const locationIds = [...new Set(fls.map((f: any) => f.location_id))];
    const idFilter = locationIds.map((id: any) => `id.eq.${id}`).join(',');
    const locations = await fetchFromSupabase(
      `/locations?or=(${idFilter})&archived=neq.YES&select=id,location_name,contact_person,direct_phone,business_phone,direct_email,business_email,language,visit_notes,pipeline_stage,interest_level,timestamp,created_at,sales_rep`
    );
    const locMap = new Map<string, any>((locations || []).map((l: any) => [l.id, l]));

    // Stages where follow-ups must stop: became a client (active/closed_won),
    // explicitly lost, or snoozed. Set either in the admin (convert button)
    // or in the sales tracker (closed_won/closed_lost).
    const STOPPED_STAGES = new Set(['active', 'snoozed', 'closed_won', 'closed_lost', 'converted']);

    // Only keep next pending follow-up per location
    const nextPerLocation = new Map<string, any>();
    for (const f of fls) {
      const loc = locMap.get(f.location_id);
      if (!loc) continue;
      if (STOPPED_STAGES.has(loc.pipeline_stage)) continue;
      if (f.status !== 'pending' && f.status !== 'replied') continue;
      const stage = f.stage || f.follow_up_number || 1;
      const existing = nextPerLocation.get(f.location_id);
      if (!existing || stage < (existing.stage || existing.follow_up_number || 1)) {
        nextPerLocation.set(f.location_id, { ...f, stage });
      }
    }

    const hydratedUnsorted = await Promise.all(Array.from(nextPerLocation.values()).map(async (f: any) => {
      const loc = locMap.get(f.location_id) || {};
      const contactName = loc.contact_person || loc.location_name || 'there';
      const phone = parsePhone(loc.direct_phone) || parsePhone(loc.business_phone);
      const lang = (loc.language || '').toLowerCase().trim();
      const flow: 'new' | 'reengage' = isOldLead(loc.timestamp, loc.created_at) ? 'reengage' : 'new';
      const totalStages = flow === 'reengage' ? 4 : 5; // new-lead: 2h/2d/5d/14d/30d (5). re-engage: 2h/2d/5d/30d (4, no 14d stage)
      const { title, text } = await buildMessage(flow, f.stage, lang, contactName);

      return {
        ...f,
        flow,
        total_stages: totalStages,
        message_title: title,
        message_text: text,
        whatsapp_number: phone,
        visited_at: loc.timestamp || loc.created_at || null,
        location: {
          id: loc.id,
          name: loc.location_name,
          contact_person: loc.contact_person,
          phone,
          email: loc.direct_email || loc.business_email,
          interest_level: loc.interest_level,
          pipeline_stage: loc.pipeline_stage,
          language: lang,
          sales_rep: loc.sales_rep || null,
        },
      };
    }));
    const hydrated = hydratedUnsorted.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    // All completed stages for History tab — only ones actually sent (have sent_date or sent_via)
    const completedRows = fls.filter((f: any) =>
      (f.status === 'completed' || f.status === 'sent') &&
      locMap.has(f.location_id) &&
      (f.sent_date || f.sent_via)
    );

    const completed = await Promise.all(completedRows.map(async (f: any) => {
      const loc = locMap.get(f.location_id) || {};
      const lang = (loc.language || '').toLowerCase().trim();
      const flow: 'new' | 'reengage' = isOldLead(loc.timestamp, loc.created_at) ? 'reengage' : 'new';
      const { title, text } = await buildMessage(flow, f.stage, lang, loc.contact_person || loc.location_name);
      return {
        ...f,
        flow,
        total_stages: flow === 'reengage' ? 4 : 5, // new-lead: 5 stages. re-engage: 4 stages (no 14d stage)
        message_title: title,
        message_text: text,
        whatsapp_number: parsePhone(loc.direct_phone) || parsePhone(loc.business_phone),
        visited_at: loc.timestamp || loc.created_at || null,
        location: {
          id: loc.id,
          name: loc.location_name,
          contact_person: loc.contact_person,
          phone: parsePhone(loc.direct_phone) || parsePhone(loc.business_phone),
          email: loc.direct_email || loc.business_email,
          interest_level: loc.interest_level,
          pipeline_stage: loc.pipeline_stage,
          language: lang,
        },
      };
    }));

    return NextResponse.json({ success: true, data: [...hydrated, ...completed] });
  } catch (error) {
    console.error('Followups GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const { location_id, visited_at } = await request.json();
    if (!location_id) return NextResponse.json({ success: false, error: 'location_id required' }, { status: 400 });

    const existing = await fetchFromSupabase(
      `/belarro_v4_follow_up?location_id=eq.${location_id}&status=eq.pending&select=id&limit=1`
    );
    if (existing && existing.length > 0) {
      return NextResponse.json({ success: false, error: 'Follow-ups already exist' }, { status: 409 });
    }

    const base = new Date(visited_at || new Date()).getTime();
    const old = isOldLead(visited_at, null);

    // New-lead: 5 stages at 2h/2d/5d/14d/30d. Re-engage: 4 stages at
    // 2h/2d/5d/30d — the 14-day stage is dropped entirely (not left blank).
    // Re-engage is measured from now (send time), not from the old visit date.
    const stages = old ? [
      { stage: 1, follow_up_number: 1, follow_up_days: 0,  offset: 2 * 60 * 60 * 1000 },
      { stage: 2, follow_up_number: 2, follow_up_days: 2,  offset: 2  * 24 * 60 * 60 * 1000 },
      { stage: 3, follow_up_number: 3, follow_up_days: 5,  offset: 5  * 24 * 60 * 60 * 1000 },
      { stage: 4, follow_up_number: 4, follow_up_days: 30, offset: 30 * 24 * 60 * 60 * 1000 },
    ] : [
      { stage: 1, follow_up_number: 1, follow_up_days: 0,  offset: 2 * 60 * 60 * 1000 },
      { stage: 2, follow_up_number: 2, follow_up_days: 2,  offset: 2  * 24 * 60 * 60 * 1000 },
      { stage: 3, follow_up_number: 3, follow_up_days: 5,  offset: 5  * 24 * 60 * 60 * 1000 },
      { stage: 4, follow_up_number: 4, follow_up_days: 14, offset: 14 * 24 * 60 * 60 * 1000 },
      { stage: 5, follow_up_number: 5, follow_up_days: 30, offset: 30 * 24 * 60 * 60 * 1000 },
    ];

    for (const s of stages) {
      await fetchFromSupabase('/belarro_v4_follow_up', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          location_id,
          follow_up_number: s.follow_up_number,
          follow_up_days: s.follow_up_days,
          stage: s.stage,
          due_date: new Date(base + s.offset).toISOString(),
          status: 'pending',
        }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
