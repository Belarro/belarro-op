'use client';

// Field deliveries — confirm what actually went out each Tuesday.
// Same-origin now: no sync secret, no CORS, just the session cookie.
// Confirming writes to belarro_v4_delivery (the ledger invoices read for
// past dates); "Not delivered" removes the line from billing.
//
// Source of truth: only orders active on the admin Orders page appear here
// — no grace-period/draining for removed orders (Ron: "the main orders will
// be the web part, make sure it shows exactly how it needs to be").

import React, { useCallback, useEffect, useState } from 'react';

interface DueItem {
  order_id: string;
  crop_name: string;
  size_name: string;
  expected_qty: number;
  status: 'pending' | 'delivered' | 'adjusted' | 'not_delivered';
  actual_qty: number;
}
interface DueCustomer {
  customer_id: string;
  customer_name: string;
  address: string | null;
  items: DueItem[];
}
interface UpcomingCustomer {
  customer_id: string;
  customer_name: string;
  next_delivery_date: string;
  crop_names: string[];
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  delivered: 'bg-green-100 text-green-700',
  adjusted: 'bg-blue-100 text-blue-700',
  not_delivered: 'bg-red-100 text-red-600',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', delivered: 'Delivered', adjusted: 'Adjusted', not_delivered: 'Not delivered',
};

function ymdLocal(d: Date) { return d.toLocaleDateString('sv'); }
// The Tuesday you actually want to land on when opening the app: if today
// IS Tuesday, that's the delivery day itself — show it (not next week).
// Otherwise show the most recent past Tuesday, since that's the delivery
// you're most likely to still need to confirm. Ron: "what happened if I
// wanna see what I delivered last week?" — landing on next week by default
// buried that need one tap behind the ← arrow with no visual cue it existed.
function mostRelevantTuesday(from: Date) {
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  if (d.getDay() === 2) return d;
  while (d.getDay() !== 2) d.setDate(d.getDate() - 1);
  return d;
}
function fmtDate(ymd: string) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-DE', { weekday: 'long', day: 'numeric', month: 'short' });
}
function fmtShort(ymd: string) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-DE', { day: 'numeric', month: 'short' });
}
function weeksAway(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / (7 * 86400000));
}
// "This week" / "Last week" / "N weeks ago" / "In N weeks" label relative
// to today's Tuesday, so it's unmistakable which delivery you're looking at.
function weekLabel(dateYmd: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const thisTue = mostRelevantTuesday(today);
  const w = weeksAway(ymdLocal(thisTue), dateYmd);
  if (w === 0) return 'This week';
  if (w === -1) return 'Last week';
  if (w === 1) return 'Next week';
  if (w < 0) return `${Math.abs(w)} weeks ago`;
  return `In ${w} weeks`;
}

async function confirmOne(orderId: string, date: string, status: string, actualQty: number) {
  const res = await fetch('/api/deliveries/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, delivery_date: date, status, actual_qty: actualQty }),
  });
  return res.json();
}

function DeliveryLine({ item, date, onDone }: { item: DueItem; date: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [qty, setQty] = useState(String(item.expected_qty));

  const confirm = async (status: string, actualQty: number) => {
    setBusy(true);
    try {
      const json = await confirmOne(item.order_id, date, status, actualQty);
      if (!json.success) alert(json.error || 'Failed');
      onDone();
    } finally {
      setBusy(false);
      setAdjusting(false);
    }
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = item.status === 'pending' && new Date(`${date}T00:00:00`) < today;

  return (
    <div className="px-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-gray-900">
            {item.crop_name}{item.size_name ? <span className="text-gray-400 font-normal"> ({item.size_name})</span> : null}
          </div>
          <div className="text-lg font-extrabold text-gray-900 mt-0.5">
            {item.expected_qty}×
            {item.status !== 'pending' && item.actual_qty !== item.expected_qty && (
              <span className="text-sm font-semibold text-blue-600 ml-1.5">Actual {item.actual_qty}</span>
            )}
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${isOverdue ? 'bg-red-100 text-red-700' : STATUS_BADGE[item.status]}`}>
          {isOverdue ? 'Needs confirmation' : STATUS_LABEL[item.status]}
        </span>
      </div>

      {!adjusting ? (
        <div className="flex gap-2 mt-2">
          <button disabled={busy} onClick={() => confirm('delivered', item.expected_qty)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50">
            ✓ Delivered
          </button>
          <button disabled={busy} onClick={() => { setQty(String(item.expected_qty)); setAdjusting(true); }}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-lg disabled:opacity-50">
            Adjust
          </button>
          <button disabled={busy} onClick={() => confirm('not_delivered', 0)}
            className="flex-1 bg-gray-100 hover:bg-red-50 text-red-500 text-xs font-semibold py-2 rounded-lg disabled:opacity-50">
            ✕ Not delivered
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mt-2 items-center">
          <input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)}
            className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-green-500" />
          <button disabled={busy} onClick={() => confirm('adjusted', Number(qty))}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50">
            Save
          </button>
          <button onClick={() => setAdjusting(false)}
            className="px-3 bg-gray-100 text-gray-600 text-xs font-semibold py-2 rounded-lg">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function CustomerCard({ customer, date, onDone }: { customer: DueCustomer; date: string; onDone: () => void }) {
  const [markingAll, setMarkingAll] = useState(false);
  const allDone = customer.items.every(i => i.status !== 'pending');
  const pendingCount = customer.items.filter(i => i.status === 'pending').length;

  const markAllDelivered = async () => {
    setMarkingAll(true);
    try {
      const pending = customer.items.filter(i => i.status === 'pending');
      await Promise.all(pending.map(i => confirmOne(i.order_id, date, 'delivered', i.expected_qty)));
      onDone();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className={`px-4 py-3 flex items-center justify-between gap-2 ${allDone ? 'bg-green-50' : ''}`}>
        <div className="min-w-0">
          {/* Restaurant name — 50% bigger than the old text-sm, per Ron's request */}
          <div className="font-extrabold text-gray-900 text-lg leading-tight truncate">{customer.customer_name}</div>
          {customer.address && <div className="text-xs text-gray-400">{customer.address}</div>}
        </div>
        {allDone ? (
          <span className="text-2xl shrink-0">✅</span>
        ) : pendingCount > 1 ? (
          <button
            onClick={markAllDelivered}
            disabled={markingAll}
            className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            {markingAll ? '…' : `✓ Mark all delivered (${pendingCount})`}
          </button>
        ) : null}
      </div>
      {customer.items.map(item => (
        <DeliveryLine key={item.order_id} item={item} date={date} onDone={onDone} />
      ))}
    </div>
  );
}

export default function FieldDeliveriesPage() {
  const [date, setDate] = useState(() => ymdLocal(mostRelevantTuesday(new Date())));
  const [customers, setCustomers] = useState<DueCustomer[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (forDate: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/deliveries/due?date=${forDate}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setCustomers(json.data || []);
      setUpcoming(json.upcoming || []);
      setDate(json.date || forDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setCustomers([]);
      setUpcoming([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const shiftWeek = (delta: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta * 7);
    load(ymdLocal(d));
  };

  const totalItems = customers.reduce((s, c) => s + c.items.length, 0);
  const doneItems = customers.reduce((s, c) => s + c.items.filter(i => i.status !== 'pending').length, 0);

  return (
    <div className="p-4 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => shiftWeek(-1)} className="w-10 h-10 bg-white border border-gray-200 rounded-lg font-bold text-gray-500">
          ← <span className="sr-only">Previous week</span>
        </button>
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-green-600">{weekLabel(date)}</div>
          <div className="font-bold text-gray-900">{fmtDate(date)}</div>
          <div className="text-xs text-gray-400">{doneItems}/{totalItems} confirmed</div>
        </div>
        <button onClick={() => shiftWeek(1)} className="w-10 h-10 bg-white border border-gray-200 rounded-lg font-bold text-gray-500">→</button>
      </div>
      {/* Quick jump back to last week — the exact question Ron asked
          ("what happened if I wanna see what I delivered last week?") —
          a direct one-tap button instead of only the small ← arrow. */}
      {weekLabel(date) !== 'Last week' && (
        <button
          onClick={() => {
            const lastWeek = new Date(mostRelevantTuesday(new Date()));
            lastWeek.setDate(lastWeek.getDate() - 7);
            load(ymdLocal(lastWeek));
          }}
          className="w-full text-center text-xs font-semibold text-gray-500 -mt-2 py-1"
        >
          ← Jump to last week's deliveries
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
      ) : error ? (
        <div className="text-center py-12 text-red-500 text-sm">{error}</div>
      ) : (
        <>
          {customers.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No deliveries due this day.</div>
          ) : customers.map(c => (
            <CustomerCard key={c.customer_id} customer={c} date={date} onDone={() => load(date)} />
          ))}

          {upcoming.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2">
                Upcoming — no delivery this week
              </div>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {upcoming.map(u => {
                  const w = weeksAway(date, u.next_delivery_date);
                  return (
                    <div key={u.customer_id} className="px-4 py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-gray-900">{u.customer_name}</div>
                        <div className="text-xs text-gray-400 truncate">{u.crop_names.join(', ')}</div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="text-sm font-bold text-gray-900">{fmtShort(u.next_delivery_date)}</div>
                        <div className="text-[11px] text-gray-400">{w <= 0 ? 'this week' : w === 1 ? 'in 1 week' : `in ${w} weeks`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
