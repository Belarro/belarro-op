'use client';

import React, { useEffect, useState } from 'react';

interface Submission {
  id: string;
  created_at: string;
  status: 'new' | 'replied' | 'archived';
  form_type: string;
  intent: string | null;
  contact_name: string | null;
  email: string;
  phone: string | null;
  restaurant_name: string | null;
  message: string | null;
  notes: string | null;
  subject: string | null;
  interests: string[] | null;
  sample_varieties: string | null;
  delivery_address: string | null;
  preferred_days: string[] | null;
  preferred_times: string[] | null;
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('de-DE');
}

function formatFull(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-green-100 text-green-700',
  replied: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-500',
};

const INTENT_LABELS: Record<string, string> = {
  weekly: 'Weekly Setup',
  samples: 'Sample Request',
  visit: 'Book a Visit',
  inquiry: 'General Inquiry',
};

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'new' | 'start' | 'contact'>('all');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/submissions');
      const json = await res.json();
      if (json.success) setSubmissions(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch_(); }, []);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(true);
    await fetch(`/api/submissions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: status as any } : s));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: status as any } : null);
    setUpdating(false);
  };

  const delete_ = async (id: string) => {
    if (!confirm('Delete this submission?')) return;
    await fetch(`/api/submissions/${id}`, { method: 'DELETE' });
    setSubmissions(prev => prev.filter(s => s.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const filtered = submissions.filter(s => {
    if (filter === 'new') return s.status === 'new';
    if (filter === 'contact') return s.form_type === 'contact';
    if (filter === 'start') return s.form_type === 'start';
    return true;
  });

  const newCount = submissions.filter(s => s.status === 'new').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Submissions</h1>
          <p className="text-sm text-gray-500 mt-1">
            {submissions.length} total
            {newCount > 0 && <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">{newCount} new</span>}
          </p>
        </div>
        <button onClick={fetch_} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Refresh</button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {([['all', 'All'], ['new', `New${newCount > 0 ? ` (${newCount})` : ''}`], ['start', 'Start Forms'], ['contact', 'Contact']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className={`grid gap-6 ${selected ? 'grid-cols-[1fr_400px]' : 'grid-cols-1'} items-start`}>
        {/* List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No submissions found.</div>
          ) : filtered.map((s, i) => (
            <div key={s.id} onClick={() => setSelected(s)}
              className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition hover:bg-gray-50 ${selected?.id === s.id ? 'bg-gray-50' : ''} ${i < filtered.length - 1 ? 'border-b border-gray-100' : ''}`}>
              {s.status === 'new' && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-gray-900 truncate">{s.contact_name || s.email.split('@')[0]}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {s.form_type === 'contact' ? 'Contact' : (s.intent ? INTENT_LABELS[s.intent] || s.intent : s.form_type)}
                  {s.restaurant_name && ` · ${s.restaurant_name}`}
                </div>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{formatRelative(s.created_at)}</span>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="bg-white rounded-xl border border-gray-200 sticky top-6">
            <div className="p-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{selected.contact_name || 'No name'}</h2>
                <a href={`mailto:${selected.email}`} className="text-blue-600 text-sm">{selected.email}</a>
                {selected.phone && <div className="text-gray-500 text-sm mt-0.5">{selected.phone}</div>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              {selected.restaurant_name && <Field label="Restaurant" value={selected.restaurant_name} />}
              {selected.intent && <Field label="Intent" value={INTENT_LABELS[selected.intent] || selected.intent} />}
              {selected.sample_varieties && <Field label="Requested Varieties" value={selected.sample_varieties} />}
              {selected.delivery_address && <Field label="Address" value={selected.delivery_address} />}
              {selected.interests && selected.interests.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Interests</div>
                  <div className="flex flex-wrap gap-1">
                    {selected.interests.map(i => <span key={i} className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">{i}</span>)}
                  </div>
                </div>
              )}
              {selected.preferred_days && selected.preferred_days.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Preferred Days</div>
                  <div className="flex flex-wrap gap-1">
                    {selected.preferred_days.map(d => <span key={d} className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">{d}</span>)}
                  </div>
                </div>
              )}
              {(selected.message || selected.notes) && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {selected.subject ? `Subject: ${selected.subject}` : 'Message'}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-gray-700 whitespace-pre-line leading-relaxed">
                    {selected.message || selected.notes}
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-400 border-t pt-3">Received {formatFull(selected.created_at)}</div>
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-2">
              <select value={selected.status} disabled={updating}
                onChange={e => updateStatus(selected.id, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none">
                <option value="new">New</option>
                <option value="replied">Replied</option>
                <option value="archived">Archived</option>
              </select>
              <a href={`mailto:${selected.email}?subject=Re: Your Belarro inquiry`}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5">
                📧 Reply
              </a>
              <button onClick={() => delete_(selected.id)}
                className="px-3 py-2 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm transition">
                🗑
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-gray-700">{value}</div>
    </div>
  );
}
