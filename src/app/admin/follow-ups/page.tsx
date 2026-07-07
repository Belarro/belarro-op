'use client';

import React, { useEffect, useState, useMemo } from 'react';

interface FollowUp {
  id: string;
  location_id: string;
  stage: number;
  follow_up_number: number;
  flow: 'new' | 'reengage';
  total_stages: number;
  due_date: string;
  visited_at: string | null;
  status: 'pending' | 'sent' | 'completed' | 'replied';
  sent_via: string | null;
  sent_date: string | null;
  notes: string | null;
  message_title: string;
  message_text: string;
  whatsapp_number: string | null;
  location: {
    id: string;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    interest_level: string | null;
    pipeline_stage: string | null;
    language: string | null;
    sales_rep: string | null;
  };
}

// Berlin landlines: 030..., 030..., +4930... — cannot receive WhatsApp
// Mobile (WhatsApp-capable): 01..., +491..., 1...
function isLandline(phone: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/[\s\-\+\(\)]/g, '');
  // International: 4930... = Berlin landline
  if (/^4930/.test(digits)) return true;
  // Local: 030...
  if (/^030/.test(digits)) return true;
  // Any 0[2-9] area code (not 01x mobile prefix)
  if (/^0[2-9]/.test(digits)) return true;
  return false;
}

const STAGE_COLORS: Record<number, string> = {
  1: 'bg-purple-100 text-purple-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-teal-100 text-teal-700',
  4: 'bg-amber-100 text-amber-700',
  5: 'bg-rose-100 text-rose-700',
};

interface Visit {
  location_id: string;
  restaurant_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  visited_at: string;
  notes: string | null;
  interest_level: string | null;
  pipeline_stage: string | null;
  sales_rep: string | null;
}

const INTEREST_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-500',
};

// Parse "DD-MM-YYYY HH:MM" or ISO → Date
function parseVisitDate(ts: string | null): Date | null {
  if (!ts) return null;
  // Sales tracker dates are day-first: "26-06-2026 15:49" or "5/11/2025".
  // Must not fall through to new Date() for these — JS reads slashes as US
  // month-first (5/11/2025 -> May 11 instead of Nov 5).
  const m = ts.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    return new Date(
      `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] ?? '0').padStart(2, '0')}:${m[5] ?? '00'}:00`
    );
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

const STAGE_LABELS: Record<string, string> = {
  new: 'New Lead',
  active: 'Active Customer',
  snoozed: 'Snoozed',
  converted: 'Converted',
};

export default function FollowUpsPage() {
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'pending' | 'done' | 'warm' | 'visits'>('today');

  const [selected, setSelected] = useState<FollowUp | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [logForm, setLogForm] = useState({ sent_via: 'whatsapp', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState<{ followup: FollowUp; via: string } | null>(null);
  // Tracks which channels have been sent per follow-up id: { [id]: Set<'whatsapp'|'email'> }
  const [sentChannels, setSentChannels] = useState<Record<string, Set<string>>>({});

  const [convertId, setConvertId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [snoozeDays, setSnoozeDays] = useState(90);
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeSuccess, setSnoozeSuccess] = useState<string | null>(null);
  const [replying, setReplying] = useState<string | null>(null); // followup id being marked as replied
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null); // followup id being emailed
  const [emailError, setEmailError] = useState<{ id: string; msg: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FollowUp | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFollowups = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/follow-ups');
      const json = await res.json();
      if (json.success) setFollowups(json.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const [fixing, setFixing] = useState(false);
  const fixDueDates = async () => {
    setFixing(true);
    try {
      const res = await fetch('/api/follow-ups/fix-stage1', { method: 'POST' });
      const json = await res.json();
      if (json.fixed > 0) await fetchFollowups();
      alert(json.fixed > 0 ? `Moved ${json.fixed} follow-up(s) to Today.` : 'Nothing to fix — all up to date.');
    } catch {
      alert('Fix failed. Try again.');
    } finally {
      setFixing(false);
    }
  };

  const fetchVisits = async () => {
    try {
      setVisitsLoading(true);
      setVisitsError(null);
      const res = await fetch('/api/visits');
      const json = await res.json();
      if (json.success) {
        const sorted = (json.data || []).sort((a: Visit, b: Visit) =>
          (parseVisitDate(b.visited_at)?.getTime() ?? 0) - (parseVisitDate(a.visited_at)?.getTime() ?? 0)
        );
        setVisits(sorted);
      } else {
        setVisitsError(json.error || 'Failed to load visits');
      }
    } catch (err) {
      console.error(err);
      setVisitsError('Network error loading visits');
    } finally {
      setVisitsLoading(false);
    }
  };

  useEffect(() => { fetchFollowups(); }, []);

  useEffect(() => {
    if (activeTab === 'visits') fetchVisits();
  }, [activeTab]);

  const now = new Date();
  const todayStr = now.toLocaleDateString('sv'); // YYYY-MM-DD in local tz
  const dueDateStr = (f: FollowUp) => new Date(f.due_date).toLocaleDateString('sv');

  const pending = followups.filter(f => f.status === 'pending');
  // Today's Queue (spec 3.5): due_date ascending so the most overdue rows
  // surface first — this is the literal top-to-bottom daily routine.
  const today = pending
    .filter(f => dueDateStr(f) <= todayStr)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  // Upcoming: soonest due date first
  const upcoming = pending
    .filter(f => dueDateStr(f) > todayStr)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  // Warm: replied leads — they responded, waiting for manual follow-up
  const warm = followups
    .filter(f => f.status === 'replied')
    .sort((a, b) => new Date(b.sent_date ?? b.due_date).getTime() - new Date(a.sent_date ?? a.due_date).getTime());
  // History: ALL completed stages, all locations, newest first
  const done = followups
    .filter(f => f.status === 'completed' || f.status === 'sent')
    .sort((a, b) => new Date(b.sent_date ?? b.due_date).getTime() - new Date(a.sent_date ?? a.due_date).getTime());

  const displayed = activeTab === 'today' ? today : activeTab === 'pending' ? upcoming : activeTab === 'warm' ? warm : done;
  const isLocked = activeTab === 'pending'; // Upcoming tab — no sending allowed

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/follow-ups/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          sent_via: logForm.sent_via,
          notes: logForm.notes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setShowMessage(false);
        setSelected(null);
        setLogForm({ sent_via: 'whatsapp', notes: '' });
        fetchFollowups();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvertToActive = async (locationId: string) => {
    if (converting) return;
    setConverting(true);
    try {
      // Update pipeline_stage in locations table to 'active'
      const res = await fetch('/api/locations/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId }),
      });
      const json = await res.json();
      if (json.success) {
        setConvertId(null);
        fetchFollowups();
      }
    } finally {
      setConverting(false);
    }
  };

  const handleSnooze = async (locationId: string) => {
    if (snoozing) return;
    setSnoozing(true);
    try {
      const res = await fetch('/api/locations/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId, days: snoozeDays }),
      });
      const json = await res.json();
      if (json.success) {
        setSnoozeId(null);
        setSnoozeSuccess(json.wake_date);
        fetchFollowups();
        setTimeout(() => setSnoozeSuccess(null), 4000);
      }
    } finally {
      setSnoozing(false);
    }
  };

  const markChannelSent = (followup: FollowUp, via: string) => {
    const current = new Set(sentChannels[followup.id] || []);
    // include channels already persisted on the row from a previous session
    if (followup.status === 'pending' && followup.sent_via) {
      followup.sent_via.split('+').forEach(c => current.add(c));
    }
    current.add(via);
    setSentChannels(prev => ({ ...prev, [followup.id]: current }));
    setShowMessage(false);
    setSelected(null);
    // Persist so the ✓ survives reloads and blocks accidental double-sends
    fetch(`/api/follow-ups/${followup.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending', sent_via: Array.from(current).join('+') }),
    }).catch(() => {});
  };

  const autoLog = async (followup: FollowUp, via: string) => {
    await fetch(`/api/follow-ups/${followup.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', sent_via: via, notes: '' }),
    });
    setSentChannels(prev => { const n = { ...prev }; delete n[followup.id]; return n; });
    setShowMessage(false);
    setSelected(null);
    fetchFollowups();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/follow-ups/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      fetchFollowups();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const markReplied = async (followup: FollowUp) => {
    setReplying(followup.id);
    await fetch(`/api/follow-ups/${followup.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'replied', sent_via: null, notes: 'They replied — manual follow-up needed' }),
    });
    setReplying(null);
    fetchFollowups();
  };

  const openWhatsApp = (followup: FollowUp) => {
    const number = (followup.whatsapp_number || '').replace(/\D/g, '');
    const text = encodeURIComponent(followup.message_text);
    if (number) {
      window.open(`https://wa.me/${number}?text=${text}`, '_blank');
    }
    setConfirmSent({ followup, via: 'whatsapp' });
  };

  const EMAIL_SUBJECTS: Record<string, Record<number, string>> = {
    DE: {
      1: 'Belarro Microgreens - Nach unserem Gespraech heute',
      2: 'Belarro Microgreens - Kurze Nachfrage',
      3: 'Belarro Microgreens - Noch interessiert?',
      4: 'Belarro Microgreens - Letzte Nachricht von uns',
      5: 'Belarro Microgreens - Wir melden uns ein letztes Mal',
    },
    EN: {
      1: 'Belarro Microgreens - Following our conversation today',
      2: 'Belarro Microgreens - Quick follow-up',
      3: 'Belarro Microgreens - Still interested?',
      4: 'Belarro Microgreens - One last message',
      5: 'Belarro Microgreens - Final note from us',
    },
  };

  const sendEmail = async (followup: FollowUp) => {
    if (!followup.location.email) return;
    // Hard block: this stage's email was already sent (state or DB)
    const already = sentChannels[followup.id]?.has('email')
      || (followup.status === 'pending' && (followup.sent_via || '').includes('email'));
    if (already) return;
    setSendingEmail(followup.id);
    setEmailError(null);
    try {
      const isDE = (followup.location.language || '').toUpperCase() !== 'EN'; // default DE
      const lang = isDE ? 'DE' : 'EN';
      const subject = EMAIL_SUBJECTS[lang][followup.stage] || (isDE ? 'Belarro Microgreens - Nachricht' : 'Belarro Microgreens - Message');
      const res = await fetch('/api/send-followup-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followup_id: followup.id,
          to: followup.location.email,
          subject,
          body: followup.message_text,
          language: followup.location.language || 'DE',
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Mark email as sent in UI — user can still send WhatsApp before logging done
        markChannelSent(followup, 'email');
        setEmailError(null);
      } else {
        setEmailError({ id: followup.id, msg: json.error || 'Send failed' });
      }
    } catch {
      setEmailError({ id: followup.id, msg: 'Network error — try again' });
    } finally {
      setSendingEmail(null);
    }
  };

  const Card = ({ f, locked = false }: { f: FollowUp; locked?: boolean }) => {
    const isOverdue = f.status === 'pending' && new Date(f.due_date) < now;
    const restaurantName = f.location.name;
    const contactName = f.location.contact_person || f.location.name;
    const landline = isLandline(f.whatsapp_number || f.location.phone);
    const hasWhatsApp = !!(f.whatsapp_number) && !landline;
    // Merge in-memory marks with channels persisted on the row, so the
    // ✓ state survives page reloads and blocks double-sends.
    const sent = new Set<string>(sentChannels[f.id] || []);
    if (f.status === 'pending' && f.sent_via) {
      f.sent_via.split('+').forEach(c => { if (c) sent.add(c); });
    }
    const waSent = sent.has('whatsapp');
    const emailSent = sent.has('email');
    const anySent = waSent || emailSent;
    const cardEmailError = emailError && emailError.id === f.id ? emailError.msg : null;

    return (
      <div id={`card-${f.id}`} className={`bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-4 hover:shadow-md transition ${highlightId === f.id ? 'border-green-500 ring-2 ring-green-400' : isOverdue ? 'border-red-300' : 'border-gray-200'}`}>
        {/* Header */}
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="font-bold text-gray-900 text-base">{restaurantName}</div>
            {contactName && contactName !== restaurantName && (
              <div className="text-xs text-gray-500 mt-0.5">{contactName}</div>
            )}
          </div>
          <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full ${STAGE_COLORS[f.stage] || 'bg-gray-100 text-gray-600'}`}>
            {f.flow === 'reengage' ? 'Re-engage' : 'Lead'} {f.stage}/{f.total_stages || (f.flow === 'reengage' ? 4 : 5)}
          </span>
        </div>

        {/* Progress dots — new-lead: 5 dots (2h/2d/5d/2w/1m). re-engage: 4 dots (2h/2d/5d/1m) */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: f.total_stages || (f.flow === 'reengage' ? 4 : 5) }, (_, i) => i + 1).map(s => {
            const newLabels: Record<number,string> = { 1:'2h', 2:'2d', 3:'5d', 4:'2w', 5:'1m' };
            const reLabels: Record<number,string> = { 1:'2h', 2:'2d', 3:'5d', 4:'1m' };
            const label = f.flow === 'reengage' ? reLabels[s] : newLabels[s];
            return (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-1.5 rounded-full transition-all ${
                s < f.stage ? 'bg-green-500' :
                s === f.stage ? 'bg-red-500 animate-pulse' :
                'bg-gray-200'
              }`} />
              <span className="text-[9px] text-gray-400 font-medium">{label}</span>
            </div>
          );})}

        </div>

        {/* Contact info */}
        <div className="text-xs text-gray-500 space-y-1">
          {f.whatsapp_number && (
            <div>{landline ? '📞' : '💬'} {f.whatsapp_number}</div>
          )}
          {f.location.email && <div>📧 {f.location.email}</div>}
          <div className={`font-semibold ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
            Due: {new Date(f.due_date).toLocaleDateString('en-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {isOverdue && ' — Overdue'}
          </div>
          {f.location.sales_rep && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-gray-400">👤</span>
              <span className="font-semibold text-gray-700">{f.location.sales_rep}</span>
            </div>
          )}
        </div>

        {/* Previous notes */}
        {f.notes && (
          <div className="text-xs text-gray-600 italic bg-gray-50 rounded p-2">
            Last note: {f.notes}
          </div>
        )}

        {/* Actions */}
        {f.status === 'pending' && locked && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-gray-400 font-semibold bg-gray-50 rounded-lg border border-gray-200">
              🔒 Unlocks {new Date(f.due_date).toLocaleDateString('en-DE', { day: 'numeric', month: 'short' })}
            </div>
            {f.location.email && (
              <button
                onClick={() => sendEmail(f)}
                disabled={sendingEmail === f.id}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm transition flex items-center justify-center gap-1.5"
              >
                {sendingEmail === f.id ? (
                  <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /> Sending...</>
                ) : '📧 Send Email Anyway'}
              </button>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => markReplied(f)}
                disabled={replying === f.id}
                className="flex-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 font-semibold py-1.5 rounded-lg text-xs transition border border-yellow-300"
              >
                {replying === f.id ? '...' : '💬 Communicated'}
              </button>
              <button
                onClick={() => setSnoozeId(f.location_id)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold py-1.5 rounded-lg text-xs transition border border-amber-200"
              >
                Snooze
              </button>
              <button
                onClick={() => setConvertId(f.location_id)}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-1.5 rounded-lg text-xs transition border border-blue-200"
              >
                Converted
              </button>
              <button
                onClick={() => setDeleteTarget(f)}
                className="px-2 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 text-xs transition"
                title="Delete"
              >🗑</button>
            </div>
          </div>
        )}
        {f.status === 'pending' && !locked && (
          <div className="flex flex-col gap-2">
            {/* Send buttons — with checkmarks once sent */}
            <div className="flex gap-2">
              {hasWhatsApp && (
                <button
                  onClick={() => { setSelected(f); setShowMessage(true); }}
                  className={`flex-1 font-semibold py-2 rounded-lg text-sm transition flex items-center justify-center gap-1.5 ${
                    waSent
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {waSent ? '✓ WhatsApp' : '💬 WhatsApp'}
                </button>
              )}
              {f.location.email && (
                <button
                  onClick={() => sendEmail(f)}
                  disabled={sendingEmail === f.id || emailSent}
                  className={`flex-1 font-semibold py-2 rounded-lg text-sm transition flex items-center justify-center gap-1.5 ${
                    emailSent
                      ? 'bg-blue-100 text-blue-700 border border-blue-300 cursor-not-allowed'
                      : sendingEmail === f.id
                      ? 'bg-blue-400 text-white cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {emailSent ? '✓ Email sent' : sendingEmail === f.id ? (
                    <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /> Sending...</>
                  ) : '📧 Email'}
                </button>
              )}
              {!hasWhatsApp && !f.location.email && (
                <button
                  onClick={() => { setSelected(f); setShowMessage(true); }}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 rounded-lg text-sm transition"
                >
                  Copy Message
                </button>
              )}
            </div>

            {cardEmailError && (
              <p className="text-xs text-red-600 font-semibold">
                ✗ Email failed: {cardEmailError} — <a href="/admin/settings" className="underline">check Gmail connection</a>
              </p>
            )}

            {/* Done with stage — appears once at least one channel sent */}
            {anySent && (
              <button
                onClick={() => autoLog(f, Array.from(sent).join('+'))}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg text-sm transition shadow"
              >
                ✓ Done — move to next stage
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => markReplied(f)}
                disabled={replying === f.id}
                className="flex-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 font-semibold py-1.5 rounded-lg text-xs transition border border-yellow-300"
              >
                {replying === f.id ? '...' : '💬 Communicated'}
              </button>
              <button
                onClick={() => setSnoozeId(f.location_id)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold py-1.5 rounded-lg text-xs transition border border-amber-200"
              >
                Snooze
              </button>
              <button
                onClick={() => setConvertId(f.location_id)}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-1.5 rounded-lg text-xs transition border border-blue-200"
              >
                Converted
              </button>
              <button
                onClick={() => setDeleteTarget(f)}
                className="px-2 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 text-xs transition"
                title="Delete"
              >🗑</button>
            </div>
            <button
              onClick={() => { setSelected(f); setShowModal(true); }}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-1.5 rounded-lg text-xs transition"
            >
              Manual Log
            </button>
          </div>
        )}

        {f.status === 'replied' && (
          <div className="flex flex-col gap-2">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800 font-semibold flex items-center gap-2">
              💬 Communicated — handle personally
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => autoLog(f, 'manual')}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-1.5 rounded-lg text-xs transition"
              >
                ▶ Resume
              </button>
              <button
                onClick={() => setSnoozeId(f.location_id)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold py-1.5 rounded-lg text-xs transition border border-amber-200"
              >
                Snooze
              </button>
              <button
                onClick={() => setConvertId(f.location_id)}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-1.5 rounded-lg text-xs transition border border-blue-200"
              >
                Converted
              </button>
              <button
                onClick={() => setDeleteTarget(f)}
                className="px-2 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 text-xs transition"
                title="Delete"
              >🗑</button>
            </div>
          </div>
        )}
        {(f.status === 'completed' || f.status === 'sent') && (
          <div className="text-[11px] text-gray-400 font-semibold uppercase flex justify-between border-t pt-2">
            <span>Via: {f.sent_via || '—'}</span>
            <span>{f.sent_date ? new Date(f.sent_date).toLocaleDateString() : '—'}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Follow-ups</h1>
          <p className="text-sm text-gray-500 mt-1">Your daily sales calls — leads only</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin/follow-ups/templates"
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold"
          >
            ✏️ Templates
          </a>
          <button
            onClick={fixDueDates}
            disabled={fixing}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {fixing ? 'Fixing...' : 'Fix Due Dates'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'today', label: `Today (${today.length})`, urgent: today.length > 0 },
          { key: 'pending', label: `Upcoming (${upcoming.length})` },
          { key: 'warm', label: `Warm (${warm.length})`, urgent: warm.length > 0 },
          { key: 'done', label: `History (${done.length})` },
          { key: 'visits', label: 'Visits' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === t.key
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            } ${'urgent' in t && t.urgent && activeTab !== t.key ? 'text-red-600' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Visits tab */}
      {activeTab === 'visits' && (
        visitsLoading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : visitsError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-600 text-sm">
            Error: {visitsError}
          </div>
        ) : visits.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            No visits recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Restaurant</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Rep</th>
                  <th className="px-4 py-3">Visited</th>
                  <th className="px-4 py-3">Interest</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visits.map(v => (
                  <tr
                    key={v.location_id}
                    className="hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => {
                      const match = followups.find(f => f.location_id === v.location_id && (f.status === 'pending' || f.status === 'replied'));
                      if (match) {
                        const tab = match.status === 'replied' ? 'warm' : new Date(match.due_date).toLocaleDateString('sv') <= todayStr ? 'today' : 'pending';
                        setActiveTab(tab as any);
                        setHighlightId(match.id);
                        setTimeout(() => {
                          document.getElementById(`card-${match.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setTimeout(() => setHighlightId(null), 2000);
                        }, 150);
                      }
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{v.restaurant_name}</div>
                      {v.phone && <div className="text-xs text-gray-400 mt-0.5">{v.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{v.contact_person || '—'}</div>
                      {v.email && <div className="text-xs text-gray-400 mt-0.5">{v.email}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {v.sales_rep ? (
                        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{v.sales_rep}</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {parseVisitDate(v.visited_at)
                        ? parseVisitDate(v.visited_at)!.toLocaleDateString('en-DE', { day: 'numeric', month: 'short', year: 'numeric' })
                        : v.visited_at || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {v.interest_level ? (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${INTEREST_COLORS[v.interest_level.toLowerCase()] || 'bg-gray-100 text-gray-500'}`}>
                          {v.interest_level}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {v.pipeline_stage ? (
                        <span className="text-xs text-gray-600 capitalize">
                          {STAGE_LABELS[v.pipeline_stage] || v.pipeline_stage}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-xs text-gray-500 line-clamp-2">{v.notes || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Follow-ups content */}
      {activeTab !== 'visits' && (
        loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          {activeTab === 'today' ? 'Nothing due today. Check Upcoming.' : 'Nothing here.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayed.map(f => <Card key={f.id} f={f} locked={isLocked} />)}
        </div>
      ))}

      {/* Message Modal — shows pre-written WhatsApp message */}
      {showMessage && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selected.message_title}</h2>
                <p className="text-xs text-gray-500">{selected.location.name}</p>
              </div>
              <button onClick={() => { setShowMessage(false); setSelected(null); }} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Message preview */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                {selected.message_text}
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => navigator.clipboard.writeText(selected.message_text)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg text-sm transition"
                >
                  Copy
                </button>
                {selected.whatsapp_number && !isLandline(selected.whatsapp_number || selected.location.phone) && (
                  <button
                    onClick={() => openWhatsApp(selected)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg text-sm transition"
                  >
                    💬 WhatsApp ↗
                  </button>
                )}
                {selected.location.email && (
                  <button
                    onClick={() => sendEmail(selected)}
                    disabled={sendingEmail === selected.id}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm transition flex items-center justify-center gap-1.5"
                  >
                    {sendingEmail === selected.id ? (
                      <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /> Sending...</>
                    ) : '📧 Send Email'}
                  </button>
                )}
                {emailError && (
                  <p className="text-xs text-red-600 font-semibold mt-1">{emailError.msg} — <a href="/admin/settings" className="underline">Check Gmail connection</a></p>
                )}
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 mb-3">After sending, log it as done:</p>
                <div className="flex gap-2">
                  <select
                    value={logForm.sent_via}
                    onChange={e => setLogForm({ ...logForm, sent_via: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  >
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="email">📧 Email</option>
                    <option value="call">📞 Call</option>
                    <option value="visit">📍 Visit</option>
                  </select>
                  <button
                    onClick={handleLog as any}
                    disabled={submitting}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm"
                  >
                    {submitting ? 'Saving...' : 'Mark Sent'}
                  </button>
                </div>
                <textarea
                  value={logForm.notes}
                  onChange={e => setLogForm({ ...logForm, notes: e.target.value })}
                  placeholder="Any notes? (optional)"
                  className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none h-16 resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Contact Modal (for non-WhatsApp logging) */}
      {showModal && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Log Contact</h2>
              <button onClick={() => { setShowModal(false); setSelected(null); }} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleLog} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">How did you contact them?</label>
                <select
                  value={logForm.sent_via}
                  onChange={e => setLogForm({ ...logForm, sent_via: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                >
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="email">📧 Email</option>
                  <option value="call">📞 Call</option>
                  <option value="visit">📍 Visit</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (what did they say?)</label>
                <textarea
                  value={logForm.notes}
                  onChange={e => setLogForm({ ...logForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none h-24 resize-none"
                  placeholder="e.g. Chef loved the radish, wants to try sunflower next."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setSelected(null); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm shadow">
                  {submitting ? 'Saving...' : 'Mark Done'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Did you send it? confirmation */}
      {confirmSent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Did you send it?</h2>
            <p className="text-sm text-gray-500 mb-6">
              {confirmSent.via === 'whatsapp' ? '💬 WhatsApp' : '📧 Email'} opened for <strong>{confirmSent.followup.location.name}</strong>. Confirm only if you actually sent it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSent(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 rounded-lg text-sm"
              >
                No, I didn't send
              </button>
              <button
                onClick={() => {
                  markChannelSent(confirmSent.followup, confirmSent.via);
                  setConfirmSent(null);
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg text-sm shadow"
              >
                Yes, Sent!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snooze confirmation */}
      {snoozeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Not interested right now?</h2>
            <p className="text-sm text-gray-600 mb-4">Pause all follow-ups and remind you again in:</p>
            <div className="flex gap-2 mb-6">
              {[30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setSnoozeDays(d)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${snoozeDays === d ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400'}`}
                >
                  {d} days
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSnoozeId(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg text-sm">
                Cancel
              </button>
              <button
                onClick={() => handleSnooze(snoozeId)}
                disabled={snoozing}
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {snoozing ? 'Saving...' : `Snooze ${snoozeDays} days`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snooze success toast */}
      {snoozeSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-xl z-50">
          Snoozed — will reappear on {new Date(snoozeSuccess).toLocaleDateString('en-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-red-600 mb-2">Remove this lead?</h2>
            <p className="text-sm text-gray-600 mb-6">
              Archives <strong>{deleteTarget.location.name}</strong> and skips all its follow-ups. It disappears from every list but stays recoverable in the database.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg text-sm">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Active confirmation */}
      {convertId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Mark as Converted?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This marks them as an active customer and closes all pending follow-ups. Use this when they confirmed they want to order from you.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConvertId(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg text-sm">
                Cancel
              </button>
              <button
                onClick={() => handleConvertToActive(convertId)}
                disabled={converting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {converting ? 'Converting...' : 'Yes, Converted'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
