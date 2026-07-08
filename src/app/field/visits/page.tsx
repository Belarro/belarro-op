'use client';

// Field visits — searchable list view of the same places shown on the Map.
// Complements the map for quick text search / call / navigate without
// needing to find the pin first.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import VisitForm, { VisitFormLoc } from '../VisitForm';

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

export default function FieldVisitsPage() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formLoc, setFormLoc] = useState<VisitFormLoc | null>(null);
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
        <button onClick={() => { setFormLoc({ location_name: '' }); setShowForm(true); }}
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
          loc={formLoc}
          onClose={() => { setShowForm(false); load(); }}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}
