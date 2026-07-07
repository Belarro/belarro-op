'use client';

// Full port of Sales Tracker's LocationPanel.jsx form fields — every field
// that existed there exists here, same options, same layout logic. Shared
// by both the Visits list and the Map (a pin/POI click opens this same
// form) so behavior can't drift between the two entry points.

import React, { useEffect, useState } from 'react';

export interface VisitFormLoc {
  id?: string;
  location_name: string;
  business_address?: string | null;
  contact_person?: string | null;
  contact_title?: string | null;
  direct_phone?: string | null;
  direct_email?: string | null;
  business_types?: string | null;
  business_website?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  interest_level?: string | null;
  language?: string | null;
  uses_microgreens?: boolean;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  direct_link?: string | null;
}

const CONTACT_ROLES = ['Owner', 'Owner/Chef', 'Head Chef', 'Sous Chef', 'Manager', 'Buyer', 'Staff'];

const BUSINESS_TYPES = [
  'Hotel', 'German', 'Italian', 'French', 'Greek', 'Spanish', 'Turkish',
  'Lebanese/Middle Eastern', 'Indian', 'Thai', 'Japanese', 'Chinese', 'Korean',
  'Vietnamese', 'Mexican', 'American', 'Russian/Eastern European', 'African',
  'Asian Fusion', 'Mediterranean', 'Seafood', 'Steakhouse', 'Salad',
  'Sandwiches', 'Bowl/Poke', 'Coffee', 'Breakfast/Brunch', 'Fine Dining',
  'Healthy Food', 'Vegan', 'Vegetarian', 'Bakery', 'Desserts', 'Fast Food',
  'Bar/Pub', 'Food Truck', 'Grocery/Market', 'Catering', 'Hotel Restaurant',
  'Canteen/Kantine', 'Other',
];

const INTEREST_LEVELS = ['Follow Up', 'Closed Deal', 'Not Interested'];
const OUTCOME_COLOR: Record<string, string> = {
  'Follow Up': '#f59e0b', 'Closed Deal': '#16a34a', 'Not Interested': '#dc2626',
};

const KNOWN_CODES = ['+972', '+44', '+43', '+49', '+1'];
function splitPhone(full: string | null | undefined) {
  if (!full) return { code: '+49', number: '' };
  const stripped = full.replace(/\s/g, '');
  for (const c of KNOWN_CODES) {
    if (stripped.startsWith(c)) {
      let number = stripped.slice(c.length);
      const digits = c.replace('+', '');
      if (number.startsWith(digits)) number = number.slice(digits.length);
      if (c === '+49' && number && !number.startsWith('0')) number = '0' + number;
      return { code: c, number };
    }
  }
  return { code: '+49', number: stripped.replace(/^\+/, '') };
}

export default function VisitForm({ loc, onClose, onSaved }: { loc: VisitFormLoc | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !loc?.id;
  const initialPhone = splitPhone(loc?.direct_phone || loc?.business_phone);

  const [form, setForm] = useState({
    location_name: loc?.location_name || '',
    business_address: loc?.business_address || '',
    contact_person: loc?.contact_person || '',
    contact_title: loc?.contact_title || '',
    email: loc?.direct_email || loc?.business_email || '',
    business_types: loc?.business_types || '',
    business_website: loc?.business_website || '',
    interest_level: loc?.interest_level || '',
    notes: '',
    sample_given: 'NO' as 'YES' | 'NO',
    uses_microgreens: !!loc?.uses_microgreens,
    language: loc?.language || 'DE',
  });
  const [phoneCode, setPhoneCode] = useState(initialPhone.code);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number);
  const [templates, setTemplates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/field/note-templates').then(r => r.json()).then(j => {
      if (j.success) setTemplates(j.data || []);
    }).catch(() => {});
  }, []);

  const buildFullPhone = () => {
    if (!phoneNumber) return '';
    const stripped = phoneNumber.replace(/^0+/, '');
    const codeDigits = phoneCode.replace('+', '');
    if (stripped.startsWith(codeDigits)) return '+' + stripped;
    return phoneCode + stripped;
  };

  const saveTemplate = async () => {
    if (!form.notes || templates.includes(form.notes)) return;
    if (!confirm('Save this as a reusable template?')) return;
    const res = await fetch('/api/field/note-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: form.notes }),
    });
    if ((await res.json()).success) setTemplates(prev => [...prev, form.notes]);
  };

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
          contact_title: form.contact_title || undefined,
          direct_phone: buildFullPhone() || undefined,
          direct_email: form.email || undefined,
          business_types: form.business_types || undefined,
          business_website: form.business_website || undefined,
          notes: form.notes,
          interest_level: form.interest_level || undefined,
          sample_given: form.sample_given === 'YES',
          uses_microgreens: form.uses_microgreens,
          language: form.language,
          // Carried through from a map click/search result so new places
          // get real coordinates instead of needing a later geocode.
          lat: isNew ? loc?.lat : undefined,
          lng: isNew ? loc?.lng : undefined,
          place_id: isNew ? loc?.place_id : undefined,
          business_website_meta: isNew ? loc?.business_website : undefined,
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
      <form onSubmit={save} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4 max-h-[90dvh] overflow-y-auto">
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

        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Contact Details</div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Name</label>
            <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
              placeholder="Full name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Title / Role</label>
            <select value={form.contact_title} onChange={e => setForm(f => ({ ...f, contact_title: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white">
              <option value="">Select role...</option>
              {CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
          <div className="flex">
            <input value={phoneCode} onChange={e => setPhoneCode(e.target.value)} placeholder="+49"
              className="w-16 shrink-0 text-center border border-gray-200 border-r-0 rounded-l-lg px-1 py-2.5 text-sm font-semibold bg-gray-50 outline-none" />
            <input
              type="tel" value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="015906442264"
              className={`flex-1 border rounded-r-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500 ${phoneNumber.length > 0 && phoneNumber.length < 8 ? 'border-red-400' : 'border-gray-200'}`}
            />
          </div>
          {phoneNumber.length > 0 && phoneNumber.length < 8 && (
            <div className="text-[11px] text-red-500 font-semibold mt-0.5">Too short</div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email address"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Business Type</label>
            <select value={form.business_types} onChange={e => setForm(f => ({ ...f, business_types: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white">
              <option value="">Select type...</option>
              {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Website</label>
            <input type="url" value={form.business_website} onChange={e => setForm(f => ({ ...f, business_website: e.target.value }))}
              placeholder="www.example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-4">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Log Visit</div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Outcome</label>
            <div className="grid grid-cols-3 gap-2">
              {INTEREST_LEVELS.map(level => {
                const active = form.interest_level === level;
                return (
                  <button key={level} type="button" onClick={() => setForm(f => ({ ...f, interest_level: level }))}
                    style={active ? { background: OUTCOME_COLOR[level], borderColor: OUTCOME_COLOR[level] } : undefined}
                    className={`text-xs font-semibold py-2.5 rounded-lg border ${active ? 'text-white' : 'bg-white text-gray-600 border-gray-200'}`}>
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            {templates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {templates.map((t, i) => (
                  <button key={i} type="button"
                    onClick={() => setForm(f => ({ ...f, notes: f.notes ? f.notes + ' ' + t : t }))}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-600">
                    + {t.length > 30 ? t.slice(0, 30) + '…' : t}
                  </button>
                ))}
              </div>
            )}
            <textarea rows={4} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="What happened? Key takeaways?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
            {form.notes && !templates.includes(form.notes) && (
              <div className="text-right mt-1">
                <button type="button" onClick={saveTemplate} className="text-xs font-semibold text-green-600">Save as template</button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Sample Given?</label>
            <div className="flex gap-2">
              {(['YES', 'NO'] as const).map(opt => (
                <button key={opt} type="button" onClick={() => setForm(f => ({ ...f, sample_given: opt }))}
                  className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border ${form.sample_given === opt ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={() => setForm(f => ({ ...f, uses_microgreens: !f.uses_microgreens }))}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-sm font-semibold ${form.uses_microgreens ? 'bg-green-50 border-green-600 text-green-700' : 'bg-white border-gray-200 text-gray-500'}`}>
            <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 ${form.uses_microgreens ? 'bg-green-600 border-green-600' : 'border-gray-300'}`}>
              {form.uses_microgreens && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
              )}
            </span>
            🌿 Already using microgreens
          </button>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Language</label>
            <div className="flex gap-2">
              {(['DE', 'EN'] as const).map(lang => (
                <button key={lang} type="button" onClick={() => setForm(f => ({ ...f, language: lang }))}
                  className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border ${form.language === lang ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {lang === 'DE' ? '🇩🇪 Deutsch' : '🇬🇧 English'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="text-red-500 text-xs font-semibold">{error}</div>}

        <button type="submit" disabled={busy}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
          {busy ? 'Saving…' : 'Save visit'}
        </button>
      </form>
    </div>
  );
}
