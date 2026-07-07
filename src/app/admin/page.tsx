'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardData {
  overview: {
    total_crops: number;
    active_crops: number;
    active_customers: number;
    total_customers: number;
    active_orders: number;
  };
  this_month: {
    label: string;
    deliveries: number;
    revenue: number;
    packages: number;
    kg: number;
  };
  all_time: {
    revenue: number;
    packages: number;
    kg: number;
    deliveries: number;
  };
  next_delivery: {
    date: string;
    revenue: number;
    packages: number;
  };
  operations: {
    active_seeding_batches: number;
    pending_follow_ups: number;
  };
  alerts: {
    seed_reorder_alerts: number;
    package_reorder_alerts: number;
  };
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(res => res.json())
      .then(j => { if (j.success) setData(j.data); })
      .catch(err => console.error('Dashboard load failed:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-12 text-gray-500">Failed to load dashboard data.</div>;
  }

  return (
    <div className="space-y-8">
      {/* Follow-up banner */}
      {data.operations.pending_follow_ups > 0 && (
        <Link href="/admin/follow-ups" className="block bg-green-600 hover:bg-green-700 text-white rounded-xl px-6 py-4 flex items-center justify-between transition">
          <span className="font-semibold text-base">Follow-ups due today</span>
          <span className="text-3xl font-extrabold">{data.operations.pending_follow_ups}</span>
        </Link>
      )}

      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Farm Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Revenue and operations — updated every delivery</p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Crops</span>
          <div className="text-4xl font-extrabold text-green-600 mt-2">{data.overview.total_crops}</div>
          <div className="text-xs text-gray-500 mt-4 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            {data.overview.active_crops} active varieties
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Customers</span>
          <div className="text-4xl font-extrabold text-blue-600 mt-2">{data.overview.active_customers}</div>
          <div className="text-xs text-gray-500 mt-4 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            {data.overview.total_customers} total registered
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Orders</span>
          <div className="text-4xl font-extrabold text-purple-600 mt-2">{data.overview.active_orders}</div>
          <div className="text-xs text-gray-500 mt-4 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            recurring weekly lines
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Next Delivery</span>
          <div className="text-2xl font-extrabold text-amber-600 mt-2">€{data.next_delivery.revenue.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-4">
            {fmtDate(data.next_delivery.date)} · {data.next_delivery.packages} packages
          </div>
        </div>
      </div>

      {/* This month + All time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* This month */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4">
            {data.this_month.label}
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-extrabold text-green-600">€{data.this_month.revenue.toFixed(0)}</div>
              <div className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">Revenue</div>
            </div>
            <div className="text-center border-x border-gray-100">
              <div className="text-3xl font-extrabold text-gray-800">{data.this_month.packages}</div>
              <div className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">Packages</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-extrabold text-gray-800">{data.this_month.kg}</div>
              <div className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">kg greens</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center">
            {data.this_month.deliveries} {data.this_month.deliveries === 1 ? 'delivery' : 'deliveries'} so far this month
          </div>
        </div>

        {/* All time */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4">All Time</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-extrabold text-green-600">€{data.all_time.revenue.toFixed(0)}</div>
              <div className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">Revenue</div>
            </div>
            <div className="text-center border-x border-gray-100">
              <div className="text-3xl font-extrabold text-gray-800">{data.all_time.packages}</div>
              <div className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">Packages</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-extrabold text-gray-800">{data.all_time.kg}</div>
              <div className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">kg greens</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center">
            {data.all_time.deliveries} total deliveries since Jan 2026
          </div>
        </div>
      </div>

      {/* Operations + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">Active Operations</h2>
          <div className="divide-y divide-gray-100">
            <div className="py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Seeding Batches</span>
              <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-green-50 text-green-700">
                {data.operations.active_seeding_batches} active
              </span>
            </div>
            <div className="py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Pending Follow-ups</span>
              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${data.operations.pending_follow_ups > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
                {data.operations.pending_follow_ups} remaining
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">Reorder Alerts</h2>
          <div className="divide-y divide-gray-100">
            <div className="py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Seed Inventory</span>
              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${data.alerts.seed_reorder_alerts > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>
                {data.alerts.seed_reorder_alerts} alerts
              </span>
            </div>
            <div className="py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Package Inventory</span>
              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${data.alerts.package_reorder_alerts > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                {data.alerts.package_reorder_alerts} alerts
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
