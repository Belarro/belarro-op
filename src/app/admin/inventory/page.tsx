'use client';

import React, { useEffect, useState } from 'react';

interface SeedInventory {
  id: string;
  crop_id: string;
  quantity_grams: number;
  seeds_per_tray: number;
  reorder_threshold_trays: number;
  crop: {
    name_en: string;
    name_de: string;
  };
}

interface Crop { id: string; name_en: string; }

interface PackagingStock {
  id: string;
  size_name: string;
  quantity: number;
}

interface SampleInventory {
  id: string;
  crop_id: string;
  available_grams: number;
  crop: {
    name_en: string;
  };
}

export default function InventoryPage() {
  const [seeds, setSeeds] = useState<SeedInventory[]>([]);
  const [packaging, setPackaging] = useState<PackagingStock[]>([]);
  const [samples, setSamples] = useState<SampleInventory[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'seeds' | 'packages' | 'samples'>('seeds');

  const [editId, setEditId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string>('');
  const [editMode, setEditMode] = useState<'add' | 'set'>('add');

  // Full edit modal for seeds
  const [editSeed, setEditSeed] = useState<SeedInventory | null>(null);
  const [editSeedForm, setEditSeedForm] = useState({ crop_id: '', quantity_grams: '', seeds_per_tray: '', reorder_threshold_trays: '' });

  const [showAddSeed, setShowAddSeed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seedForm, setSeedForm] = useState({
    crop_id: '',
    new_crop_name: '',
    quantity_grams: '',
    seeds_per_tray: '',
    reorder_threshold_trays: '20'
  });

  const [showAddPackaging, setShowAddPackaging] = useState(false);
  const [packagingForm, setPackagingForm] = useState({ size_name: '', quantity: '' });
  const [pkgEditId, setPkgEditId] = useState<string | null>(null);
  const [pkgEditQty, setPkgEditQty] = useState('');
  const [pkgEditMode, setPkgEditMode] = useState<'add' | 'set'>('add');

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const [invRes, cropRes, pkgRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/crops'),
        fetch('/api/packaging-stock'),
      ]);
      const invJson = await invRes.json();
      const cropJson = await cropRes.json();
      const pkgJson = await pkgRes.json();
      if (invJson.success) {
        setSeeds(invJson.data.seeds || []);
        setSamples(invJson.data.samples || []);
      }
      if (cropJson.success) setCrops(cropJson.data || []);
      if (pkgJson.success) setPackaging(pkgJson.data || []);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInventory(); }, []);

  const handleAddSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!seedForm.quantity_grams || !seedForm.seeds_per_tray) {
        alert('Please fill in all required fields');
        setSubmitting(false);
        return;
      }

      let cropId = seedForm.crop_id;

      // If adding new crop, create it first
      if (seedForm.crop_id === 'new') {
        if (!seedForm.new_crop_name) {
          alert('Please enter a crop name');
          setSubmitting(false);
          return;
        }

        const cropRes = await fetch('/api/crops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name_en: seedForm.new_crop_name,
            name_de: seedForm.new_crop_name,
            status: 'active'
          })
        });
        const cropJson = await cropRes.json();
        if (!cropJson.success) {
          alert(`Failed to create crop: ${cropJson.error}`);
          setSubmitting(false);
          return;
        }
        cropId = cropJson.data.id;
      } else if (!seedForm.crop_id) {
        alert('Please select or create a crop');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crop_id: cropId,
          quantity_grams: seedForm.quantity_grams,
          seeds_per_tray: seedForm.seeds_per_tray,
          reorder_threshold_trays: seedForm.reorder_threshold_trays
        })
      });
      const json = await res.json();
      if (json.success) {
        setShowAddSeed(false);
        setSeedForm({ crop_id: '', new_crop_name: '', quantity_grams: '', seeds_per_tray: '', reorder_threshold_trays: '20' });
        fetchInventory();
      } else {
        alert(`Error: ${json.error}`);
      }
    } catch (error) {
      alert(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPackaging = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/packaging-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packagingForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowAddPackaging(false);
        setPackagingForm({ size_name: '', quantity: '' });
        fetchInventory();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePkgQty = async (id: string) => {
    const res = await fetch('/api/packaging-stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, quantity: parseInt(pkgEditQty) || 0, mode: pkgEditMode }),
    });
    const json = await res.json();
    if (json.success) { setPkgEditId(null); setPkgEditQty(''); fetchInventory(); }
  };

  const handleSaveEditSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSeed || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/inventory/seed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editSeed.id,
          crop_id: editSeedForm.crop_id,
          quantity_grams: parseFloat(editSeedForm.quantity_grams),
          seeds_per_tray: parseFloat(editSeedForm.seeds_per_tray),
          reorder_threshold_trays: parseInt(editSeedForm.reorder_threshold_trays) || 20,
        }),
      });
      setEditSeed(null);
      fetchInventory();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSeed = async (id: string) => {
    if (!confirm('Delete this seed stock entry?')) return;
    try {
      const res = await fetch('/api/inventory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'seeds', id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) alert(json?.error || `Delete failed (${res.status})`);
    } catch {
      alert('Network error — delete failed');
    } finally {
      fetchInventory();
    }
  };

  const handleDeletePackaging = async (id: string) => {
    if (!confirm('Delete this package size?')) return;
    try {
      const res = await fetch('/api/packaging-stock', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) alert(json?.error || `Delete failed (${res.status})`);
    } catch {
      alert('Network error — delete failed');
    } finally {
      fetchInventory();
    }
  };

  const handleSaveQty = async (type: 'seeds' | 'packages' | 'samples', id: string, currentQty: number) => {
    try {
      const delta = parseFloat(editQty) || 0;
      const newQty = editMode === 'add' ? currentQty + delta : delta;
      const res = await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, quantity: newQty })
      });
      const json = await res.json();
      if (json.success) {
        setEditId(null);
        setEditQty('');
        fetchInventory();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Farm Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Manage seed stocks, boxes/containers, and sample materials</p>
        </div>
        {activeTab === 'seeds' && (
          <button onClick={() => setShowAddSeed(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2.5 rounded-lg shadow transition">
            + Add Seed
          </button>
        )}
        {activeTab === 'packages' && (
          <button onClick={() => setShowAddPackaging(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2.5 rounded-lg shadow transition">
            + Add Package Size
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['seeds', 'packages', 'samples'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setEditId(null); }}
            className={`px-6 py-3 text-sm font-semibold border-b-2 capitalize transition ${
              activeTab === tab 
                ? 'border-green-600 text-green-700 font-bold' 
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab} Stock
          </button>
        ))}
      </div>

      {/* Tables */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          
          {/* SEEDS TABLE */}
          {activeTab === 'seeds' && (
            <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                  <th className="p-4">Crop / Seed Type</th>
                  <th className="p-4 text-center">Stock (Grams)</th>
                  <th className="p-4 text-center">Grams / Tray</th>
                  <th className="p-4 text-center">Trays Available</th>
                  <th className="p-4 text-center">Reorder At</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {seeds.map(s => {
                  const gramsPerTray = s.seeds_per_tray || 60;
                  const remainingTrays = Math.floor(s.quantity_grams / gramsPerTray);
                  const isLow = remainingTrays < s.reorder_threshold_trays;
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="p-4 font-semibold text-gray-900">{s.crop.name_en}</td>
                      <td className="p-4 text-center">
                        {editId === s.id ? (
                          <input
                            type="number"
                            value={editQty}
                            onChange={e => setEditQty(e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-center outline-none focus:ring-2 focus:ring-green-500"
                          />
                        ) : (
                          <span className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                            {s.quantity_grams}g
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center text-gray-500 font-medium">
                        {gramsPerTray}g
                      </td>
                      <td className="p-4 text-center font-bold">
                        <span className={isLow ? 'text-red-600' : 'text-gray-900'}>{remainingTrays}</span>
                      </td>
                      <td className="p-4 text-center text-gray-500 font-semibold">
                        {s.reorder_threshold_trays}
                      </td>
                      <td className="p-4 text-right">
                        {editId === s.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-gray-500 font-semibold">
                              {editMode === 'add' ? `${s.quantity_grams}g +` : 'Set to'}
                            </span>
                            <input
                              type="number" min="0" autoFocus
                              value={editQty}
                              onChange={e => setEditQty(e.target.value)}
                              className="w-20 px-2 py-1 border border-green-400 rounded text-center text-sm outline-none focus:ring-2 focus:ring-green-500"
                              placeholder="grams"
                            />
                            <span className="text-xs text-gray-400">g</span>
                            <button
                              onClick={() => handleSaveQty('seeds', s.id, s.quantity_grams)}
                              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-2.5 py-1 rounded text-xs"
                            >Save</button>
                            <button
                              onClick={() => { setEditId(null); setEditQty(''); }}
                              className="text-gray-400 hover:text-gray-600 font-bold text-sm"
                            >✕</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setEditId(s.id); setEditQty(''); setEditMode('add'); }}
                              className="bg-green-50 hover:bg-green-100 text-green-700 font-semibold px-3 py-1.5 rounded-lg border border-green-200 text-xs"
                            >+ Received</button>
                            <button
                              onClick={() => { setEditSeed(s); setEditSeedForm({ crop_id: s.crop_id, quantity_grams: s.quantity_grams.toString(), seeds_per_tray: (s.seeds_per_tray || '').toString(), reorder_threshold_trays: s.reorder_threshold_trays.toString() }); }}
                              className="bg-gray-50 hover:bg-gray-100 text-gray-600 font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-xs"
                            >Edit</button>
                            <button
                              onClick={() => handleDeleteSeed(s.id)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-xs"
                            >Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}

          {/* PACKAGES TABLE */}
          {activeTab === 'packages' && (
            <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                  <th className="p-4">Package Size</th>
                  <th className="p-4 text-center">In Stock (Units)</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {packaging.length === 0 ? (
                  <tr><td colSpan={3} className="p-8 text-center text-gray-400">No package sizes yet. Click + Add Package Size to start.</td></tr>
                ) : packaging.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="p-4 font-semibold text-gray-900">{p.size_name}</td>
                    <td className="p-4 text-center">
                      {pkgEditId === p.id ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-xs text-gray-500 font-semibold">
                            {pkgEditMode === 'add' ? `${p.quantity} +` : 'Set to'}
                          </span>
                          <input
                            type="number" min="0" autoFocus
                            value={pkgEditQty}
                            onChange={e => setPkgEditQty(e.target.value)}
                            className="w-20 px-2 py-1 border border-green-400 rounded text-center text-sm outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="units"
                          />
                        </div>
                      ) : (
                        <span className="font-bold text-gray-900">{p.quantity} units</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {pkgEditId === p.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleSavePkgQty(p.id)}
                            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-2.5 py-1 rounded text-xs">Save</button>
                          <button onClick={() => { setPkgEditId(null); setPkgEditQty(''); }}
                            className="text-gray-400 hover:text-gray-600 font-bold text-sm">✕</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setPkgEditId(p.id); setPkgEditQty(''); setPkgEditMode('add'); }}
                            className="bg-green-50 hover:bg-green-100 text-green-700 font-semibold px-3 py-1.5 rounded-lg border border-green-200 text-xs">
                            + Received
                          </button>
                          <button
                            onClick={() => { setPkgEditId(p.id); setPkgEditQty(p.quantity.toString()); setPkgEditMode('set'); }}
                            className="bg-gray-50 hover:bg-gray-100 text-gray-600 font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-xs">
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeletePackaging(p.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-xs">
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {/* SAMPLES TABLE */}
          {activeTab === 'samples' && (
            <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                  <th className="p-4">Crop Variety</th>
                  <th className="p-4 text-center">Available Sample Weight (Grams)</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {samples.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="p-4 font-semibold text-gray-900">{s.crop.name_en}</td>
                    <td className="p-4 text-center">
                      {editId === s.id ? (
                        <input
                          type="number"
                          value={editQty}
                          onChange={e => setEditQty(e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-center outline-none focus:ring-2 focus:ring-green-500"
                        />
                      ) : (
                        <span className="font-bold text-gray-900">{s.available_grams}g</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {editId === s.id ? (
                        <div className="space-x-2">
                          <button
                            onClick={() => handleSaveQty('samples', s.id, s.available_grams)}
                            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-2.5 py-1 rounded text-xs"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-2.5 py-1 rounded text-xs border border-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditId(s.id); setEditQty(s.available_grams.toString()); }}
                          className="bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-xs"
                        >
                          Adjust Stock
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

        </div>
      )}
      {/* Add Package Size Modal */}
      {showAddPackaging && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Package Size</h2>
              <button onClick={() => setShowAddPackaging(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleAddPackaging} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Size Name *</label>
                <input
                  type="text" required
                  value={packagingForm.size_name}
                  onChange={e => setPackagingForm({ ...packagingForm, size_name: e.target.value })}
                  placeholder="e.g. 750ml, 2000ml, Container"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Current Stock (units)</label>
                <input
                  type="number" min="0"
                  value={packagingForm.quantity}
                  onChange={e => setPackagingForm({ ...packagingForm, quantity: e.target.value })}
                  placeholder="e.g. 100"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddPackaging(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm shadow">
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Seed Modal */}
      {editSeed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Seed Stock</h2>
              <button onClick={() => setEditSeed(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveEditSeed} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Crop *</label>
                <select required value={editSeedForm.crop_id} onChange={e => setEditSeedForm({ ...editSeedForm, crop_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none">
                  <option value="">Select Crop...</option>
                  {crops.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Stock (grams) *</label>
                <input type="number" min="0" required
                  value={editSeedForm.quantity_grams}
                  onChange={e => setEditSeedForm({ ...editSeedForm, quantity_grams: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Grams per tray *</label>
                <input type="number" min="1" required
                  value={editSeedForm.seeds_per_tray}
                  onChange={e => setEditSeedForm({ ...editSeedForm, seeds_per_tray: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
                {editSeedForm.quantity_grams && editSeedForm.seeds_per_tray && (
                  <p className="text-xs text-green-700 font-semibold mt-1">
                    = {Math.floor(parseFloat(editSeedForm.quantity_grams) / parseFloat(editSeedForm.seeds_per_tray))} trays available
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Reorder when below (trays)</label>
                <input type="number" min="1"
                  value={editSeedForm.reorder_threshold_trays}
                  onChange={e => setEditSeedForm({ ...editSeedForm, reorder_threshold_trays: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setEditSeed(null)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm shadow">
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Seed Modal */}
      {showAddSeed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Seed Stock</h2>
              <button onClick={() => setShowAddSeed(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleAddSeed} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Crop *</label>
                {seedForm.crop_id === 'new' ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={seedForm.new_crop_name || ''}
                      onChange={e => setSeedForm({ ...seedForm, new_crop_name: e.target.value })}
                      placeholder="e.g. Basil, Microgreens"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSeedForm({ ...seedForm, crop_id: '', new_crop_name: '' })}
                      className="text-xs text-gray-500 hover:text-gray-700 font-semibold"
                    >
                      ← Back to list
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      required
                      value={seedForm.crop_id}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'new') {
                          setSeedForm({ ...seedForm, crop_id: 'new' });
                        } else {
                          setSeedForm({ ...seedForm, crop_id: val });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="">Select Crop...</option>
                      {crops
                        .filter(c => !seeds.some(s => s.crop_id === c.id))
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name_en}</option>
                        ))}
                      <option value="new">+ Add New Variety</option>
                    </select>
                    {seeds.length === 0 && (
                      <p className="text-xs text-orange-600 mt-1 font-semibold">⚠️ Inventory not fully loaded. Please wait.</p>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Current Stock (grams) *</label>
                <input
                  type="number" min="0" required
                  value={seedForm.quantity_grams}
                  onChange={e => setSeedForm({ ...seedForm, quantity_grams: e.target.value })}
                  placeholder="e.g. 500"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Grams of seed per tray *</label>
                <input
                  type="number" min="1" required
                  value={seedForm.seeds_per_tray}
                  onChange={e => setSeedForm({ ...seedForm, seeds_per_tray: e.target.value })}
                  placeholder="e.g. 60"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
                {seedForm.quantity_grams && seedForm.seeds_per_tray && (
                  <p className="text-xs text-green-700 font-semibold mt-1">
                    = {Math.floor(parseFloat(seedForm.quantity_grams) / parseFloat(seedForm.seeds_per_tray))} trays available
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Reorder when below (trays)</label>
                <input
                  type="number" min="1"
                  value={seedForm.reorder_threshold_trays}
                  onChange={e => setSeedForm({ ...seedForm, reorder_threshold_trays: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddSeed(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm shadow">
                  {submitting ? 'Saving...' : 'Save Seed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
