'use client';

import React, { useEffect, useMemo, useState } from 'react';

interface Template {
  id: string;
  flow: 'new' | 'reengage';
  stage: number;
  language: 'en' | 'de';
  title: string;
  body: string;
  updated_at: string;
  updated_by: string | null;
}

const FLOW_LABELS: Record<string, string> = {
  new: 'New Lead',
  reengage: 'Re-Engage',
};

// New-lead: 5 stages (2h/2d/5d/14d/30d). Re-engage: 4 stages (2h/2d/5d/30d,
// no 14-day stage) — so stage 4 means something different per flow.
const STAGE_OFFSET_LABEL: Record<'new' | 'reengage', Record<number, string>> = {
  new: {
    1: '2 hours',
    2: '2 days',
    3: '5 days',
    4: '14 days',
    5: '30 days',
  },
  reengage: {
    1: '2 hours',
    2: '2 days',
    3: '5 days',
    4: '30 days',
  },
};

const SAMPLE_NAME = 'Maria';

// Same allow-list as the server — used for instant client-side feedback
// before the save round-trip confirms it.
function findInvalidPlaceholder(body: string): string | null {
  const matches = body.match(/\[([^\]]+)\]/g) || [];
  for (const m of matches) {
    const token = m.slice(1, -1);
    if (token !== 'Name') return token;
  }
  return null;
}

function TemplateCard({ template, onSaved }: { template: Template; onSaved: (t: Template) => void }) {
  const offsetLabel = STAGE_OFFSET_LABEL[template.flow][template.stage];
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dirty = title !== template.title || body !== template.body;
  const preview = body.replace(/\[Name\]/g, SAMPLE_NAME);
  const localInvalid = findInvalidPlaceholder(body);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/follow-up-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: template.id, title, body, updated_by: 'Ron' }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(true);
        onSaved({ ...template, title, body, updated_at: new Date().toISOString(), updated_by: 'Ron' });
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(json.error || 'Save failed');
      }
    } catch {
      setError('Network error — try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
          Stage {template.stage} · {offsetLabel} · {template.language.toUpperCase()}
        </span>
        {template.updated_at && (
          <span className="text-[11px] text-gray-400">
            Updated {new Date(template.updated_at).toLocaleDateString('en-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {template.updated_by ? ` by ${template.updated_by}` : ''}
          </span>
        )}
      </div>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none"
        placeholder="Title"
      />

      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono h-40 resize-y focus:ring-2 focus:ring-green-500 outline-none"
        placeholder="Message body — use [Name] as the only placeholder"
      />

      {localInvalid && (
        <p className="text-xs text-red-600 font-semibold">
          Unknown placeholder [{localInvalid}] — only [Name] is supported
        </p>
      )}

      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
        <div className="text-[10px] font-bold uppercase text-green-700 mb-1">Live preview ([Name] → {SAMPLE_NAME})</div>
        {preview}
      </div>

      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      {success && <p className="text-xs text-green-600 font-semibold">Saved.</p>}

      <button
        onClick={save}
        disabled={saving || !dirty || !!localInvalid}
        className="self-start bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-1.5 rounded-lg text-xs transition"
      >
        {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
      </button>
    </div>
  );
}

export default function TemplateEditorPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowTab, setFlowTab] = useState<'new' | 'reengage'>('new');
  const [lang, setLang] = useState<'en' | 'de'>('en');

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/follow-up-templates');
      const json = await res.json();
      if (json.success) setTemplates(json.data || []);
      else setError(json.error || 'Failed to load templates');
    } catch {
      setError('Network error loading templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleSaved = (updated: Template) => {
    setTemplates(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  };

  const filtered = useMemo(
    () => templates
      .filter(t => t.flow === flowTab && t.language === lang)
      .sort((a, b) => a.stage - b.stage),
    [templates, flowTab, lang]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Follow-up Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            All 18 templates (new-lead: 5 stages, re-engage: 4 stages, x 2 languages) — this is what actually gets sent.
          </p>
        </div>
        <a
          href="/admin/follow-ups"
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold"
        >
          ← Back to Follow-ups
        </a>
      </div>

      {/* Flow tabs */}
      <div className="flex border-b border-gray-200">
        {(['new', 'reengage'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFlowTab(f)}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition ${
              flowTab === f ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {FLOW_LABELS[f]}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1 pr-2">
          {(['en', 'de'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                lang === l ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-600 text-sm">
          Error: {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          No templates found for this flow/language. Run the seed migration
          (supabase/migrations/20260704_followup_template_table.sql).
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map(t => (
            <TemplateCard key={t.id} template={t} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </div>
  );
}
