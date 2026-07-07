'use client';

import React, { useEffect, useState } from 'react';

interface Crop {
  id: string;
  name_en: string;
  name_de: string;
  status: string;
}

interface Variant {
  id: string;
  crop_id: string;
  size_name: string;
  size_grams: number;
  price_eur: number | null;
  is_internal: boolean;
}

interface Row {
  crop: Crop;
  variants: Variant[];
}

export default function SizesPricesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ size_name: string; size_grams: string; price_eur: string }>({ size_name: '', size_grams: '', price_eur: '' });

  // Add-new form state, keyed by crop.
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newVariant, setNewVariant] = useState<{ size_name: string; size_grams: string; price_eur: string }>({ size_name: '', size_grams: '', price_eur: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/size-templates');
      const json = await res.json();
      if (json.success) setRows(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const startEdit = (v: Variant) => {
    setEditingId(v.id);
    setDraft({
      size_name: v.size_name,
      size_grams: String(v.size_grams),
      price_eur: v.price_eur != null ? String(v.price_eur) : '',
    });
  };

  const saveEdit = async (v: Variant) => {
    try {
      const res = await fetch('/api/size-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: v.id,
          size_name: draft.size_name,
          size_grams: draft.size_grams,
          price_eur: draft.price_eur,
        }),
      });
      const json = await res.json();
      if (json.success) { flash('Saved'); setEditingId(null); fetchData(); }
      else flash(`Error: ${json.error}`);
    } catch (e) { console.error(e); }
  };

  const addVariant = async (cropId: string) => {
    if (!newVariant.size_name || !newVariant.size_grams) { flash('Size name and grams required'); return; }
    try {
      const res = await fetch('/api/size-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop_id: cropId, ...newVariant }),
      });
      const json = await res.json();
      if (json.success) {
        flash('Added size');
        setAddingFor(null);
        setNewVariant({ size_name: '', size_grams: '', price_eur: '' });
        fetchData();
      } else flash(`Error: ${json.error}`);
    } catch (e) { console.error(e); }
  };

  const deleteVariant = async (id: string) => {
    if (!confirm('Delete this size template?')) return;
    try {
      const res = await fetch('/api/size-templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json.success) { flash('Deleted'); fetchData(); }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sizes &amp; Prices</h1>
        <p className="text-sm text-gray-500 mt-1">Edit size templates and prices for each crop</p>
      </div>

      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">No crops found.</div>
      ) : (
        <div className="space-y-5">
          {rows.map((row) => (
            <div key={row.crop.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{row.crop.name_en}</h3>
                  <p className="text-xs text-gray-500">{row.crop.name_de}</p>
                </div>
                <button
                  onClick={() => { setAddingFor(row.crop.id); setNewVariant({ size_name: '', size_grams: '', price_eur: '' }); }}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  + Add Size
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      <th className="py-2 pr-4">Size</th>
                      <th className="py-2 pr-4">Grams</th>
                      <th className="py-2 pr-4">Price (EUR)</th>
                      <th className="py-2 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.variants.length === 0 && addingFor !== row.crop.id && (
                      <tr><td colSpan={4} className="py-4 text-gray-400 text-center">No sizes yet.</td></tr>
                    )}
                    {row.variants.map((v) => (
                      <tr key={v.id} className="border-b border-gray-50">
                        {editingId === v.id ? (
                          <>
                            <td className="py-2 pr-4">
                              <input value={draft.size_name} onChange={(e) => setDraft({ ...draft, size_name: e.target.value })}
                                className="w-28 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
                            </td>
                            <td className="py-2 pr-4">
                              <input type="number" value={draft.size_grams} onChange={(e) => setDraft({ ...draft, size_grams: e.target.value })}
                                className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
                            </td>
                            <td className="py-2 pr-4">
                              <input type="number" step="0.01" value={draft.price_eur} onChange={(e) => setDraft({ ...draft, price_eur: e.target.value })}
                                className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
                            </td>
                            <td className="py-2 pr-4 text-right space-x-2">
                              <button onClick={() => saveEdit(v)} className="text-green-700 font-semibold hover:underline">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-gray-500 hover:underline">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 pr-4 font-medium text-gray-900">{v.size_name}{v.is_internal && <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">internal</span>}</td>
                            <td className="py-2 pr-4 text-gray-700">{v.size_grams}g</td>
                            <td className="py-2 pr-4 text-gray-700">{v.price_eur != null ? `€${Number(v.price_eur).toFixed(2)}` : '—'}</td>
                            <td className="py-2 pr-4 text-right space-x-2">
                              <button onClick={() => startEdit(v)} className="text-green-700 font-semibold hover:underline">Edit</button>
                              <button onClick={() => deleteVariant(v.id)} className="text-red-600 font-semibold hover:underline">Delete</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}

                    {addingFor === row.crop.id && (
                      <tr className="bg-green-50/40">
                        <td className="py-2 pr-4">
                          <input placeholder="e.g. Small" value={newVariant.size_name} onChange={(e) => setNewVariant({ ...newVariant, size_name: e.target.value })}
                            className="w-28 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
                        </td>
                        <td className="py-2 pr-4">
                          <input type="number" placeholder="50" value={newVariant.size_grams} onChange={(e) => setNewVariant({ ...newVariant, size_grams: e.target.value })}
                            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
                        </td>
                        <td className="py-2 pr-4">
                          <input type="number" step="0.01" placeholder="0.00" value={newVariant.price_eur} onChange={(e) => setNewVariant({ ...newVariant, price_eur: e.target.value })}
                            className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
                        </td>
                        <td className="py-2 pr-4 text-right space-x-2">
                          <button onClick={() => addVariant(row.crop.id)} className="text-green-700 font-semibold hover:underline">Add</button>
                          <button onClick={() => setAddingFor(null)} className="text-gray-500 hover:underline">Cancel</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
