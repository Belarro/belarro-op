'use client';

// Field visits — the places list + one-tap visit logging. Replaces the
// Sales Tracker map workflow's core loop: find the place, log what happened.
// V1 is list-first (search + GPS-aware "navigate" links into Google Maps);
// an embedded map view can layer on later without changing the data flow.

import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface Loc {
  id: string;
  location_name: string;
  business_address: string | null;
  contact_person: string | null;
  direct_phone: string | null;
  interest_level: string | null;
  pipeline_stage: string | null;
  visit_notes: string | null;
  timestamp: string | null;
}

const INTEREST_OPTIONS = ['Follow Up', 'Closed Deal', 'Not Interested'];

const STAGE_COLOR: Record<string, string> = {
  new_visit: 'bg-blue-100 text-blue-700',
  closed_won: 'bg-green-100 text-green-700',
  closed_lost: 'bg-red-100 text-red-600',
  active_customer: 'bg-green-100 text-green-700',
};

function fmtWhen(s: string | null) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function VisitForm({ loc, onClose, onSaved }: { loc: Loc | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !loc;
  const [form, setForm] = useState({
    location_name: loc?.location_name || '',
    business_address: loc?.business_address || '',
    contact_person: loc?.contact_person || '',
    direct_phone: loc?.direct_phone || '',
    notes: '',
    interest_level: loc?.interest_level || 'Follow Up',
    sample_given: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/field/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: loc?.id,
          location_name: isNew ? form.location_name : undefined,
          business_address: isNew ? form.business_address : undefined,
          contact_person: form.contact_person || undefined,
          direct_phone: form.direct_phone || undefined,
          notes: form.notes,
          interest_level: form.interest_level,
          sample_given: form.sample_given,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Failed'); return; }
      // New place → start its follow-up sequence (same flow the old
      // Sales Tracker sync used). Fire-and-forget; 409 means already seeded.
      if (isNew && json.data?.location_id) {
        fetch('/api/follow-ups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: json.data.location_id }),
        }).catch(() => {});
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <form onSubmit={save} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-3 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{isNew ? 'New place' : loc!.location_name}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 font-bold text-xl px-2">✕</button>
        </div>

        {isNew && (
          <>
            <input required placeholder="Place name" value={form.location_name}
              onChange={e => setForm(f => ({ ...f, location_name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
            <input placeholder="Address" value={form.business_address}
              onChange={e => setForm(f => ({ ...f, business_address: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
          </>
        )}

        <input placeholder="Contact person" value={form.contact_person}
          onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
        <input placeholder="Phone" type="tel" value={form.direct_phone}
          onChange={e => setForm(f => ({ ...f, direct_phone: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
        <textarea placeholder="Visit notes…" rows={3} value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />

        <div className="flex gap-2">
          {INTEREST_OPTIONS.map(opt => (
            <button key={opt} type="button" onClick={() => setForm(f => ({ ...f, interest_level: opt }))}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg border ${form.interest_level === opt ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              {opt}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.sample_given}
            onChange={e => setForm(f => ({ ...f, sample_given: e.target.checked }))}
            className="w-4 h-4 accent-green-600" />
          Sample given
        </label>

        {error && <div className="text-red-500 text-xs font-semibold">{error}</div>}

        <button type="submit" disabled={busy}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
          {busy ? 'Saving…' : 'Save visit'}
        </button>
      </form>
    </div>
  );
}

export default function FieldVisitsPage() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formLoc, setFormLoc] = useState<Loc | null | 'new'>(null as any);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/field/locations');
      const json = await res.json();
      if (json.success) setLocations(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return locations;
    const q = search.toLowerCase();
    return locations.filter(l =>
      l.location_name?.toLowerCase().includes(q) || l.business_address?.toLowerCase().includes(q)
    );
  }, [locations, search]);

  return (
    <div className="p-4 pb-8 space-y-3">
      <div className="flex gap-2">
        <input
          placeholder="Search places…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-green-500"
        />
        <button onClick={() => { setFormLoc('new'); setShowForm(true); }}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 rounded-xl text-xl">+</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(loc => (
            <div key={loc.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">{loc.location_name}</div>
                  <div className="text-xs text-gray-400 truncate">{loc.business_address || '—'}</div>
                </div>
                <div className="text-right shrink-0">
                  {loc.pipeline_stage && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLOR[loc.pipeline_stage] || 'bg-gray-100 text-gray-500'}`}>
                      {loc.pipeline_stage.replace(/_/g, ' ')}
                    </span>
                  )}
                  <div className="text-[11px] text-gray-400 mt-0.5">{fmtWhen(loc.timestamp)}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-2.5">
                <button onClick={() => { setFormLoc(loc); setShowForm(true); }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 rounded-lg">
                  Log visit
                </button>
                {loc.business_address && (
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc.business_address)}`}
                    target="_blank" rel="noreferrer"
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-lg text-center">
                    Navigate
                  </a>
                )}
                {loc.direct_phone && (
                  <a href={`tel:${loc.direct_phone}`}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-lg text-center">
                    Call
                  </a>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">No places match.</div>
          )}
        </div>
      )}

      {showForm && (
        <VisitForm
          loc={formLoc === 'new' ? null : (formLoc as Loc)}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
