'use client';

import React, { useEffect, useState, useCallback } from 'react';

interface Variant {
  id?: string;
  crop_id?: string;
  size_name: string;
  size_grams: number;
  price_eur?: number | null;
  is_internal: boolean;
  container_size?: string | null;
  container_qty?: number;
}

interface Crop {
  id: string;
  name_en: string;
  name_de: string;
  status: string;
  deleted_at?: string | null;
  variants: Variant[];
}

// Per-cell editable state
interface CellEdit {
  price: string;
  container: string;
  qty: string;
}

interface EditedCrop extends Crop {
  cells: Record<string, CellEdit>; // size_name -> edits
  dirty: boolean;
}

interface PackagingSize {
  id: string;
  size_name: string;
}

export default function PricesPage() {
  const [crops, setCrops] = useState<EditedCrop[]>([]);
  const [allSizes, setAllSizes] = useState<string[]>([]);
  const [packagingSizes, setPackagingSizes] = useState<PackagingSize[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [showAddSize, setShowAddSize] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [newSizeGrams, setNewSizeGrams] = useState('');

  const fetch_ = async () => {
    setLoading(true);
    try {
      const [cropsRes, packRes] = await Promise.all([
        fetch('/api/crops'),
        fetch('/api/packaging-stock'),
      ]);
      const cropsJson = await cropsRes.json();
      const packJson = await packRes.json();
      if (packJson.success) setPackagingSizes(packJson.data || []);
      if (!cropsJson.success) return;

      const rawCrops: Crop[] = (cropsJson.data || []).filter((c: Crop) => !c.deleted_at);

      const sizeMap = new Map<string, number>();
      for (const crop of rawCrops) {
        for (const v of crop.variants || []) {
          if (!sizeMap.has(v.size_name)) sizeMap.set(v.size_name, v.size_grams);
        }
      }
      const sizes = Array.from(sizeMap.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name);

      setAllSizes(sizes);
      setCrops(rawCrops.map(crop => {
        const cells: Record<string, CellEdit> = {};
        for (const size of sizes) {
          const v = (crop.variants || []).find(x => x.size_name === size);
          cells[size] = {
            price: v?.price_eur != null ? String(v.price_eur) : '',
            container: v?.container_size || '',
            qty: v?.container_qty != null ? String(v.container_qty) : '1',
          };
        }
        return { ...crop, cells, dirty: false };
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch_(); }, []);

  const handleCellChange = (cropId: string, size: string, field: keyof CellEdit, val: string) => {
    setCrops(prev => prev.map(c =>
      c.id !== cropId ? c : {
        ...c,
        dirty: true,
        cells: { ...c.cells, [size]: { ...c.cells[size], [field]: val } },
      }
    ));
  };

  const buildVariants = (crop: EditedCrop, sizes: string[], sizeGrams: Map<string, number>): Variant[] => {
    const variantMap = new Map<string, Variant>();
    for (const v of crop.variants || []) {
      variantMap.set(v.size_name, { ...v });
    }
    for (const size of sizes) {
      const cell = crop.cells[size];
      if (!cell) continue;
      const price = cell.price !== '' ? parseFloat(cell.price) : null;
      const qty = parseInt(cell.qty) || 1;
      const container = cell.container || null;
      if (variantMap.has(size)) {
        const v = variantMap.get(size)!;
        v.price_eur = price != null && !isNaN(price) ? price : null;
        v.container_size = container;
        v.container_qty = qty;
      } else if (price != null && !isNaN(price)) {
        variantMap.set(size, {
          size_name: size,
          size_grams: sizeGrams.get(size) || 0,
          price_eur: price,
          container_size: container,
          container_qty: qty,
          is_internal: false,
        });
      }
    }
    return Array.from(variantMap.values()).filter(v => v.size_grams > 0);
  };

  const getSizeGrams = () => {
    const m = new Map<string, number>();
    for (const c of crops) for (const v of c.variants || []) m.set(v.size_name, v.size_grams);
    return m;
  };

  const saveRow = async (cropId: string) => {
    const crop = crops.find(c => c.id === cropId);
    if (!crop) return;
    setSaving(cropId);
    const variants = buildVariants(crop, allSizes, getSizeGrams());
    await fetch(`/api/crops/${cropId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cropId, variants }),
    });
    await fetch_();
    setSaving(null);
  };

  const saveAll = useCallback(async () => {
    const dirty = crops.filter(c => c.dirty);
    if (!dirty.length) return;
    setSavingAll(true);
    const sizeGrams = getSizeGrams();
    await Promise.all(dirty.map(crop => {
      const variants = buildVariants(crop, allSizes, sizeGrams);
      return fetch(`/api/crops/${crop.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crop.id, variants }),
      });
    }));
    await fetch_();
    setSavingAll(false);
  }, [crops, allSizes]);

  const handleAddSize = () => {
    const name = newSizeName.trim();
    const grams = parseFloat(newSizeGrams);
    if (!name || isNaN(grams) || grams <= 0) return;
    const newSizes = [...allSizes, name].sort((a, b) => {
      const ga = crops.flatMap(c => c.variants).find(v => v.size_name === a)?.size_grams ?? grams;
      const gb = crops.flatMap(c => c.variants).find(v => v.size_name === b)?.size_grams ?? grams;
      return ga - gb;
    });
    setAllSizes(newSizes);
    setCrops(prev => prev.map(c => ({
      ...c,
      cells: { ...c.cells, [name]: { price: '', container: '', qty: '1' } },
    })));
    setNewSizeName('');
    setNewSizeGrams('');
    setShowAddSize(false);
  };

  const hasDirty = crops.some(c => c.dirty);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>;
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Crop Summary</h1>
          <p className="text-sm text-gray-500 mt-1">Price, container and quantity per crop and size. Syncs with Crops → Sizes & Prices.</p>
        </div>
        <button onClick={() => setShowAddSize(true)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition">
          + Add Size
        </button>
      </div>

      {/* Add size modal */}
      {showAddSize && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Add New Size</h2>
            <p className="text-sm text-gray-500 mb-4">Adds a new column for all crops. Set price per crop to activate it.</p>
            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Size Name</label>
                <input value={newSizeName} onChange={e => setNewSizeName(e.target.value)} placeholder="e.g., 50g box"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Weight (grams)</label>
                <input type="number" value={newSizeGrams} onChange={e => setNewSizeGrams(e.target.value)} placeholder="e.g., 50"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowAddSize(false); setNewSizeName(''); setNewSizeGrams(''); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleAddSize} disabled={!newSizeName.trim() || !newSizeGrams}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition">Add Column</button>
            </div>
          </div>
        </div>
      )}

      {crops.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">No crops found.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 sticky left-0 bg-gray-50 z-10 min-w-[160px] border-b border-gray-200">
                  Crop
                </th>
                {allSizes.map(size => (
                  <th key={size} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-3 min-w-[140px] border-b border-gray-200">
                    {size}
                    <div className="flex justify-around mt-1 text-[10px] font-normal text-gray-400 normal-case tracking-normal">
                      <span>Price</span>
                      <span>Container</span>
                      <span>Qty</span>
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 w-20 border-b border-gray-200" />
              </tr>
            </thead>
            <tbody>
              {crops.map((crop, i) => (
                <tr key={crop.id}
                  className={`transition ${crop.dirty ? 'bg-yellow-50' : 'hover:bg-gray-50'} ${i < crops.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <td className={`px-5 py-3 sticky left-0 z-10 ${crop.dirty ? 'bg-yellow-50' : 'bg-white group-hover:bg-gray-50'}`}>
                    <div className="font-semibold text-gray-900">{crop.name_en}</div>
                    <div className="text-xs text-gray-400">{crop.name_de}</div>
                    {crop.dirty && <span className="text-[10px] text-yellow-600 font-semibold">unsaved</span>}
                  </td>
                  {allSizes.map(size => {
                    const cell = crop.cells[size] ?? { price: '', container: '', qty: '1' };
                    const hasData = cell.price !== '';
                    return (
                      <td key={size} className={`px-2 py-2 ${hasData ? 'bg-green-50' : ''}`}>
                        <div className="flex gap-1 items-center">
                          {/* Price */}
                          <div className="flex items-center gap-0.5 min-w-0">
                            <span className="text-gray-400 text-xs shrink-0">€</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={cell.price}
                              onChange={e => handleCellChange(crop.id, size, 'price', e.target.value)}
                              className={`w-14 text-center text-xs border rounded px-1 py-1.5 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200 ${hasData ? 'bg-white border-green-300' : 'bg-transparent border-gray-200'}`}
                              placeholder="—"
                            />
                          </div>
                          {/* Container */}
                          <select
                            value={cell.container}
                            onChange={e => handleCellChange(crop.id, size, 'container', e.target.value)}
                            className={`w-20 text-xs border rounded px-1 py-1.5 outline-none focus:border-green-400 text-gray-700 ${hasData ? 'bg-white border-green-300' : 'bg-transparent border-gray-200'}`}
                          >
                            <option value="">—</option>
                            {packagingSizes.map(ps => (
                              <option key={ps.id} value={ps.size_name}>{ps.size_name}</option>
                            ))}
                          </select>
                          {/* Qty */}
                          <input
                            type="number" min="1" step="1"
                            value={cell.qty}
                            onChange={e => handleCellChange(crop.id, size, 'qty', e.target.value)}
                            className={`w-10 text-center text-xs border rounded px-1 py-1.5 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200 ${hasData ? 'bg-white border-green-300' : 'bg-transparent border-gray-200'}`}
                            placeholder="1"
                          />
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <button onClick={() => saveRow(crop.id)}
                      disabled={!crop.dirty || saving === crop.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg transition bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed whitespace-nowrap">
                      {saving === crop.id ? '...' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasDirty && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between shadow-lg z-40">
          <span className="text-sm text-gray-600">
            {crops.filter(c => c.dirty).length} crop{crops.filter(c => c.dirty).length > 1 ? 's' : ''} with unsaved changes
          </span>
          <button onClick={saveAll} disabled={savingAll}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition">
            {savingAll ? 'Saving...' : 'Save All'}
          </button>
        </div>
      )}
    </div>
  );
}
