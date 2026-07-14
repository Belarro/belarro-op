'use client';

// Full port of Sales Tracker's LocationPanel.jsx — contact/visit fields,
// follow-up date snapping+presets, visit history, pipeline stage badge,
// quick-send message preview, and archive/delete. Shared by the Visits
// list and the Map (a pin/POI click opens this same form).

import React, { useEffect, useState } from 'react';
import { calculateSnappedFollowUpDate, toISODateString } from './dateUtils';
import { getPinColor, getColorLabel } from './colorUtils';
import { getFollowUpMessage, getStageLabel, FollowUpMessage } from './followUpTemplates';

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
  pipeline_stage?: string | null;
  language?: string | null;
  uses_microgreens?: boolean;
  pin_color?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  direct_link?: string | null;
}

interface VisitHistoryRow {
  visit_date: string;
  sales_rep: string | null;
  notes: string | null;
  sample_given: boolean;
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

const STAGE_MAP: Record<string, { label: string; color: string }> = {
  new_visit: { label: 'New Visit', color: '#9e9e9e' },
  follow_up_1: { label: 'Follow-up 1', color: '#ffc107' },
  follow_up_2: { label: 'Follow-up 2', color: '#ffa000' },
  follow_up_3: { label: 'Follow-up 3', color: '#ff8f00' },
  follow_up_4: { label: 'Follow-up 4', color: '#ff6f00' },
  order_confirmed: { label: 'Order Confirmed', color: '#2196F3' },
  delivery_reminder: { label: 'Delivery', color: '#1976D2' },
  post_delivery: { label: 'Post-Delivery', color: '#1565C0' },
  active_customer: { label: 'Active Customer', color: '#4caf50' },
  inactive: { label: 'Inactive', color: '#757575' },
  closed_won: { label: 'Won', color: '#2e7d32' },
  closed_lost: { label: 'Lost', color: '#c62828' },
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

function fmtHistoryDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function VisitForm({ loc, onClose, onSaved }: { loc: VisitFormLoc | null; onClose: (savedLoc?: { id: string; lat?: number | null; lng?: number | null }) => void; onSaved: () => void }) {
  const isNew = !loc?.id;
  // Mobile field must start blank for a new place — Ron wants to type the
  // contact's actual mobile number, not have the restaurant's Google-listed
  // business/landline number auto-fill it. Only an existing location's own
  // saved direct_phone (their real mobile) pre-fills the field.
  const initialPhone = splitPhone(loc?.direct_phone || '');

  const [form, setForm] = useState({
    location_name: loc?.location_name || '',
    business_address: loc?.business_address || '',
    contact_person: loc?.contact_person || '',
    contact_title: loc?.contact_title || '',
    email: loc?.direct_email || loc?.business_email || '',
    business_types: loc?.business_types || '',
    business_website: loc?.business_website || '',
    interest_level: loc?.interest_level || 'Follow Up',
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

  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [savedLocId, setSavedLocId] = useState<string | undefined>(loc?.id);
  const [pipelineStage, setPipelineStage] = useState(loc?.pipeline_stage || 'new_visit');
  const [followUpMsg, setFollowUpMsg] = useState<FollowUpMessage | null>(null);
  const [awaitingSentConfirm, setAwaitingSentConfirm] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);

  const [history, setHistory] = useState<VisitHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<'archive' | 'delete' | null>(null);

  // Lazy-load visit history for an existing location.
  useEffect(() => {
    if (!loc?.id) return;
    setHistoryLoading(true);
    fetch(`/api/field/locations?history=${loc.id}`).then(r => r.json()).then(j => {
      if (j.success) setHistory(j.data || []);
    }).catch(() => {}).finally(() => setHistoryLoading(false));
  }, [loc?.id]);

  useEffect(() => {
    fetch('/api/field/note-templates').then(r => r.json()).then(j => {
      if (j.success) setTemplates(j.data || []);
    }).catch(() => {});
  }, []);

  // Build the quick-send message as soon as the visit is saved.
  useEffect(() => {
    if (!savedSuccessfully) return;
    if (pipelineStage === 'closed_won' || pipelineStage === 'closed_lost') return;
    const msg = getFollowUpMessage({
      location_name: form.location_name || loc?.location_name,
      contact_person: form.contact_person || 'there',
      contact_title: form.contact_title,
      pipeline_stage: pipelineStage,
      language: form.language,
      direct_phone: buildFullPhone() || loc?.direct_phone,
      business_phone: loc?.business_phone,
    });
    setFollowUpMsg(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSuccessfully]);

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
          pipeline_stage: pipelineStage,
          sample_given: form.sample_given === 'YES',
          uses_microgreens: form.uses_microgreens,
          language: form.language,
          // Carried through from a map click/search result so new places
          // get real coordinates instead of needing a later geocode.
          lat: isNew ? loc?.lat : undefined,
          lng: isNew ? loc?.lng : undefined,
          place_id: isNew ? loc?.place_id : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Failed'); return; }
      const newLocId = json.data?.location_id || loc?.id;
      setSavedLocId(newLocId);
      if (isNew && newLocId) {
        fetch('/api/follow-ups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: newLocId }),
        }).catch(() => {});
      }
      setSavedSuccessfully(true);
    } finally {
      setBusy(false);
    }
  };

  const confirmSent = async () => {
    if (!followUpMsg || !savedLocId) return;
    setMarkingSent(true);
    try {
      const nextStage = followUpMsg.nextStage || pipelineStage;
      const nextDateISO = followUpMsg.nextActionDays ? calculateSnappedFollowUpDate(followUpMsg.nextActionDays) : '';
      const todayISO = toISODateString(new Date());
      const logEntry = `[${todayISO}] ${followUpMsg.stage.replace(/_/g, ' ')} sent → next: ${(followUpMsg.nextStage || '').replace(/_/g, ' ') || 'done'} on ${nextDateISO || 'n/a'}`;

      await fetch('/api/field/locations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: savedLocId,
          pipeline_stage: nextStage,
          last_follow_up_date: todayISO,
          next_action_date: nextDateISO || null,
          next_action_type: followUpMsg.nextActionType || null,
          automation_status: 'sent',
          append_log_entry: logEntry,
        }),
      });
      setPipelineStage(nextStage);
      setFollowUpMsg(null);
      setAwaitingSentConfirm(false);
      onSaved();
    } finally {
      setMarkingSent(false);
    }
  };

  const openWhatsApp = () => {
    if (!followUpMsg?.body) return;
    navigator.clipboard?.writeText(followUpMsg.body).catch(() => {});
    if (followUpMsg.waLink) window.open(followUpMsg.waLink, '_blank');
  };

  const openEmail = async () => {
    if (!followUpMsg) return;
    const to = form.email || loc?.direct_email || loc?.business_email || '';
    const subject = followUpMsg.emailSubject || `Belarro — ${form.location_name || loc?.location_name || ''}`;
    const emailBody = followUpMsg.emailBody || followUpMsg.body;
    try {
      const res = await fetch('/api/send-followup-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body: emailBody }),
      });
      if (!(await res.json()).success) throw new Error('send failed');
    } catch {
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    }
  };

  // If a visit was saved this session, hand the location back to the map so
  // it can re-center/zoom on the pin instead of resetting to GPS/last view.
  const handleClose = () => {
    if (savedSuccessfully && savedLocId) {
      onClose({ id: savedLocId, lat: loc?.lat, lng: loc?.lng });
    } else {
      onClose();
    }
  };

  const doArchive = async () => {
    if (!savedLocId && !loc?.id) return;
    setBusy(true);
    try {
      await fetch('/api/field/locations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: savedLocId || loc?.id, archived: 'YES' }),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const stage = STAGE_MAP[pipelineStage] || STAGE_MAP.new_visit;
  const pinColor = !isNew ? getPinColor({ pin_color: loc?.pin_color, interest_level: form.interest_level || loc?.interest_level, sample_given: form.sample_given }) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-gray-900">{isNew ? 'New place' : loc!.location_name}</h2>
              {!isNew && (
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white" style={{ background: stage.color }}>
                    {stage.label}
                  </span>
                  {pinColor && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: `${pinColor}25`, border: `1.5px solid ${pinColor}60`, color: '#1f2937' }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: pinColor }} />
                      {getColorLabel(pinColor)}
                    </span>
                  )}
                  {loc?.business_address && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc.business_address)}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs font-semibold text-blue-600 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200">
                      📍 Open in Maps
                    </a>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={handleClose} className="text-gray-400 font-bold text-xl px-2 shrink-0">✕</button>
          </div>

          <form onSubmit={save} className="space-y-4">
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
              {busy ? 'Saving…' : savedSuccessfully ? 'Update Visit' : 'Save Visit'}
            </button>
          </form>

          {/* ── QUICK-SEND FOLLOW-UP (P0-2) ───────────────────────────── */}
          {savedSuccessfully && pipelineStage !== 'closed_won' && pipelineStage !== 'closed_lost' && (
            <div className="border-t border-gray-100 pt-4">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Follow-up Message</div>
              <div className="text-xs text-gray-500 mb-2">{getStageLabel(pipelineStage)}</div>

              {followUpMsg ? (
                <div className="space-y-2">
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto text-gray-800">
                    {followUpMsg.body}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Language: {followUpMsg.lang} · Stage: {followUpMsg.stage}
                    {followUpMsg.nextStage && ` → Next: ${getStageLabel(followUpMsg.nextStage)}`}
                  </div>

                  {!followUpMsg.waLink && !(form.email || loc?.direct_email) ? (
                    <div className="text-center text-gray-400 text-sm py-3 bg-gray-50 rounded-lg">No phone or email — add one above</div>
                  ) : (
                    <div className="space-y-2">
                      <button type="button" onClick={() => navigator.clipboard?.writeText(followUpMsg.body)}
                        className="w-full py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700">
                        Copy Message
                      </button>
                      {!awaitingSentConfirm ? (
                        <div className="flex flex-wrap gap-2">
                          {followUpMsg.waLink && (
                            <button type="button" onClick={() => { openWhatsApp(); setAwaitingSentConfirm(true); }}
                              className="flex-1 min-w-[110px] py-3 rounded-lg text-white font-bold text-sm" style={{ background: '#25D366' }}>
                              Send WhatsApp
                            </button>
                          )}
                          {(form.email || loc?.direct_email) && (
                            <button type="button" onClick={() => { openEmail(); setAwaitingSentConfirm(true); }}
                              className="flex-1 min-w-[110px] py-3 rounded-lg text-white font-bold text-sm" style={{ background: '#4285F4' }}>
                              Send Email
                            </button>
                          )}
                          <button type="button" onClick={() => setFollowUpMsg(null)}
                            className="px-4 py-3 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-gray-900 text-center">Did you send the message?</div>
                          <div className="flex gap-2">
                            <button type="button" disabled={markingSent} onClick={confirmSent}
                              className="flex-1 py-3 rounded-lg text-white font-bold text-sm disabled:opacity-50" style={{ background: '#25D366' }}>
                              {markingSent ? 'Saving…' : 'Yes, sent'}
                            </button>
                            <button type="button" onClick={() => setAwaitingSentConfirm(false)}
                              className="flex-1 py-3 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">
                              Not sent
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-400 text-sm">No template available for this stage.</div>
              )}
            </div>
          )}

          {/* ── VISIT HISTORY (P0-6) ──────────────────────────────────── */}
          {!isNew && (
            <div className="border-t border-gray-100 pt-4">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Visit History</div>
              {historyLoading ? (
                <div className="text-gray-400 text-sm">Loading…</div>
              ) : history.length === 0 ? (
                <div className="text-gray-400 text-sm">No visits recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {history.slice(0, 8).map((v, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-900">{fmtHistoryDate(v.visit_date)}</span>
                        <span className="text-xs text-gray-400">
                          {v.sales_rep || ''}
                          {v.sample_given && <span className="ml-1.5 bg-green-100 text-green-700 rounded px-1.5 py-0.5 text-[10px] font-semibold">Sample</span>}
                        </span>
                      </div>
                      {v.notes && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{v.notes}</div>}
                    </div>
                  ))}
                  {history.length > 8 && (
                    <div className="text-xs text-gray-400 text-center">+{history.length - 8} earlier visits</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── MANAGE: ARCHIVE / DELETE (P0-3) ───────────────────────── */}
          {!isNew && (
            <div className="border-t border-gray-100 pt-4">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Manage</div>
              {showArchiveConfirm ? (
                <div className="space-y-2">
                  <div className="text-sm text-gray-700 text-center">
                    {showArchiveConfirm === 'delete' ? 'Remove this place? It will be hidden everywhere.' : 'Archive this place?'}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={doArchive}
                      className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
                      Confirm
                    </button>
                    <button type="button" onClick={() => setShowArchiveConfirm(null)}
                      className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowArchiveConfirm('archive')}
                    className="flex-1 py-2.5 rounded-lg border text-sm font-semibold" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
                    Archive
                  </button>
                  <button type="button" onClick={() => setShowArchiveConfirm('delete')}
                    className="flex-1 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-semibold">
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
