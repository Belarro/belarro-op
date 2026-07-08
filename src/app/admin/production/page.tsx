'use client';

import React, { useEffect, useState } from 'react';

interface SeedItem {
  crop_name: string;
  trays_needed: number | null;
  seed_date: string;
  seed_day: string;
  harvest_display: string;
}

interface DeliveryItem {
  crop_name: string;
  order_qty: number;
  size_name: string;
  size_grams: number;
  trays_needed: number | null;
}

interface DeliveryGroup {
  harvest_date: string;
  harvest_display: string;
  customer_name: string;
  items: DeliveryItem[];
}

interface ActiveBatch {
  id: string;
  crop_id: string;
  seeding_date: string;
  quantity_trays: number;
  expected_harvest_date: string;
  crop: { name_en: string; name_de: string };
}

interface SeedScheduleDay {
  date: string;
  display: string;
  day: 'Tuesday' | 'Friday';
  total_trays: number;
  items: { crop_name: string; trays: number; grams_needed: number; harvest_display: string }[];
}

interface DailyTask {
  crop_name: string;
  crop_id: string;
  grams_needed: number;
  trays_needed: number;
  task_type: 'soak' | 'seed_stack' | 'cover_soil' | 'blackout' | 'light' | 'harvest';
  notes?: string;
}

interface DailyOperation {
  date: string;
  display: string;
  day_of_week: string;
  tasks: DailyTask[];
}

interface ProductionData {
  schedule: {
    harvest_date: string;
    harvest_display: string;
    customer_name: string;
    items: any[];
  }[];
  seed_tuesday: any[];
  seed_friday: any[];
  seed_schedule: SeedScheduleDay[];
  active_batches: ActiveBatch[];
  ready_to_harvest: ActiveBatch[];
  today: string;
  next_tuesday: string;
  next_friday: string;
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ProductionPage() {
  const [data, setData] = useState<ProductionData | null>(null);
  const [dailyOps, setDailyOps] = useState<DailyOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'seeding' | 'delivery' | 'growing' | 'harvest' | 'daily-ops'>('seeding');

  const [seedView, setSeedView] = useState<'week' | '4weeks'>('week');
  const [opsView, setOpsView] = useState<'week' | '2weeks' | '4weeks' | 'daily'>('week');
  const [opsLayout, setOpsLayout] = useState<'list' | 'calendar'>('calendar');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [harvestModal, setHarvestModal] = useState<ActiveBatch | null>(null);
  const [harvestForm, setHarvestForm] = useState({ actual_yield_grams: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  // Delivery tab: "Upcoming" is the live forward-looking schedule (data.schedule,
  // recomputed from current orders). "History" reads the actual confirmed
  // delivery ledger (belarro_v4_delivery, via the same /api/deliveries/due
  // endpoint the field app uses) so Ron can go back weeks/months and see
  // exactly what was delivered — not a projection. Ron: "let's say we can go
  // one month back, two months back, so if I need to check something."
  const [deliveryMode, setDeliveryMode] = useState<'upcoming' | 'history'>('upcoming');
  const [historyDate, setHistoryDate] = useState<string>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (d.getDay() !== 2) while (d.getDay() !== 2) d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('sv');
  });
  const [historyData, setHistoryData] = useState<{ customer_name: string; items: any[] }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = async (dateStr: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/deliveries/due?date=${dateStr}`);
      const json = await res.json();
      if (json.success) { setHistoryData(json.data || []); setHistoryDate(json.date || dateStr); }
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (deliveryMode === 'history') fetchHistory(historyDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMode]);

  const shiftHistoryWeek = (deltaWeeks: number) => {
    const d = new Date(`${historyDate}T00:00:00`);
    d.setDate(d.getDate() + deltaWeeks * 7);
    fetchHistory(d.toLocaleDateString('sv'));
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [prodRes, opsRes] = await Promise.all([
        fetch('/api/production'),
        fetch('/api/daily-operations'),
      ]);
      const prodJson = await prodRes.json();
      const opsJson = await opsRes.json();
      if (prodJson.success) setData(prodJson.data);
      if (opsJson.success) setDailyOps(opsJson.data.daily_operations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleLogHarvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!harvestModal || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seeding_batch_id: harvestModal.id,
          harvest_date: new Date().toISOString().split('T')[0],
          actual_yield_grams: parseFloat(harvestForm.actual_yield_grams) || 0,
          notes: harvestForm.notes,
          order_ids: [],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setHarvestModal(null);
        setHarvestForm({ actual_yield_grams: '', notes: '' });
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Deduplicate seed items by crop for a given seed day
  const deduplicateByTray = (items: any[]): { crop_name: string; trays: number }[] => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = item.crop_name;
      map.set(key, (map.get(key) || 0) + (item.quantity_trays || item.trays_needed || 1));
    }
    return Array.from(map.entries()).map(([crop_name, trays]) => ({ crop_name, trays }));
  };

  const tuesdayItems = deduplicateByTray(data?.seed_tuesday || []);
  const fridayItems = deduplicateByTray(data?.seed_friday || []);

  // Group deliveries by harvest date
  const deliveries = data?.schedule || [];

  // Filter daily ops by view
  const today = data?.today ? new Date(data.today) : new Date();
  const getFilteredOps = () => {
    const endDate = new Date(today);
    if (opsView === 'week') endDate.setDate(endDate.getDate() + 7);
    else if (opsView === '2weeks') endDate.setDate(endDate.getDate() + 14);
    else if (opsView === '4weeks') endDate.setDate(endDate.getDate() + 28);
    else if (opsView === 'daily' && selectedDay) return dailyOps.filter(d => d.date === selectedDay);

    return dailyOps.filter(d => new Date(d.date) <= endDate);
  };
  const filteredOps = getFilteredOps();

  // Calendar grid: weeks of 7 days (Mon-Sun) covering the selected range
  const localKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const buildCalendarWeeks = () => {
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
    const rangeDays = opsView === 'week' ? 7 : opsView === '2weeks' ? 14 : 28;
    const end = new Date(today);
    end.setDate(end.getDate() + rangeDays);
    const opsByDate = new Map(dailyOps.map(d => [d.date, d]));
    const weeks: { date: Date; key: string; ops?: DailyOperation }[][] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const week: { date: Date; key: string; ops?: DailyOperation }[] = [];
      for (let i = 0; i < 7; i++) {
        const key = localKey(cur);
        week.push({ date: new Date(cur), key, ops: opsByDate.get(key) });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Production</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'seeding', label: 'Seeding' },
          { key: 'delivery', label: 'Delivery' },
          { key: 'daily-ops', label: 'Daily Operations' },
          { key: 'growing', label: `Growing (${data?.active_batches.length ?? 0})` },
          { key: 'harvest', label: `Harvest (${data?.ready_to_harvest.length ?? 0})`, urgent: (data?.ready_to_harvest.length ?? 0) > 0 },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === t.key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-900'
            } ${t.urgent && activeTab !== t.key ? 'text-amber-600' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : (
        <>
          {/* ── SEEDING TAB ── */}
          {activeTab === 'seeding' && (
            <div className="space-y-4">
              {/* View toggle */}
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button onClick={() => setSeedView('week')}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${seedView === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    This Week
                  </button>
                  <button onClick={() => setSeedView('4weeks')}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${seedView === '4weeks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    4-Week View
                  </button>
                </div>
              </div>

              {seedView === 'week' ? (
                /* ── THIS WEEK: two cards side by side ── */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Tuesday */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-blue-50 border-b border-blue-100 px-5 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900">Tuesday Seeding</div>
                        <div className="text-xs text-gray-500">{data?.next_tuesday ? fmt(data.next_tuesday) : ''} — long cycle (11+ days)</div>
                      </div>
                      {tuesdayItems.length > 0 && (
                        <span className="text-2xl font-extrabold text-blue-600">
                          {tuesdayItems.reduce((s, i) => s + i.trays, 0)}
                          <span className="text-sm font-normal text-gray-500 ml-1">trays</span>
                        </span>
                      )}
                    </div>
                    {tuesdayItems.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm">Nothing to seed this Tuesday</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs font-semibold text-gray-400 uppercase border-b border-gray-100">
                            <th className="px-5 py-2 text-left">Variety</th>
                            <th className="px-5 py-2 text-right">Trays</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {tuesdayItems.map((item, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-5 py-3 font-semibold text-gray-900">{item.crop_name}</td>
                              <td className="px-5 py-3 text-right font-bold text-gray-900">{item.trays}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Friday */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-purple-50 border-b border-purple-100 px-5 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900">Friday Seeding</div>
                        <div className="text-xs text-gray-500">{data?.next_friday ? fmt(data.next_friday) : ''} — short cycle (up to 10 days)</div>
                      </div>
                      {fridayItems.length > 0 && (
                        <span className="text-2xl font-extrabold text-purple-600">
                          {fridayItems.reduce((s, i) => s + i.trays, 0)}
                          <span className="text-sm font-normal text-gray-500 ml-1">trays</span>
                        </span>
                      )}
                    </div>
                    {fridayItems.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm">Nothing to seed this Friday</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs font-semibold text-gray-400 uppercase border-b border-gray-100">
                            <th className="px-5 py-2 text-left">Variety</th>
                            <th className="px-5 py-2 text-right">Trays</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {fridayItems.map((item, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-5 py-3 font-semibold text-gray-900">{item.crop_name}</td>
                              <td className="px-5 py-3 text-right font-bold text-gray-900">{item.trays}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ) : (
                /* ── 4-WEEK VIEW: vertical list of seed day cards ── */
                <div className="space-y-3">
                  {!data?.seed_schedule?.length ? (
                    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
                      No seeding scheduled for the next 4 weeks.
                    </div>
                  ) : (
                    data.seed_schedule.map((day) => (
                      <div key={day.date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className={`border-b px-5 py-3 flex items-center justify-between ${
                          day.day === 'Tuesday' ? 'bg-blue-50 border-blue-100' : 'bg-purple-50 border-purple-100'
                        }`}>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                              day.day === 'Tuesday' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>{day.day}</span>
                            <span className="font-semibold text-gray-900">{day.display}</span>
                            <span className="text-xs text-gray-400">
                              {day.day === 'Tuesday' ? 'long cycle (11+ days)' : 'short cycle (up to 10 days)'}
                            </span>
                          </div>
                          <span className={`text-lg font-extrabold ${day.day === 'Tuesday' ? 'text-blue-600' : 'text-purple-600'}`}>
                            {day.total_trays}
                            <span className="text-xs font-normal text-gray-500 ml-1">trays</span>
                          </span>
                        </div>
                        <table className="w-full text-sm table-fixed">
                          <colgroup>
                            <col className="w-auto" />
                            <col className="w-20" />
                            <col className="w-24" />
                            <col className="w-28" />
                          </colgroup>
                          <thead>
                            <tr className="text-xs font-semibold text-gray-400 uppercase border-b border-gray-100">
                              <th className="px-5 py-2 text-left">Variety</th>
                              <th className="px-5 py-2 text-right">Trays</th>
                              <th className="px-5 py-2 text-right">Grams</th>
                              <th className="px-5 py-2 text-right">Harvest</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {day.items.map((item, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-5 py-2.5 font-semibold text-gray-900">{item.crop_name}</td>
                                <td className="px-5 py-2.5 text-right font-bold text-gray-900">{item.trays}</td>
                                <td className="px-5 py-2.5 text-right text-gray-500 text-xs">{item.grams_needed}g</td>
                                <td className="px-5 py-2.5 text-right text-gray-400 text-xs">{item.harvest_display}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── DELIVERY TAB ── */}
          {activeTab === 'delivery' && (
            <div className="space-y-4">
              {/* Upcoming (live projection) vs History (ledger — go back weeks/months) */}
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button onClick={() => setDeliveryMode('upcoming')}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${deliveryMode === 'upcoming' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    Upcoming
                  </button>
                  <button onClick={() => setDeliveryMode('history')}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${deliveryMode === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    History
                  </button>
                </div>
              </div>

              {deliveryMode === 'upcoming' ? (
                deliveries.length === 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
                    No upcoming deliveries.
                  </div>
                ) : (
                  deliveries.map((delivery) => (
                    <div key={delivery.harvest_date + delivery.customer_name} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-gray-900">{delivery.customer_name}</span>
                          <span className="ml-3 text-sm text-gray-500">Delivery: {delivery.harvest_display}</span>
                        </div>
                        <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded-lg">
                          {delivery.items.length} items
                        </span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs font-semibold text-gray-400 uppercase border-b border-gray-100">
                            <th className="px-5 py-2 text-left">Variety</th>
                            <th className="px-5 py-2 text-right">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {delivery.items.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-5 py-3 font-semibold text-gray-900">{item.crop_name}</td>
                              <td className="px-5 py-3 text-right text-gray-700">
                                {item.order_qty}× <span className="text-xs text-gray-500">{item.size_name || `${item.size_grams}g`}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )
              ) : (
                <div className="space-y-4">
                  {/* Week navigator: step back one Tuesday at a time, or jump
                      1/4/8 weeks back (roughly 1 week / 1 month / 2 months). */}
                  <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <button onClick={() => shiftHistoryWeek(-1)}
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-600">←</button>
                    <div className="text-center">
                      <div className="font-bold text-gray-900">
                        {new Date(`${historyDate}T00:00:00`).toLocaleDateString('en-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-2 justify-center mt-1">
                        <button onClick={() => shiftHistoryWeek(-4)} className="text-xs font-semibold text-green-700 hover:underline">−1 month</button>
                        <span className="text-gray-300">·</span>
                        <button onClick={() => shiftHistoryWeek(-8)} className="text-xs font-semibold text-green-700 hover:underline">−2 months</button>
                        <span className="text-gray-300">·</span>
                        <button onClick={() => {
                          const d = new Date(); d.setHours(0, 0, 0, 0);
                          while (d.getDay() !== 2) d.setDate(d.getDate() - 1);
                          fetchHistory(d.toLocaleDateString('sv'));
                        }} className="text-xs font-semibold text-gray-500 hover:underline">Today</button>
                      </div>
                    </div>
                    <button onClick={() => shiftHistoryWeek(1)}
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-600">→</button>
                  </div>

                  {historyLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
                    </div>
                  ) : historyData.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
                      No deliveries recorded for this week.
                    </div>
                  ) : (
                    historyData.map((delivery) => (
                      <div key={delivery.customer_name} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
                          <span className="font-bold text-gray-900">{delivery.customer_name}</span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs font-semibold text-gray-400 uppercase border-b border-gray-100">
                              <th className="px-5 py-2 text-left">Variety</th>
                              <th className="px-5 py-2 text-right">Expected</th>
                              <th className="px-5 py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {delivery.items.map((item: any, i: number) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-semibold text-gray-900">{item.crop_name}</td>
                                <td className="px-5 py-3 text-right text-gray-700">{item.expected_qty}×</td>
                                <td className="px-5 py-3 text-right">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    item.status === 'delivered' ? 'bg-green-100 text-green-700'
                                    : item.status === 'adjusted' ? 'bg-blue-100 text-blue-700'
                                    : item.status === 'not_delivered' ? 'bg-red-100 text-red-600'
                                    : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    {item.status === 'delivered' ? 'Delivered' : item.status === 'adjusted' ? 'Adjusted' : item.status === 'not_delivered' ? 'Not delivered' : 'Pending'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── GROWING TAB ── */}
          {activeTab === 'growing' && (
            <div>
              {!data || data.active_batches.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
                  No active batches in the ground.
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                        <th className="px-5 py-3 text-left">Variety</th>
                        <th className="px-5 py-3 text-center">Trays</th>
                        <th className="px-5 py-3 text-left">Harvest Date</th>
                        <th className="px-5 py-3 text-left">Days Left</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.active_batches.filter((b: ActiveBatch) => new Date(b.expected_harvest_date) > new Date()).map(b => {
                        const harvestDate = new Date(b.expected_harvest_date);
                        const daysLeft = Math.ceil((harvestDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return (
                          <tr key={b.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 font-semibold text-gray-900">{b.crop.name_en}</td>
                            <td className="px-5 py-3 text-center font-bold">{b.quantity_trays}</td>
                            <td className="px-5 py-3 font-semibold text-gray-900">{harvestDate.toLocaleDateString('en-DE', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                                daysLeft <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {daysLeft}d
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── DAILY OPERATIONS TAB ── */}
          {activeTab === 'daily-ops' && (
            <div className="space-y-4">
              {/* View toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {opsView !== 'daily' && (
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button onClick={() => setOpsView('week')}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${opsView === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        This Week
                      </button>
                      <button onClick={() => setOpsView('2weeks')}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${opsView === '2weeks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        2 Weeks
                      </button>
                      <button onClick={() => setOpsView('4weeks')}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${opsView === '4weeks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        4 Weeks
                      </button>
                      <button onClick={() => { setOpsView('daily'); setSelectedDay(dailyOps[0]?.date || null); }}
                        className="px-4 py-1.5 text-sm font-semibold rounded-md transition text-gray-500 hover:text-gray-700">
                        Daily
                      </button>
                    </div>
                  )}
                  {opsView === 'daily' && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setOpsView('week')}
                        className="px-3 py-1.5 text-sm font-semibold rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition">
                        ← Back
                      </button>
                      <select value={selectedDay || ''} onChange={(e) => setSelectedDay(e.target.value || null)}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none">
                        {dailyOps.map(day => (
                          <option key={day.date} value={day.date}>
                            {day.display} ({day.tasks.length} tasks)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {opsView !== 'daily' && (
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button onClick={() => setOpsLayout('calendar')}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${opsLayout === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      Calendar
                    </button>
                    <button onClick={() => setOpsLayout('list')}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${opsLayout === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      List
                    </button>
                  </div>
                )}
              </div>

              {filteredOps.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
                  No operations scheduled {opsView === 'daily' ? 'for this day' : 'in this period'}.
                </div>
              ) : opsView === 'daily' && selectedDay ? (
                /* Daily view - show one day with all tasks stacked */
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {filteredOps.map((day) => (
                    <div key={day.date}>
                      <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
                        <div className="font-bold text-gray-900 text-lg">{day.display}</div>
                        <div className="text-sm text-gray-500">{day.day_of_week}</div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {day.tasks.map((task, idx) => {
                          const taskColors: Record<string, string> = {
                            'soak': 'bg-blue-50 text-blue-700 border-blue-100',
                            'seed_stack': 'bg-green-50 text-green-700 border-green-100',
                            'cover_soil': 'bg-orange-50 text-orange-700 border-orange-100',
                            'blackout': 'bg-gray-50 text-gray-700 border-gray-100',
                            'light': 'bg-yellow-50 text-yellow-700 border-yellow-100',
                            'harvest': 'bg-amber-50 text-amber-700 border-amber-100',
                          };
                          const color = taskColors[task.task_type] || 'bg-gray-50 text-gray-700 border-gray-100';
                          const taskLabels: Record<string, string> = {
                            'seed_stack': 'Seed & Stack',
                            'cover_soil': 'Cover Soil',
                            'soak': 'Soak',
                            'blackout': 'Blackout',
                            'light': 'Light',
                            'harvest': 'Harvest',
                          };
                          const taskLabel = taskLabels[task.task_type] || task.task_type;
                          return (
                            <div key={idx} className="px-5 py-4 flex items-start justify-between hover:bg-gray-50 transition">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-1 text-xs font-bold rounded border ${color} whitespace-nowrap`}>
                                    {taskLabel}
                                  </span>
                                  <span className="font-semibold text-gray-900">{task.crop_name}</span>
                                </div>
                                {task.notes && <p className="text-xs text-gray-500 mt-1 ml-0">{task.notes}</p>}
                              </div>
                              <div className="text-right ml-4">
                                <div className="text-sm font-bold text-gray-900">{task.trays_needed} {task.trays_needed === 1 ? 'tray' : 'trays'}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : opsLayout === 'calendar' ? (
                /* Calendar grid: weeks as rows, Mon-Sun columns */
                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <div className="min-w-[640px]">
                  <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                      <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{d}</div>
                    ))}
                  </div>
                  {buildCalendarWeeks().map((week, wi) => (
                    <div key={wi} className={`grid grid-cols-7 ${wi > 0 ? 'border-t border-gray-100' : ''}`}>
                      {week.map(cell => {
                        const isToday = cell.key === data?.today;
                        const isPast = cell.date < today && !isToday;
                        const chipColors: Record<string, string> = {
                          'soak': 'bg-blue-100 text-blue-800',
                          'seed_stack': 'bg-green-100 text-green-800',
                          'cover_soil': 'bg-orange-100 text-orange-800',
                          'blackout': 'bg-gray-200 text-gray-700',
                          'light': 'bg-yellow-100 text-yellow-800',
                          'harvest': 'bg-amber-100 text-amber-800',
                        };
                        const chipLabels: Record<string, string> = {
                          'soak': 'Soak',
                          'seed_stack': 'Seed',
                          'cover_soil': 'Soil',
                          'blackout': '→ Dark',
                          'light': '→ Light',
                          'harvest': 'Harvest',
                        };
                        return (
                          <div key={cell.key}
                            className={`min-h-[110px] px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 ${isPast ? 'bg-gray-50/60' : ''} ${isToday ? 'bg-green-50/40' : ''}`}>
                            <div className={`text-xs font-bold mb-1 ${isToday ? 'text-green-700' : isPast ? 'text-gray-300' : 'text-gray-500'}`}>
                              {cell.date.getDate()}
                              {isToday && <span className="ml-1 text-[9px] font-semibold uppercase">today</span>}
                            </div>
                            <div className="space-y-1">
                              {(cell.ops?.tasks || []).map((task, ti) => {
                                const isDomeOff = task.notes === 'Remove humidity dome';
                                const label = isDomeOff ? 'Dome off' : (chipLabels[task.task_type] || task.task_type);
                                return (
                                  <button key={ti}
                                    onClick={() => { setOpsView('daily'); setSelectedDay(cell.key); }}
                                    title={`${task.crop_name}: ${task.notes || ''}`}
                                    className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight truncate block ${chipColors[task.task_type] || 'bg-gray-100 text-gray-700'} hover:opacity-75 transition`}>
                                    {label} {task.crop_name}{task.trays_needed > 1 ? ` ×${task.trays_needed}` : ''}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  </div>
                </div>
              ) : (
                /* Week/2-week/4-week view - condensed list */
                <div className="space-y-3">
                  {filteredOps.map((day) => (
                    <div key={day.date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-gray-900">{day.display}</div>
                          <div className="text-xs text-gray-500">{day.day_of_week}</div>
                        </div>
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                          {day.tasks.length} task{day.tasks.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {day.tasks.map((task, idx) => {
                          const taskColors: Record<string, string> = {
                            'soak': 'bg-blue-50 text-blue-700 border-blue-100',
                            'seed_stack': 'bg-green-50 text-green-700 border-green-100',
                            'cover_soil': 'bg-orange-50 text-orange-700 border-orange-100',
                            'blackout': 'bg-gray-50 text-gray-700 border-gray-100',
                            'light': 'bg-yellow-50 text-yellow-700 border-yellow-100',
                            'harvest': 'bg-amber-50 text-amber-700 border-amber-100',
                          };
                          const color = taskColors[task.task_type] || 'bg-gray-50 text-gray-700 border-gray-100';
                          const taskLabels: Record<string, string> = {
                            'seed_stack': 'Seed & Stack',
                            'cover_soil': 'Cover Soil',
                            'soak': 'Soak',
                            'blackout': 'Blackout',
                            'light': 'Light',
                            'harvest': 'Harvest',
                          };
                          const taskLabel = taskLabels[task.task_type] || task.task_type;
                          return (
                            <div key={idx} className="px-5 py-4 flex items-start justify-between hover:bg-gray-50 transition">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-1 text-xs font-bold rounded border ${color} whitespace-nowrap`}>
                                    {taskLabel}
                                  </span>
                                  <span className="font-semibold text-gray-900">{task.crop_name}</span>
                                </div>
                                {task.notes && <p className="text-xs text-gray-500 mt-1 ml-0">{task.notes}</p>}
                              </div>
                              <div className="text-right ml-4">
                                <div className="text-sm font-bold text-gray-900">{task.trays_needed} {task.trays_needed === 1 ? 'tray' : 'trays'}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── HARVEST TAB ── */}
          {activeTab === 'harvest' && (
            <div>
              {!data || data.ready_to_harvest.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
                  Nothing ready to harvest yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.ready_to_harvest.map(b => (
                    <div key={b.id} className="bg-white border border-amber-300 rounded-xl p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-gray-900 text-base">{b.crop.name_en}</div>
                          <div className="text-xs text-gray-500">{b.quantity_trays} trays</div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">Harvest</span>
                      </div>
                      <button
                        onClick={() => setHarvestModal(b)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 rounded-lg text-sm transition"
                      >
                        Record Harvest
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Harvest Modal */}
      {harvestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Record Harvest</h2>
                <p className="text-sm text-gray-500">{harvestModal.crop.name_en} — {harvestModal.quantity_trays} trays</p>
              </div>
              <button onClick={() => setHarvestModal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleLogHarvest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Actual yield (grams)</label>
                <input
                  type="number" required
                  value={harvestForm.actual_yield_grams}
                  onChange={e => setHarvestForm({ ...harvestForm, actual_yield_grams: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  placeholder="e.g. 750"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
                <textarea
                  value={harvestForm.notes}
                  onChange={e => setHarvestForm({ ...harvestForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none h-20 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setHarvestModal(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                  {submitting ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
