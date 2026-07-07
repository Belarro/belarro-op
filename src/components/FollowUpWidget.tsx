'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Customer {
  id?: string;
  name: string;
  restaurant_name?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

interface FollowUp {
  id: string;
  customer_id: string;
  follow_up_number: number;
  due_date: string;
  status: string;
  notes?: string | null;
  is_overdue?: boolean;
  customer: Customer;
}

export default function FollowUpWidget() {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/follow-ups/today');
      const json = await res.json();
      if (json.success) setItems(json.data);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markDone(id: string) {
    setCompleting(id);
    try {
      const res = await fetch(`/api/follow-ups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', sent_via: 'call' }),
      });
      if (res.ok) setItems((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setCompleting(null);
    }
  }

  function waLink(c: Customer) {
    const num = (c.whatsapp || c.phone || '').replace(/[^0-9]/g, '');
    return num ? `https://wa.me/${num}` : null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">Today&apos;s Follow-ups</h2>
          {!loading && !error && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-green-50 text-green-700">
              {items.length}
            </span>
          )}
        </div>
        <Link href="/admin/follow-ups" className="text-xs font-semibold text-green-600 hover:text-green-700">
          View All
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-sm text-red-600">
          Couldn&apos;t load follow-ups.{' '}
          <button onClick={load} className="font-semibold underline hover:text-red-700">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">
          🎉 No follow-ups due today. You&apos;re all caught up.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="divide-y divide-gray-50">
          {items.map((f) => {
            const wa = waLink(f.customer);
            return (
              <li key={f.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 truncate">
                      {f.customer.restaurant_name || f.customer.name}
                    </span>
                    {f.is_overdue && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-50 text-red-600">
                        OVERDUE
                      </span>
                    )}
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-500">
                      #{f.follow_up_number}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {f.customer.contact_person || f.customer.name}
                    {f.customer.phone ? ` · ${f.customer.phone}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="WhatsApp"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                    >
                      WA
                    </a>
                  )}
                  {f.customer.email && (
                    <a
                      href={`mailto:${f.customer.email}`}
                      title="Email"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                    >
                      Email
                    </a>
                  )}
                  <button
                    onClick={() => markDone(f.id)}
                    disabled={completing === f.id}
                    title="Mark done"
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 transition"
                  >
                    {completing === f.id ? '…' : 'Done'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
