'use client';

// Field follow-ups — today's due list with one-tap WhatsApp + mark sent.
// Same data and API as the admin Follow-ups page; this is just the
// on-the-road version.

import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface FollowUp {
  id: string;
  stage: number;
  total_stages: number;
  status: string;
  due_date: string;
  flow: 'new' | 'reengage';
  message_title: string;
  message_text: string;
  whatsapp_number: string | null;
  location: {
    id: string;
    name: string;
    contact_person: string | null;
    phone: string | null;
  };
}

function dueBucket(dueDate: string): 'overdue' | 'today' | 'upcoming' {
  const todayStr = new Date().toLocaleDateString('sv');
  const dueStr = new Date(dueDate).toLocaleDateString('sv');
  if (dueStr < todayStr) return 'overdue';
  if (dueStr === todayStr) return 'today';
  return 'upcoming';
}

export default function FieldFollowupsPage() {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/follow-ups');
      const json = await res.json();
      if (json.success) {
        setItems((json.data || []).filter((f: FollowUp) => f.status === 'pending'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const overdue = items.filter(f => dueBucket(f.due_date) === 'overdue');
    const today = items.filter(f => dueBucket(f.due_date) === 'today');
    return { overdue, today, dueNow: [...overdue, ...today] };
  }, [items]);

  const markSent = async (f: FollowUp, via: string) => {
    setBusyId(f.id);
    try {
      await fetch(`/api/follow-ups/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', sent_via: via }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 pb-8 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-gray-900">Follow-ups due</h1>
        <span className="text-xs font-semibold text-gray-400">{grouped.dueNow.length} pending</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
      ) : grouped.dueNow.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Nothing due. 🎉</div>
      ) : (
        grouped.dueNow.map(f => {
          const overdue = dueBucket(f.due_date) === 'overdue';
          const wa = f.whatsapp_number
            ? `https://wa.me/${f.whatsapp_number.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(f.message_text)}`
            : null;
          return (
            <div key={f.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">{f.location.name}</div>
                  <div className="text-xs text-gray-400">
                    {f.location.contact_person || '—'} · stage {f.stage}/{f.total_stages} · {f.flow === 'reengage' ? 're-engage' : 'new lead'}
                  </div>
                </div>
                {overdue && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full shrink-0">OVERDUE</span>}
              </div>

              <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 whitespace-pre-wrap line-clamp-4">
                {f.message_text}
              </div>

              <div className="flex gap-2 mt-2.5">
                {wa ? (
                  <a href={wa} target="_blank" rel="noreferrer"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 rounded-lg text-center">
                    WhatsApp
                  </a>
                ) : (
                  <span className="flex-1 bg-gray-50 text-gray-300 text-xs font-semibold py-2 rounded-lg text-center">No phone</span>
                )}
                <button disabled={busyId === f.id} onClick={() => markSent(f, wa ? 'whatsapp' : 'other')}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-lg disabled:opacity-50">
                  ✓ Mark sent
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
