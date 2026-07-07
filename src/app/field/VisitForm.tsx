'use client';

// Shared visit-logging form used by both the Visits list and the Map (a pin
// or map-POI click opens the same modal). Kept in one place so behavior
// can't drift between the two entry points.

import React, { useState } from 'react';

export interface VisitFormLoc {
  id?: string;
  location_name: string;
  business_address?: string | null;
  contact_person?: string | null;
  direct_phone?: string | null;
  interest_level?: string | null;
  business_website?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  direct_link?: string | null;
}

const INTEREST_OPTIONS = ['Follow Up', 'Closed Deal', 'Not Interested'];

export default function VisitForm({ loc, onClose, onSaved }: { loc: VisitFormLoc | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !loc?.id;
  const [form, setForm] = useState({
    location_name: loc?.location_name || '',
    business_address: loc?.business_address || '',
    contact_person: loc?.contact_person || '',
    direct_phone: loc?.direct_phone || loc?.business_phone || '',
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
          // Carried through from a map click/search result so new places
          // get real coordinates instead of needing a later geocode.
          lat: isNew ? loc?.lat : undefined,
          lng: isNew ? loc?.lng : undefined,
          place_id: isNew ? loc?.place_id : undefined,
          business_website: isNew ? loc?.business_website : undefined,
          business_email: isNew ? loc?.business_email : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Failed'); return; }
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
