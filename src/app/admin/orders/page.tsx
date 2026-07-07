'use client';

import React, { useEffect, useState, useMemo } from 'react';

interface OrderLine {
  id: string;
  customer_id: string;
  product_variant_id: string;
  quantity: number;
  status: string;
  customer: { id: string; name: string; email: string; restaurant_name?: string };
  variant: {
    id: string;
    size_name: string;
    size_grams: number;
    price_eur: number;
    crop: { id: string; name_en: string; name_de: string };
  } | null;
}

interface Customer { id: string; name: string; restaurant_name?: string; status: 'prospect' | 'active' | 'paused' | 'inactive' }
interface Crop {
  id: string;
  name_en: string;
  variants?: Array<{ id: string; size_name: string; price_eur: number }>;
}

interface NewLine { crop_id: string; product_variant_id: string; quantity: string; frequency: 'weekly' | 'biweekly' }
const emptyLine = (): NewLine => ({ crop_id: '', product_variant_id: '', quantity: '1', frequency: 'weekly' });

// Customer group with editable lines
interface CustomerGroup {
  customer: OrderLine['customer'];
  lines: OrderLine[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderLine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add order modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCustomerId, setAddCustomerId] = useState('');
  const [addLines, setAddLines] = useState<NewLine[]>([emptyLine()]);

  // Edit modal — shows all lines for one customer
  const [editGroup, setEditGroup] = useState<CustomerGroup | null>(null);
  const [editQty, setEditQty] = useState<Record<string, string>>({});
  const [editFreq, setEditFreq] = useState<Record<string, 'weekly' | 'biweekly'>>({});
  const [editSwap, setEditSwap] = useState<Record<string, string>>({}); // lineId → new variant_id
  const [submitting, setSubmitting] = useState(false);
  const [pausingId, setPausingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/orders');
      const json = await res.json();
      if (json.success) setOrders(json.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchResources = async () => {
    try {
      const [cRes, crRes] = await Promise.all([fetch('/api/customers'), fetch('/api/crops')]);
      const cJson = await cRes.json();
      const crJson = await crRes.json();
      if (cJson.success) setCustomers(cJson.data || []);
      if (crJson.success) setCrops(crJson.data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchOrders(); fetchResources(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, CustomerGroup>();
    for (const o of orders) {
      if (!o.customer) continue;
      if (!map.has(o.customer_id)) map.set(o.customer_id, { customer: o.customer, lines: [] });
      map.get(o.customer_id)!.lines.push(o);
    }
    return Array.from(map.values());
  }, [orders]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped.filter(g =>
      (g.customer.restaurant_name || g.customer.name).toLowerCase().includes(q)
    );
  }, [grouped, search]);

  // --- Add order ---
  const updateAddLine = (i: number, field: keyof NewLine, value: string) => {
    setAddLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'crop_id') next[i].product_variant_id = '';
      return next;
    });
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const validLines = addLines.filter(l => l.product_variant_id);
      if (!validLines.length) {
        alert('Please select at least one product');
        setSubmitting(false);
        return;
      }

      // One request for all lines: the server aligns the whole order's first
      // delivery to its longest crop, so everything is ready together.
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: addCustomerId,
          lines: validLines.map(l => ({
            product_variant_id: l.product_variant_id,
            quantity: parseFloat(l.quantity) || 1,
            frequency: l.frequency || 'weekly',
          })),
        }),
      });

      const json = await res.json();
      if (!json.success) {
        alert(`Failed: ${json.error}`);
        setSubmitting(false);
        return;
      }

      setShowAddModal(false);
      setAddCustomerId('');
      setAddLines([emptyLine()]);
      fetchOrders();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Edit customer orders ---
  const openEdit = (group: CustomerGroup) => {
    setEditGroup(group);
    const qtyMap: Record<string, string> = {};
    const freqMap: Record<string, 'weekly' | 'biweekly'> = {};
    group.lines.forEach(l => {
      qtyMap[l.id] = String(l.quantity);
      freqMap[l.id] = (l as any).frequency === 'biweekly' ? 'biweekly' : 'weekly';
    });
    setEditQty(qtyMap);
    setEditFreq(freqMap);
    setEditSwap({});
  };

  const handleSaveEdit = async () => {
    if (!editGroup || submitting) return;
    setSubmitting(true);
    try {
      for (const line of editGroup.lines) {
        const newQty = parseFloat(editQty[line.id]);
        const newFreq = editFreq[line.id] || 'weekly';
        const freqChanged = newFreq !== ((line as any).frequency || 'weekly');
        const swapVariant = editSwap[line.id];

        if (swapVariant && swapVariant !== line.product_variant_id) {
          // Crop swap: server keeps the old crop's pipeline delivering and
          // starts the new crop the Tuesday after the old one's last batch.
          const res = await fetch(`/api/orders/${line.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              swap_to_variant_id: swapVariant,
              quantity: newQty || line.quantity,
              frequency: newFreq,
            }),
          });
          const json = await res.json();
          if (json.success && json.message) alert(json.message);
        } else if ((newQty && newQty !== line.quantity) || freqChanged) {
          await fetch(`/api/orders/${line.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: newQty || line.quantity, frequency: newFreq }),
          });
        }
      }
    } finally {
      setSubmitting(false);
      setEditGroup(null);
      await fetchOrders();
    }
  };

  const handleDeleteLine = async (id: string) => {
    if (!confirm('Remove this crop from the order?')) return;
    await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    const res = await fetch('/api/orders');
    const json = await res.json();
    if (json.success) {
      const fresh: OrderLine[] = json.data || [];
      setOrders(fresh);
      if (editGroup) {
        const updatedLines = fresh.filter(o => o.customer_id === editGroup.customer.id);
        if (updatedLines.length === 0) {
          setEditGroup(null);
        } else {
          setEditGroup({ ...editGroup, lines: updatedLines });
          const qtyMap: Record<string, string> = {};
          updatedLines.forEach(l => { qtyMap[l.id] = String(l.quantity); });
          setEditQty(qtyMap);
        }
      }
    }
  };

  const handleTogglePause = async (customerId: string, currentlyPaused: boolean) => {
    setPausingId(customerId);
    try {
      const customerLines = orders.filter(o => o.customer_id === customerId);
      const newStatus = currentlyPaused ? 'active' : 'paused';
      await Promise.all(customerLines.map(line =>
        fetch(`/api/orders/${line.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
      ));
      await fetchOrders();
    } finally {
      setPausingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">One card per customer — all their crops in one place</p>
        </div>
        <button
          onClick={() => { setAddCustomerId(''); setAddLines([emptyLine()]); setShowAddModal(true); }}
          className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2.5 rounded-lg shadow transition"
        >
          + New Order
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search customer..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
      />

      {/* Customer Cards */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          {search ? `No customer matching "${search}"` : 'No orders yet. Click + New Order to start.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(({ customer, lines }) => {
            const isPaused = lines.length > 0 && lines.every(l => (l as any).status === 'paused');
            return (
            <div key={customer.id} className={`bg-white border rounded-xl shadow-sm overflow-hidden ${isPaused ? 'border-amber-300 opacity-75' : 'border-gray-200'}`}>
              <div className={`flex items-center justify-between px-5 py-3 border-b ${isPaused ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 text-base">{customer.restaurant_name || customer.name}</span>
                  {isPaused && <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Paused</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTogglePause(customer.id, isPaused)}
                    disabled={pausingId === customer.id}
                    className={`text-sm font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50 ${isPaused ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300'}`}
                  >
                    {pausingId === customer.id ? '...' : isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    onClick={() => openEdit({ customer, lines })}
                    className="text-sm font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition"
                  >
                    Edit
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-gray-400 font-semibold border-b border-gray-100">
                    <th className="px-5 py-2 text-left">Crop</th>
                    <th className="px-5 py-2 text-left">Size</th>
                    <th className="px-5 py-2 text-center">Qty</th>
                    <th className="px-5 py-2 text-center">Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map(line => (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-semibold text-gray-900">{line.variant?.crop.name_en ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{line.variant?.size_name ?? '—'}</td>
                      <td className="px-5 py-3 text-center font-bold text-gray-900">{line.quantity}</td>
                      <td className="px-5 py-3 text-center">
                        {(line as any).frequency === 'biweekly'
                          ? <span className="inline-block px-2.5 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-50 text-amber-700">Every 2 weeks</span>
                          : <span className="inline-block px-2.5 py-0.5 text-[10px] font-extrabold rounded-full bg-green-50 text-green-700">Weekly</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );})}
        </div>
      )}

      {/* Add Order Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">New Order</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleCreateOrder} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Customer *</label>
                <select required value={addCustomerId} onChange={e => setAddCustomerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none">
                  <option value="">Select Customer...</option>
                  {customers.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.restaurant_name || c.name}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-600">Crops *</label>
                {addLines.map((line, i) => {
                  const variants = crops.find(c => c.id === line.crop_id)?.variants || [];
                  return (
                    <div key={i} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1 space-y-2">
                        <select required value={line.crop_id} onChange={e => updateAddLine(i, 'crop_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none">
                          <option value="">Select Crop...</option>
                          {crops.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                        </select>
                        {line.crop_id && (
                          <select required value={line.product_variant_id} onChange={e => updateAddLine(i, 'product_variant_id', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none">
                            <option value="">Select Size...</option>
                            {variants.map(v => <option key={v.id} value={v.id}>{v.size_name} (€{v.price_eur?.toFixed(2) ?? '0.00'})</option>)}
                          </select>
                        )}
                      </div>
                      <input type="number" min="1" required value={line.quantity}
                        onChange={e => updateAddLine(i, 'quantity', e.target.value)}
                        className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                      <button
                        type="button"
                        onClick={() => updateAddLine(i, 'frequency', line.frequency === 'biweekly' ? 'weekly' : 'biweekly')}
                        className={`text-xs font-bold px-2 py-2 rounded-lg border transition whitespace-nowrap ${line.frequency === 'biweekly' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-green-50 border-green-200 text-green-700'}`}
                      >
                        {line.frequency === 'biweekly' ? '2 weeks' : 'Weekly'}
                      </button>
                      {addLines.length > 1 && (
                        <button type="button" onClick={() => setAddLines(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-red-400 hover:text-red-600 font-bold text-lg mt-1">×</button>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={() => setAddLines(prev => [...prev, emptyLine()])}
                  className="text-green-600 hover:text-green-700 text-sm font-semibold">+ Add another crop</button>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg text-sm shadow">
                  {submitting ? 'Saving...' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Orders Modal */}
      {editGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{editGroup.customer.restaurant_name || editGroup.customer.name}</h2>
              <button onClick={() => setEditGroup(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              {editGroup.lines.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No crops in this order.</p>
              ) : editGroup.lines.map(line => (
                <div key={line.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1">
                    <select
                      value={editSwap[line.id] || line.product_variant_id}
                      onChange={e => setEditSwap(prev => ({ ...prev, [line.id]: e.target.value }))}
                      className="w-full font-semibold text-gray-900 text-sm bg-transparent border border-transparent hover:border-gray-300 rounded-lg px-1 py-1 focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                    >
                      {!crops.some(c => (c.variants || []).some(v => v.id === line.product_variant_id)) && (
                        <option value={line.product_variant_id}>
                          {line.variant?.crop.name_en ?? '—'} · {line.variant?.size_name ?? '—'}
                        </option>
                      )}
                      {crops.map(c => (c.variants || []).map(v => (
                        <option key={v.id} value={v.id}>{c.name_en} · {v.size_name}</option>
                      )))}
                    </select>
                    {editSwap[line.id] && editSwap[line.id] !== line.product_variant_id && (
                      <div className="text-xs text-amber-600 font-semibold px-1 mt-0.5">
                        Swap: current crop keeps delivering until its last batch, then this one takes over
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={editQty[line.id] ?? line.quantity}
                      onChange={e => setEditQty(prev => ({ ...prev, [line.id]: e.target.value }))}
                      className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-green-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setEditFreq(prev => ({ ...prev, [line.id]: prev[line.id] === 'biweekly' ? 'weekly' : 'biweekly' }))}
                      className={`text-xs font-bold px-2 py-1.5 rounded-lg border transition whitespace-nowrap ${editFreq[line.id] === 'biweekly' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-green-50 border-green-200 text-green-700'}`}
                    >
                      {editFreq[line.id] === 'biweekly' ? '2 weeks' : 'Weekly'}
                    </button>
                  </div>
                  <button onClick={() => handleDeleteLine(line.id)}
                    className="text-red-400 hover:text-red-600 font-bold text-sm px-2">Delete</button>
                </div>
              ))}
              <button
                onClick={() => {
                  setEditGroup(null);
                  setAddCustomerId(editGroup.customer.id);
                  setAddLines([emptyLine()]);
                  setShowAddModal(true);
                }}
                className="text-green-600 hover:text-green-700 text-sm font-semibold">
                + Add another crop
              </button>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setEditGroup(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handleSaveEdit}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-lg text-sm shadow">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
