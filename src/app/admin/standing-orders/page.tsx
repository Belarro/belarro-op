'use client';

import React, { useEffect, useState } from 'react';

interface Customer { id: string; name: string; restaurant_name?: string; }
interface CropVariant { crop: { id: string; name_en: string }; variants: { id: string; size_name: string; size_grams: number; price_eur: number | null }[]; }
interface FlatVariant { id: string; label: string; price_eur: number | null; size_name: string; }

interface Item {
  id?: string;
  variant_id: string;
  size_name: string;
  quantity: number;
  price_at_time_eur: number;
  delivery_day_of_week: number | null;
}

interface StandingOrder {
  id: string;
  customer_id: string;
  status: 'active' | 'paused' | 'inactive';
  notes: string | null;
  customer: Customer;
  items: Item[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function StandingOrdersPage() {
  const [orders, setOrders] = useState<StandingOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<FlatVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StandingOrder | null>(null);

  const [form, setForm] = useState<{ customer_id: string; status: string; notes: string; items: Item[] }>({
    customer_id: '', status: 'active', notes: '', items: [],
  });

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [oRes, cRes, vRes] = await Promise.all([
        fetch('/api/standing-orders'),
        fetch('/api/customers'),
        fetch('/api/size-templates'),
      ]);
      const [oJson, cJson, vJson] = await Promise.all([oRes.json(), cRes.json(), vRes.json()]);
      if (oJson.success) setOrders(oJson.data || []);
      if (cJson.success) setCustomers(cJson.data || []);
      if (vJson.success) {
        const flat: FlatVariant[] = [];
        (vJson.data as CropVariant[]).forEach((cv) => {
          cv.variants.forEach((v) => flat.push({
            id: v.id,
            label: `${cv.crop.name_en} — ${v.size_name} (${v.size_grams}g)`,
            price_eur: v.price_eur,
            size_name: v.size_name,
          }));
        });
        setVariants(flat);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const resetForm = () => { setForm({ customer_id: '', status: 'active', notes: '', items: [] }); setEditing(null); };

  const openNew = () => { resetForm(); setShowModal(true); };
  const openEdit = (o: StandingOrder) => {
    setEditing(o);
    setForm({ customer_id: o.customer_id, status: o.status, notes: o.notes || '', items: o.items.map((i) => ({ ...i })) });
    setShowModal(true);
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { variant_id: '', size_name: '', quantity: 1, price_at_time_eur: 0, delivery_day_of_week: null }] });
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  const updateItem = (idx: number, patch: Partial<Item>) => {
    const items = form.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setForm({ ...form, items });
  };

  const onVariantSelect = (idx: number, variantId: string) => {
    const v = variants.find((x) => x.id === variantId);
    updateItem(idx, {
      variant_id: variantId,
      size_name: v?.size_name || '',
      price_at_time_eur: v?.price_eur ?? form.items[idx].price_at_time_eur,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id) { flash('Select a customer'); return; }
    try {
      const url = '/api/standing-orders';
      const method = editing ? 'PUT' : 'POST';
      const payload = editing ? { id: editing.id, ...form } : form;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.success) { flash(editing ? 'Updated' : 'Created'); setShowModal(false); resetForm(); fetchAll(); }
      else flash(`Error: ${json.error}`);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this standing order?')) return;
    try {
      const res = await fetch('/api/standing-orders', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const json = await res.json();
      if (json.success) { flash('Deleted'); fetchAll(); }
    } catch (e) { console.error(e); }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-50 text-green-700 border-green-200',
      paused: 'bg-amber-50 text-amber-700 border-amber-200',
      inactive: 'bg-gray-100 text-gray-500 border-gray-200',
    };
    return map[s] || map.inactive;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Standing Orders</h1>
          <p className="text-sm text-gray-500 mt-1">Manage recurring orders per customer</p>
        </div>
        <button onClick={openNew} className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2.5 rounded-lg shadow transition focus:outline-none focus:ring-2 focus:ring-green-400">
          + New Standing Order
        </button>
      </div>

      {toast && <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">No standing orders yet. Click "+ New Standing Order".</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {orders.map((o) => (
            <div key={o.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{o.customer?.name || 'Unknown'}</h3>
                  {o.customer?.restaurant_name && <p className="text-xs text-gray-500">{o.customer.restaurant_name}</p>}
                </div>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded border capitalize ${statusBadge(o.status)}`}>{o.status}</span>
              </div>

              <div className="mt-4 space-y-1.5">
                {o.items.length === 0 ? (
                  <p className="text-xs text-gray-400">No line items</p>
                ) : o.items.map((it, i) => (
                  <div key={it.id || i} className="flex items-center justify-between text-sm text-gray-700">
                    <span>{it.size_name} × {it.quantity}</span>
                    <span className="text-gray-500">
                      {it.delivery_day_of_week != null ? DAYS[it.delivery_day_of_week] : 'any day'} · €{Number(it.price_at_time_eur).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {o.notes && <p className="mt-3 text-xs text-gray-500 italic">{o.notes}</p>}

              <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                <button onClick={() => openEdit(o)} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-1.5 rounded-lg border border-gray-200 font-semibold text-xs">Edit</button>
                <button onClick={() => handleDelete(o.id)} className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 py-1.5 rounded-lg border border-red-200 font-semibold text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{editing ? 'Edit Standing Order' : 'New Standing Order'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Customer *</label>
                  <select required value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none">
                    <option value="">Select customer...</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none">
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-600">Line Items</label>
                  <button type="button" onClick={addItem} className="text-green-700 text-xs font-semibold hover:underline">+ Add Item</button>
                </div>

                {form.items.length === 0 && <p className="text-xs text-gray-400 mb-2">No items. Click "+ Add Item".</p>}

                <div className="space-y-3">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Product</label>
                        <select value={it.variant_id} onChange={(e) => onVariantSelect(idx, e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-green-500 outline-none">
                          <option value="">Select...</option>
                          {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Qty</label>
                        <input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-green-500 outline-none" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">€/unit</label>
                        <input type="number" step="0.01" value={it.price_at_time_eur} onChange={(e) => updateItem(idx, { price_at_time_eur: Number(e.target.value) })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-green-500 outline-none" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Day</label>
                        <select value={it.delivery_day_of_week ?? ''} onChange={(e) => updateItem(idx, { delivery_day_of_week: e.target.value === '' ? null : Number(e.target.value) })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-green-500 outline-none">
                          <option value="">Any</option>
                          {DAYS.map((d, i) => <option key={i} value={i}>{d.slice(0, 3)}</option>)}
                        </select>
                      </div>
                      <div className="col-span-1 text-right">
                        <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 font-bold">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-lg text-sm shadow focus:outline-none focus:ring-2 focus:ring-green-400">
                  {editing ? 'Save Changes' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
