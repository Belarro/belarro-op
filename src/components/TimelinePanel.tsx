'use client';

import React, { useEffect, useState } from 'react';

interface TimelineEvent {
  type: 'visit' | 'follow_up';
  date: string;
  sales_rep?: string | null;
  notes?: string | null;
  tags?: string[];
  sample_given?: boolean;
  interest_level?: string | null;
  stage?: number | null;
  sent_via?: string | null;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Full conversation history for one place — every visit (with tags/notes)
// and every follow-up message sent, merged newest first. Read-only.
export default function TimelinePanel({ locationId, locationName, onClose }: {
  locationId: string; locationName: string; onClose: () => void;
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/locations/${locationId}/timeline`)
      .then(r => r.json())
      .then(j => { if (j.success) setEvents(j.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [locationId]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-gray-900 text-lg">{locationName}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Full history — every visit and message sent</p>
            </div>
            <button onClick={onClose} className="text-gray-400 font-bold text-xl px-2 shrink-0">✕</button>
          </div>

          {loading ? (
            <div className="text-gray-400 text-sm text-center py-6">Loading…</div>
          ) : events.length === 0 ? (
            <div className="text-gray-400 text-sm text-center py-6">No history yet.</div>
          ) : (
            <div className="space-y-2">
              {events.map((e, i) => (
                <div key={i} className={`rounded-lg px-3 py-2.5 border ${e.type === 'visit' ? 'bg-gray-50 border-gray-100' : 'bg-blue-50 border-blue-100'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500">
                      {e.type === 'visit' ? '📍 Visit' : `✉️ Follow-up${e.stage ? ` ${e.stage}` : ''}`}
                    </span>
                    <span className="text-xs text-gray-400">{fmt(e.date)}</span>
                  </div>
                  {e.type === 'visit' && (
                    <>
                      <div className="text-xs text-gray-500 mt-1">
                        {e.sales_rep || ''}
                        {e.sample_given && <span className="ml-1.5 bg-green-100 text-green-700 rounded px-1.5 py-0.5 text-[10px] font-semibold">Sample</span>}
                      </div>
                      {e.tags && e.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {e.tags.map((t, ti) => (
                            <span key={ti} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">{t}</span>
                          ))}
                        </div>
                      )}
                      {e.notes && <div className="text-xs text-gray-700 mt-1.5 whitespace-pre-wrap">{e.notes}</div>}
                    </>
                  )}
                  {e.type === 'follow_up' && e.sent_via && (
                    <div className="text-xs text-gray-500 mt-1">Sent via {e.sent_via}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
