'use client';

import React, { useEffect, useState, useCallback } from 'react';

interface InvoiceLine {
  id: string;
  order_id: string;
  delivery_date: string;
  crop_name: string;
  size_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  removed: boolean;
  qty_override: number | null;
  manual?: boolean;
  predicted?: boolean;
  delivery_status?: 'delivered' | 'adjusted' | 'not_delivered';
}

interface CropOption {
  id: string;
  name_en: string;
  variants: { size_name: string; price_eur: number | null }[];
}

interface CustomerInvoice {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  customer_tax_number: string;
  net_days: number;
  month: string;
  lines: InvoiceLine[];
  subtotal: number;
  vat: number;
  total: number;
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtMonth(s: string) {
  const [y, m] = s.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-DE', { month: 'long', year: 'numeric' });
}

function calcTotals(lines: InvoiceLine[]) {
  const subtotal = lines
    .filter(l => !l.removed)
    .reduce((s, l) => {
      const qty = l.qty_override ?? l.qty;
      return s + +(qty * l.unit_price).toFixed(2);
    }, 0);
  return {
    subtotal: +subtotal.toFixed(2),
    vat: +(subtotal * 0.07).toFixed(2),
    total: +(subtotal * 1.07).toFixed(2),
  };
}

// Group lines by delivery_date
function groupByDate(lines: InvoiceLine[]): { date: string; lines: InvoiceLine[] }[] {
  const map = new Map<string, InvoiceLine[]>();
  for (const l of lines) {
    if (!map.has(l.delivery_date)) map.set(l.delivery_date, []);
    map.get(l.delivery_date)!.push(l);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, lines]) => ({ date, lines }));
}

export default function InvoicesPage() {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [month, setMonth] = useState(defaultMonth);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editedLines, setEditedLines] = useState<Record<string, InvoiceLine[]>>({});
  const [crops, setCrops] = useState<CropOption[]>([]);

  // Add line modal state
  const [addModal, setAddModal] = useState<{ customerId: string; date: string } | null>(null);
  const [addForm, setAddForm] = useState({ crop_id: '', size_name: '', qty: '1', unit_price: '' });

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/generate?month=${m}`);
      const json = await res.json();
      if (json.success) {
        setInvoices(json.data);
        const initial: Record<string, InvoiceLine[]> = {};
        for (const inv of json.data) {
          initial[inv.customer_id] = inv.lines.map((l: InvoiceLine) => ({ ...l }));
        }
        setEditedLines(initial);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  useEffect(() => {
    fetch('/api/crops').then(r => r.json()).then(j => {
      if (j.success) setCrops((j.data || []).filter((c: any) => !c.deleted_at));
    });
  }, []);

  const getLines = (customerId: string) => editedLines[customerId] || [];

  const toggleRemove = (customerId: string, lineId: string) => {
    setEditedLines(prev => ({
      ...prev,
      [customerId]: prev[customerId].map(l => l.id === lineId ? { ...l, removed: !l.removed } : l),
    }));
  };

  const setQtyOverride = (customerId: string, lineId: string, val: string) => {
    const n = val === '' ? null : parseInt(val);
    setEditedLines(prev => ({
      ...prev,
      [customerId]: prev[customerId].map(l => l.id === lineId ? { ...l, qty_override: n } : l),
    }));
  };

  const setPriceOverride = (customerId: string, lineId: string, val: string) => {
    const price = val === '' ? 0 : parseFloat(val);
    setEditedLines(prev => ({
      ...prev,
      [customerId]: prev[customerId].map(l => l.id === lineId ? { ...l, unit_price: isNaN(price) ? l.unit_price : price } : l),
    }));
  };

  const selectedCrop = crops.find(c => c.id === addForm.crop_id) || null;
  const sizeOptions = selectedCrop?.variants || [];

  const handleAddLine = () => {
    if (!addModal || !addForm.crop_id) return;
    const crop = crops.find(c => c.id === addForm.crop_id);
    if (!crop) return;
    const qty = parseInt(addForm.qty) || 1;
    const price = parseFloat(addForm.unit_price) || 0;
    const newLine: InvoiceLine = {
      id: `manual-${Date.now()}`,
      order_id: '',
      delivery_date: addModal.date,
      crop_name: crop.name_en,
      size_name: addForm.size_name,
      qty,
      unit_price: price,
      line_total: +(qty * price).toFixed(2),
      removed: false,
      qty_override: null,
      manual: true,
    };
    setEditedLines(prev => ({
      ...prev,
      [addModal.customerId]: [...(prev[addModal.customerId] || []), newLine],
    }));
    setAddModal(null);
    setAddForm({ crop_id: '', size_name: '', qty: '1', unit_price: '' });
  };

  const handlePrint = (inv: CustomerInvoice) => {
    const lines = getLines(inv.customer_id);
    const { subtotal, vat, total } = calcTotals(lines);
    const activeLines = lines.filter(l => !l.removed);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice ${fmtMonth(inv.month)} — ${inv.customer_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 32px; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 4px; }
    p { line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 2px solid #000; padding: 6px 8px; }
    td { padding: 7px 8px; border-bottom: 1px solid #eee; }
    .right { text-align: right; }
    .week-header td { font-weight: bold; font-size: 11px; background: #f5f5f5; padding: 4px 8px; border-bottom: 1px solid #ddd; }
    .totals { margin-top: 24px; margin-left: auto; width: 260px; border-collapse: collapse; }
    .totals td { border: none; padding: 4px 8px; }
    .totals .total-row td { font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 8px; }
    .footer { margin-top: 40px; font-size: 10px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p class="label">From</p>
      <p><strong>Belarro / Citfarm UG</strong></p>
      <p>Berlin, Germany</p>
    </div>
    <div>
      <p class="label">Bill To</p>
      <p><strong>${inv.customer_name}</strong></p>
      ${inv.customer_address ? `<p>${inv.customer_address}</p>` : ''}
      ${inv.customer_email ? `<p>${inv.customer_email}</p>` : ''}
    </div>
    <div>
      <p class="label">Invoice Period</p>
      <p><strong>${fmtMonth(inv.month)}</strong></p>
      <p class="label" style="margin-top:12px">Payment Terms</p>
      <p>Net ${inv.net_days} days</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Product</th>
        <th class="right">Qty</th>
        <th class="right">Unit Price</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${(() => {
        const grouped = groupByDate(activeLines);
        return grouped.map(({ date, lines: wLines }) => {
          const weekTotal = wLines.reduce((s, l) => s + (l.qty_override ?? l.qty) * l.unit_price, 0);
          return `<tr class="week-header"><td colspan="4">${fmtDate(date)}</td><td class="right">€${weekTotal.toFixed(2)}</td></tr>` +
            wLines.map(l => {
              const qty = l.qty_override ?? l.qty;
              return `<tr>
                <td></td>
                <td>${l.crop_name}${l.size_name ? ` (${l.size_name})` : ''}</td>
                <td class="right">${qty}</td>
                <td class="right">€${l.unit_price.toFixed(2)}</td>
                <td class="right">€${(qty * l.unit_price).toFixed(2)}</td>
              </tr>`;
            }).join('');
        }).join('');
      })()}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="right">€${subtotal.toFixed(2)}</td></tr>
    <tr><td>VAT (7%)</td><td class="right">€${vat.toFixed(2)}</td></tr>
    <tr class="total-row"><td>Total</td><td class="right">€${total.toFixed(2)}</td></tr>
  </table>

  <div class="footer">
    <p>Generated ${new Date().toLocaleDateString('de-DE')} · Citfarm UG · Berlin</p>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Only confirmed deliveries — nothing predicted. Edit or add lines before printing.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const [y, m] = month.split('-').map(Number);
              const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
              if (prev >= '2026-01') setMonth(prev);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-30"
            disabled={month <= '2026-01'}
          >←</button>
          <span className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium min-w-[140px] text-center">
            {fmtMonth(month)}
          </span>
          <button
            onClick={() => {
              const [y, m] = month.split('-').map(Number);
              const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
              setMonth(next);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >→</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No confirmed deliveries yet for {fmtMonth(month)}. Confirm deliveries in Production &gt; Delivery &gt; History to see them here.
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map(inv => {
            const lines = getLines(inv.customer_id);
            const { subtotal, vat, total } = calcTotals(lines);
            const isOpen = openId === inv.customer_id;
            const activeLines = lines.filter(l => !l.removed);
            const activeCount = new Set(activeLines.map(l => l.delivery_date)).size;
            const itemCount = activeLines.length;
            const grouped = groupByDate(lines);

            return (
              <div key={inv.customer_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Header — click to expand */}
                <button
                  onClick={() => setOpenId(isOpen ? null : inv.customer_id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-gray-900 text-base">{inv.customer_name}</span>
                    <span className="text-xs text-gray-400">{activeCount} confirmed {activeCount === 1 ? 'week' : 'weeks'} · {itemCount} items</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Subtotal</div>
                      <div className="font-semibold text-gray-700">€{subtotal.toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">VAT 7%</div>
                      <div className="font-semibold text-gray-700">€{vat.toFixed(2)}</div>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <div className="text-xs text-gray-400">Total</div>
                      <div className="font-bold text-gray-900 text-base">€{total.toFixed(2)}</div>
                    </div>
                    <svg className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded: grouped by delivery date */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {grouped.map(({ date, lines: dayLines }) => {
                      const daySubtotal = dayLines
                        .filter(l => !l.removed)
                        .reduce((s, l) => s + (l.qty_override ?? l.qty) * l.unit_price, 0);

                      return (
                        <div key={date}>
                          {/* Week header */}
                          <div className="flex items-center justify-between px-5 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{fmtDate(date)}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-400">Week total: <strong className="text-gray-700">€{daySubtotal.toFixed(2)}</strong></span>
                              <button
                                onClick={() => setAddModal({ customerId: inv.customer_id, date })}
                                className="text-xs text-green-600 hover:text-green-700 font-semibold px-2 py-0.5 border border-green-200 rounded hover:bg-green-50 transition"
                              >
                                + Add line
                              </button>
                            </div>
                          </div>

                          {/* Lines for this date */}
                          <table className="w-full text-sm table-fixed">
                            <colgroup>
                              <col className="w-auto" />
                              <col className="w-16" />
                              <col className="w-24" />
                              <col className="w-24" />
                              <col className="w-16" />
                            </colgroup>
                            <tbody className="divide-y divide-gray-50">
                              {dayLines.map(line => {
                                const qty = line.qty_override ?? line.qty;
                                const lineTotal = (qty * line.unit_price).toFixed(2);
                                return (
                                  <tr key={line.id} className={`${line.removed ? 'opacity-30 bg-gray-50' : 'hover:bg-gray-50'}`}>
                                    <td className="px-5 py-2.5 font-medium text-gray-900">
                                      {line.crop_name}
                                      {line.size_name && <span className="text-gray-400 text-xs ml-1">({line.size_name})</span>}
                                      {line.manual && <span className="ml-1 text-[10px] text-green-600 font-semibold">manual</span>}
                                      {line.delivery_status === 'adjusted' && (
                                        <span className="ml-1 text-[10px] text-blue-600 font-semibold" title="Actual quantity differed from the order">adjusted</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-2.5 text-center">
                                      <input
                                        type="number" min="1"
                                        value={line.qty_override ?? line.qty}
                                        onChange={e => setQtyOverride(inv.customer_id, line.id, e.target.value)}
                                        disabled={line.removed}
                                        className="w-12 text-center text-xs border border-gray-200 rounded px-1 py-1 outline-none focus:border-green-400 disabled:opacity-40"
                                      />
                                    </td>
                                    <td className="px-2 py-2.5 text-center">
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span className="text-gray-400 text-xs">€</span>
                                        <input
                                          type="number" min="0" step="0.01"
                                          value={line.unit_price}
                                          onChange={e => setPriceOverride(inv.customer_id, line.id, e.target.value)}
                                          disabled={line.removed}
                                          className="w-16 text-center text-xs border border-gray-200 rounded px-1 py-1 outline-none focus:border-green-400 disabled:opacity-40"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-2 py-2.5 text-right font-semibold text-gray-900 text-sm">
                                      {line.removed ? '—' : `€${lineTotal}`}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      <button
                                        onClick={() => toggleRemove(inv.customer_id, line.id)}
                                        className={`text-xs font-bold px-2 py-1 rounded transition ${
                                          line.removed
                                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                                            : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                                        }`}
                                      >
                                        {line.removed ? '↩' : '✕'}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
                      <div className="flex gap-6 text-sm">
                        <span className="text-gray-500">Subtotal: <strong className="text-gray-900">€{subtotal.toFixed(2)}</strong></span>
                        <span className="text-gray-500">VAT 7%: <strong className="text-gray-900">€{vat.toFixed(2)}</strong></span>
                        <span className="text-gray-500">Total: <strong className="text-gray-900 text-base">€{total.toFixed(2)}</strong></span>
                      </div>
                      <button
                        onClick={() => handlePrint({ ...inv })}
                        className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition"
                      >
                        Print Invoice
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Line Modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Add Line</h2>
            <p className="text-xs text-gray-400 mb-4">{fmtDate(addModal.date)}</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Product</label>
                <select value={addForm.crop_id} onChange={e => {
                  const crop = crops.find(c => c.id === e.target.value);
                  const firstVariant = crop?.variants?.[0];
                  setAddForm({
                    ...addForm,
                    crop_id: e.target.value,
                    size_name: firstVariant?.size_name || '',
                    unit_price: firstVariant?.price_eur != null ? String(firstVariant.price_eur) : '',
                  });
                }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">Select crop...</option>
                  {crops.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Size</label>
                <select value={addForm.size_name} onChange={e => {
                  const variant = sizeOptions.find(v => v.size_name === e.target.value);
                  setAddForm({
                    ...addForm,
                    size_name: e.target.value,
                    unit_price: variant?.price_eur != null ? String(variant.price_eur) : addForm.unit_price,
                  });
                }} disabled={!selectedCrop} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-40">
                  <option value="">Select size...</option>
                  {sizeOptions.map(v => <option key={v.size_name} value={v.size_name}>{v.size_name}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Qty</label>
                  <input type="number" min="1" value={addForm.qty} onChange={e => setAddForm({ ...addForm, qty: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Unit Price (€)</label>
                  <input type="number" min="0" step="0.01" value={addForm.unit_price} onChange={e => setAddForm({ ...addForm, unit_price: e.target.value })}
                    placeholder="0.00" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setAddModal(null); setAddForm({ crop_id: '', size_name: '', qty: '1', unit_price: '' }); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleAddLine} disabled={!addForm.crop_id}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
