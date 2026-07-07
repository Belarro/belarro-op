'use client';

import { useEffect, useState } from 'react';

interface GrowthProcedure {
  id?: string;
  crop_id?: string;
  soak_enabled: boolean;
  soak_hours?: number;
  cover_soil_enabled: boolean;
  stack_enabled: boolean;
  stack_days?: number;
  humidity_dome_enabled: boolean;
  blackout_enabled?: boolean;
  blackout_days?: number;
  humidity_dome_days?: number;
  light_enabled?: boolean;
  light_days?: number;
  created_at?: string;
  updated_at?: string;
}

interface ProductVariant {
  id?: string;
  crop_id?: string;
  size_name: string;
  size_grams: number;
  price_eur?: number;
  is_internal: boolean;
  container_size?: string;
  container_qty?: number;
  created_at?: string;
  updated_at?: string;
}

interface PackagingSize {
  id: string;
  size_name: string;
  quantity: number;
}

interface MixComponent {
  id?: string;
  component_crop_id: string;
  percentage: number;
}

interface Crop {
  id: string;
  name_en: string;
  name_de: string;
  flavor_en?: string;
  flavor_de?: string;
  status: 'active' | 'paused';
  photo_url?: string | null;
  is_mix?: boolean;
  seeds_per_tray_grams?: number | null;
  yield_per_tray_grams?: number | null;
  procedure?: GrowthProcedure;
  variants?: ProductVariant[];
  mix_components?: MixComponent[];
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

type Tab = 'basics' | 'procedure' | 'sizes';

const GROWTH_ENV_OPTIONS = ['light', 'blackout', 'humidity_dome'] as const;

export default function AdminCropsPage() {
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('basics');
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isNewCrop, setIsNewCrop] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name_en: '',
    name_de: '',
    flavor_en: '',
    flavor_de: '',
    status: 'active' as 'active' | 'paused',
    photo_url: '',
    seeds_per_tray_grams: '' as string | number,
    yield_per_tray_grams: '' as string | number,
  });

  const [procedure, setProcedure] = useState<GrowthProcedure>({
    soak_enabled: false,
    soak_hours: undefined,
    cover_soil_enabled: false,
    stack_enabled: false,
    stack_days: undefined,
    humidity_dome_enabled: false,
    blackout_enabled: false,
    blackout_days: undefined,
    humidity_dome_days: undefined,
    light_enabled: true,
    light_days: undefined,
  });

  const [isMix, setIsMix] = useState(false);
  const [mixComponents, setMixComponents] = useState<MixComponent[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [newVariant, setNewVariant] = useState({ size_name: '', size_grams: '', price_eur: '', container_size: '', container_qty: '1' });
  const [packagingSizes, setPackagingSizes] = useState<PackagingSize[]>([]);
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(null);
  const [editingVariant, setEditingVariant] = useState({ size_name: '', size_grams: '', price_eur: '', container_size: '', container_qty: '1' });
  const [showAddVariantForm, setShowAddVariantForm] = useState(false);

  // Fetch packaging sizes for container dropdown
  const fetchPackagingSizes = async () => {
    try {
      const res = await fetch('/api/packaging-stock');
      const json = await res.json();
      if (json.success) setPackagingSizes(json.data || []);
    } catch {}
  };

  // Fetch crops
  const fetchCrops = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/crops');
      const json = await res.json();
      if (json.success) {
        setCrops(json.data || []);
      } else {
        showToast(json.error || 'Failed to load crops', 'error');
      }
    } catch (error) {
      console.error('Failed to load crops:', error);
      showToast('Error loading crops', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrops();
    fetchPackagingSizes();
  }, []);

  // Load selected crop
  useEffect(() => {
    if (selectedCropId && !isNewCrop) {
      loadCropData(selectedCropId);
    }
  }, [selectedCropId]);

  const loadCropData = async (cropId: string) => {
    try {
      const res = await fetch(`/api/crops/${cropId}`);
      const json = await res.json();
      if (json.success && json.data) {
        const crop = json.data;
        setFormData({
          name_en: crop.name_en || '',
          name_de: crop.name_de || '',
          flavor_en: crop.flavor_en || '',
          flavor_de: crop.flavor_de || '',
          status: crop.status || 'active',
          photo_url: crop.photo_url || '',
          seeds_per_tray_grams: crop.seeds_per_tray_grams ?? '',
          yield_per_tray_grams: crop.yield_per_tray_grams ?? '',
        });
        setProcedure(crop.procedure ? {
          soak_enabled: crop.procedure.soak_enabled || false,
          soak_hours: crop.procedure.soak_hours || undefined,
          cover_soil_enabled: crop.procedure.cover_soil_enabled || false,
          stack_enabled: crop.procedure.stack_enabled || false,
          stack_days: crop.procedure.stack_days || undefined,
          humidity_dome_enabled: crop.procedure.humidity_dome_enabled || false,
          humidity_dome_days: crop.procedure.humidity_dome_days || undefined,
          blackout_enabled: crop.procedure.blackout_enabled || false,
          blackout_days: crop.procedure.blackout_days || undefined,
          light_enabled: crop.procedure.light_enabled !== false,
          light_days: crop.procedure.light_days || undefined,
        } : {
          soak_enabled: false,
          soak_hours: undefined,
          cover_soil_enabled: false,
          stack_enabled: false,
          stack_days: undefined,
          humidity_dome_enabled: false,
          blackout_enabled: false,
          blackout_days: undefined,
          humidity_dome_days: undefined,
          light_enabled: true,
          light_days: undefined,
        });
        setVariants(crop.variants || []);
        setIsMix(crop.is_mix || false);
        setMixComponents(crop.mix_components || []);
      }
    } catch (error) {
      console.error('Failed to load crop:', error);
      showToast('Failed to load crop data', 'error');
    }
  };

  const selectedCrop = crops.find(c => c.id === selectedCropId);
  const filteredCrops = crops.filter(c =>
    (c.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name_de.toLowerCase().includes(searchQuery.toLowerCase())) &&
    !c.deleted_at
  );

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSave = async () => {
    if (!formData.name_en || !formData.name_de) {
      showToast('Name (EN) and Name (DE) are required', 'error');
      return;
    }

    if (procedure.soak_enabled && !procedure.soak_hours) {
      showToast('Soak hours required if soak is enabled', 'error');
      return;
    }

    if (procedure.stack_enabled && !procedure.stack_days) {
      showToast('Stack days required if stack is enabled', 'error');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        id: isNewCrop ? undefined : selectedCropId,
        name_en: formData.name_en,
        name_de: formData.name_de,
        flavor_en: formData.flavor_en || null,
        flavor_de: formData.flavor_de || null,
        status: formData.status,
        photo_url: formData.photo_url || null,
        seeds_per_tray_grams: !isMix && formData.seeds_per_tray_grams !== '' ? Number(formData.seeds_per_tray_grams) : null,
        yield_per_tray_grams: !isMix && formData.yield_per_tray_grams !== '' ? Number(formData.yield_per_tray_grams) : null,
        is_mix: isMix,
        mix_components: isMix ? mixComponents.filter(c => c.component_crop_id && c.percentage > 0) : [],
        procedure: isMix ? null : procedure,
        variants: variants.filter(v => v.size_name && v.size_grams),
      };

      const method = isNewCrop ? 'POST' : 'PUT';
      const url = isNewCrop ? '/api/crops' : `/api/crops/${selectedCropId}`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        showToast(isNewCrop ? 'Crop created' : 'Crop updated', 'success');
        setIsNewCrop(false);
        setIsEditing(false);
        const savedId = isNewCrop ? json.data.id : selectedCropId;
        if (isNewCrop) {
          setSelectedCropId(json.data.id);
        }
        await Promise.all([fetchCrops(), loadCropData(savedId!)]);
      } else {
        showToast(json.error || 'Failed to save', 'error');
      }
    } catch (error) {
      console.error('Save error:', error);
      showToast('Error saving crop', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCropId) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/crops/${selectedCropId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedCropId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Crop deleted', 'success');
        setShowDeleteConfirm(false);
        setSelectedCropId(null);
        await fetchCrops();
      } else {
        showToast('Failed to delete', 'error');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Error deleting crop', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNewCrop = () => {
    setIsNewCrop(true);
    setSelectedCropId(null);
    setIsEditing(true);
    setActiveTab('basics');
    setFormData({ name_en: '', name_de: '', flavor_en: '', flavor_de: '', status: 'active', photo_url: '', seeds_per_tray_grams: '', yield_per_tray_grams: '' });
    setProcedure({
      soak_enabled: false,
      soak_hours: undefined,
      cover_soil_enabled: false,
      stack_enabled: false,
      stack_days: undefined,
      humidity_dome_enabled: false,
      blackout_enabled: false,
      blackout_days: undefined,
      humidity_dome_days: undefined,
      light_enabled: true,
      light_days: undefined,
    });
    setVariants([]);
    setIsMix(false);
    setMixComponents([]);
    setShowAddVariantForm(false);
  };

  const handleAddVariant = () => {
    if (!newVariant.size_name || !newVariant.size_grams) {
      showToast('Size name and grams required', 'error');
      return;
    }
    setVariants([
      ...variants,
      {
        size_name: newVariant.size_name,
        size_grams: parseFloat(newVariant.size_grams),
        price_eur: newVariant.price_eur ? parseFloat(newVariant.price_eur) : undefined,
        is_internal: newVariant.size_name.toLowerCase() === 'container',
        container_size: newVariant.container_size || undefined,
        container_qty: newVariant.container_qty ? parseInt(newVariant.container_qty) : 1,
      },
    ]);
    setNewVariant({ size_name: '', size_grams: '', price_eur: '', container_size: '', container_qty: '1' });
  };

  const handleRemoveVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
    if (editingVariantIdx === index) setEditingVariantIdx(null);
  };

  const handleStartEditVariant = (index: number) => {
    const v = variants[index];
    setEditingVariantIdx(index);
    setEditingVariant({
      size_name: v.size_name,
      size_grams: String(v.size_grams),
      price_eur: v.price_eur !== undefined ? String(v.price_eur) : '',
      container_size: v.container_size || '',
      container_qty: String(v.container_qty ?? 1),
    });
  };

  const handleSaveEditVariant = (index: number) => {
    if (!editingVariant.size_name || !editingVariant.size_grams) {
      showToast('Size name and grams required', 'error');
      return;
    }
    const updated = variants.map((v, i) =>
      i === index ? {
        ...v,
        size_name: editingVariant.size_name,
        size_grams: parseFloat(editingVariant.size_grams),
        price_eur: editingVariant.price_eur ? parseFloat(editingVariant.price_eur) : undefined,
        container_size: editingVariant.container_size || undefined,
        container_qty: editingVariant.container_qty ? parseInt(editingVariant.container_qty) : 1,
      } : v
    );
    setVariants(updated);
    setEditingVariantIdx(null);
  };

  const calculateTotalDays = () => {
    let days = 0;
    if (procedure.stack_enabled && procedure.stack_days) {
      days += procedure.stack_days;
    }
    if (procedure.light_enabled && procedure.light_days) {
      days += procedure.light_days;
    }
    if (procedure.blackout_enabled && procedure.blackout_days) {
      days += procedure.blackout_days;
    }
    return days;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg text-gray-600">Loading crops...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 flex justify-between items-center flex-shrink-0">
        <h1 className="text-3xl font-bold text-gray-900">Crops</h1>
        <button
          onClick={handleNewCrop}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition"
        >
          + New Crop
        </button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-[350px_1fr] gap-6 flex-1 p-6 overflow-hidden">
        {/* LEFT: Crop list */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search crops..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredCrops.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No crops found</div>
            ) : (
              filteredCrops.map((crop) => (
                <button
                  key={crop.id}
                  onClick={() => {
                    setSelectedCropId(crop.id);
                    setIsNewCrop(false);
                    setIsEditing(false);
                  }}
                  className={`w-full p-3 border-b border-gray-100 text-left transition focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    selectedCropId === crop.id
                      ? 'bg-blue-50 border-l-4 border-l-green-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {crop.photo_url ? (
                        <img
                          src={crop.photo_url}
                          alt={crop.name_en}
                          className="w-10 h-10 object-cover rounded-md flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 flex items-center justify-center rounded-md flex-shrink-0 text-gray-400">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{crop.name_en}</p>
                        <p className="text-xs text-gray-600 truncate">{crop.name_de}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                        crop.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {crop.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Detail panel */}
        {isNewCrop || selectedCrop ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">
                {isNewCrop ? 'New Crop' : selectedCrop?.name_en}
              </h2>
              {!isNewCrop && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isEditing}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Delete
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              {(['basics', ...(!isMix ? ['procedure'] : []), 'sizes'] as ('basics' | 'procedure' | 'sizes')[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  disabled={saving}
                  className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    activeTab === tab
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {tab === 'basics' && 'Basics'}
                  {tab === 'procedure' && 'Growth Procedure'}
                  {tab === 'sizes' && 'Sizes & Prices'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* BASICS TAB */}
              {activeTab === 'basics' && (
                <div className="space-y-4 max-w-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Name (English) *</label>
                    <input
                      type="text"
                      value={formData.name_en}
                      onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="e.g., Pea Shoots"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Name (German) *</label>
                    <input
                      type="text"
                      value={formData.name_de}
                      onChange={(e) => setFormData({ ...formData, name_de: e.target.value })}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="e.g., Erbsensprossen"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Flavor Profile (English)</label>
                    <input
                      type="text"
                      value={formData.flavor_en}
                      onChange={(e) => setFormData({ ...formData, flavor_en: e.target.value })}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="e.g., Sweet, crunchy"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Flavor Profile (German)</label>
                    <input
                      type="text"
                      value={formData.flavor_de}
                      onChange={(e) => setFormData({ ...formData, flavor_de: e.target.value })}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="z.B. süß, knackig"
                    />
                  </div>

                  {/* Mix toggle */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <button
                      type="button"
                      disabled={!isEditing}
                      onClick={() => { setIsMix(!isMix); setMixComponents([]); }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${isMix ? 'bg-green-600' : 'bg-gray-300'} ${!isEditing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${isMix ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm font-medium text-gray-900">This is a mix crop</span>
                    {isMix && <span className="text-xs text-gray-500">(blend of multiple varieties)</span>}
                  </div>

                  {/* Tray yield info — only for non-mix crops */}
                  {!isMix && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">Seeds per Tray (g)</label>
                        <input
                          type="number"
                          value={formData.seeds_per_tray_grams}
                          onChange={(e) => setFormData({ ...formData, seeds_per_tray_grams: e.target.value })}
                          disabled={!isEditing}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="e.g. 15"
                          min="0"
                          step="0.1"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">Yield per Tray (g)</label>
                        <input
                          type="number"
                          value={formData.yield_per_tray_grams}
                          onChange={(e) => setFormData({ ...formData, yield_per_tray_grams: e.target.value })}
                          disabled={!isEditing}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="e.g. 120"
                          min="0"
                          step="0.1"
                        />
                      </div>
                    </div>
                  )}

                  {/* Mix components */}
                  {isMix && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-gray-900">Mix Components</label>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => setMixComponents([...mixComponents, { component_crop_id: '', percentage: 0 }])}
                            className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                          >
                            + Add variety
                          </button>
                        )}
                      </div>
                      {mixComponents.length === 0 && (
                        <p className="text-xs text-gray-500">No varieties added yet. Click "+ Add variety" to start.</p>
                      )}
                      {mixComponents.map((comp, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <select
                            value={comp.component_crop_id}
                            onChange={e => {
                              const updated = [...mixComponents];
                              updated[idx] = { ...updated[idx], component_crop_id: e.target.value };
                              setMixComponents(updated);
                            }}
                            disabled={!isEditing}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select variety...</option>
                            {crops.filter(c => !c.deleted_at && !c.is_mix && c.id !== selectedCropId).map(c => (
                              <option key={c.id} value={c.id}>{c.name_en}</option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={comp.percentage || ''}
                              onChange={e => {
                                const updated = [...mixComponents];
                                updated[idx] = { ...updated[idx], percentage: parseFloat(e.target.value) || 0 };
                                setMixComponents(updated);
                              }}
                              disabled={!isEditing}
                              className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="33"
                              min="1"
                              max="100"
                            />
                            <span className="text-sm text-gray-500">%</span>
                          </div>
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => setMixComponents(mixComponents.filter((_, i) => i !== idx))}
                              className="text-gray-400 hover:text-red-500 text-lg font-bold"
                            >×</button>
                          )}
                        </div>
                      ))}
                      {mixComponents.length > 0 && (
                        <div className={`text-xs font-semibold ${Math.round(mixComponents.reduce((s, c) => s + (c.percentage || 0), 0)) === 100 ? 'text-green-700' : 'text-amber-600'}`}>
                          Total: {mixComponents.reduce((s, c) => s + (c.percentage || 0), 0).toFixed(0)}% {Math.round(mixComponents.reduce((s, c) => s + (c.percentage || 0), 0)) !== 100 && '— must equal 100%'}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'paused' })}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Crop Photo</label>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        {formData.photo_url ? (
                          <div className="relative w-20 h-20 border border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                            <img src={formData.photo_url} alt="Crop" className="w-full h-full object-cover" />
                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, photo_url: '' })}
                                className="absolute top-0 right-0 bg-red-600 hover:bg-red-700 text-white p-1 rounded-bl-lg transition"
                                title="Remove image"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 text-gray-400 flex-shrink-0">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {isEditing && (
                          <div className="flex flex-col gap-1">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                try {
                                  showToast('Uploading image...', 'success');
                                  const uploadData = new FormData();
                                  uploadData.append('file', file);

                                  const uploadRes = await fetch('/api/upload', {
                                    method: 'POST',
                                    body: uploadData,
                                  });

                                  const json = await uploadRes.json();
                                  if (json.success) {
                                    setFormData(prev => ({ ...prev, photo_url: json.data.url }));
                                    showToast('Image uploaded successfully', 'success');
                                  } else {
                                    showToast(json.error || 'Upload failed', 'error');
                                  }
                                } catch (err) {
                                  console.error('Upload error:', err);
                                  showToast('Error uploading image', 'error');
                                }
                              }}
                              className="text-sm text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
                            />
                            <p className="text-xs text-gray-500">Max size: 5MB (PNG, JPG, GIF)</p>
                          </div>
                        )}
                      </div>
                      {isEditing && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Or paste image URL:</label>
                          <input
                            type="text"
                            value={formData.photo_url}
                            onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="https://example.com/image.png"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PROCEDURE TAB */}
              {activeTab === 'procedure' && (
                <div className="space-y-6 max-w-2xl">
                  {/* Total growth days */}
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-900">
                      Total Growth Days: <span className="text-2xl font-bold text-green-600">{calculateTotalDays()}</span>
                    </p>
                  </div>

                  {/* Soak */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={procedure.soak_enabled}
                        onChange={(e) => setProcedure({ ...procedure, soak_enabled: e.target.checked })}
                        disabled={!isEditing}
                        className="w-4 h-4"
                      />
                      <span className="text-lg">💧</span>
                      <span className="font-semibold text-gray-900 flex-1">Soak</span>
                    </label>
                    {procedure.soak_enabled && isEditing && (
                      <div className="ml-7">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Hours</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Hours"
                          value={procedure.soak_hours || ''}
                          onChange={(e) => setProcedure({ ...procedure, soak_hours: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    )}
                    {procedure.soak_enabled && !isEditing && (
                      <p className="ml-7 text-sm text-gray-700">{procedure.soak_hours} hours</p>
                    )}
                  </div>

                  {/* Seed */}
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🌱</span>
                      <span className="font-semibold text-gray-900">Seed</span>
                      <span className="text-xs text-gray-600">(Always required)</span>
                    </div>
                  </div>

                  {/* Cover Soil */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={procedure.cover_soil_enabled}
                        onChange={(e) => setProcedure({ ...procedure, cover_soil_enabled: e.target.checked })}
                        disabled={!isEditing}
                        className="w-4 h-4"
                      />
                      <span className="text-lg">🌍</span>
                      <span className="font-semibold text-gray-900">Cover Soil</span>
                    </label>
                  </div>

                  {/* Stack */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={procedure.stack_enabled}
                        onChange={(e) => setProcedure({ ...procedure, stack_enabled: e.target.checked })}
                        disabled={!isEditing}
                        className="w-4 h-4"
                      />
                      <span className="text-lg">📚</span>
                      <span className="font-semibold text-gray-900">Stack</span>
                    </label>
                    {procedure.stack_enabled && isEditing && (
                      <div className="ml-7">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Days</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Days"
                          value={procedure.stack_days || ''}
                          onChange={(e) => setProcedure({ ...procedure, stack_days: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    )}
                    {procedure.stack_enabled && !isEditing && (
                      <p className="ml-7 text-sm text-gray-700">{procedure.stack_days} days</p>
                    )}
                  </div>

                  {/* Blackout Stage */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={procedure.blackout_enabled || false}
                        onChange={(e) => setProcedure({ 
                          ...procedure, 
                          blackout_enabled: e.target.checked,
                          blackout_days: e.target.checked ? (procedure.blackout_days || 3) : undefined 
                        })}
                        disabled={!isEditing}
                        className="w-4 h-4"
                      />
                      <span className="text-lg">🌑</span>
                      <span className="font-semibold text-gray-900 flex-1">Blackout Stage</span>
                    </label>
                    {procedure.blackout_enabled && isEditing && (
                      <div className="ml-7">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Duration (Days)</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Days"
                          value={procedure.blackout_days || ''}
                          onChange={(e) => setProcedure({ ...procedure, blackout_days: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {procedure.light_enabled ? "Concurrent/included in lights duration (not added to total)." : "Calculated in total since lights are disabled."}
                        </p>
                      </div>
                    )}
                    {procedure.blackout_enabled && !isEditing && (
                      <p className="ml-7 text-sm text-gray-700">
                        {procedure.blackout_days} days ({procedure.light_enabled ? "concurrent" : "adds to total growth"})
                      </p>
                    )}
                  </div>

                  {/* Humidity Dome Stage */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={procedure.humidity_dome_enabled || false}
                        onChange={(e) => setProcedure({ 
                          ...procedure, 
                          humidity_dome_enabled: e.target.checked,
                          humidity_dome_days: e.target.checked ? (procedure.humidity_dome_days || 3) : undefined 
                        })}
                        disabled={!isEditing}
                        className="w-4 h-4"
                      />
                      <span className="text-lg">💨</span>
                      <span className="font-semibold text-gray-900 flex-1">Humidity Dome</span>
                    </label>
                    {procedure.humidity_dome_enabled && isEditing && (
                      <div className="ml-7">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Duration (Days)</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Days"
                          value={procedure.humidity_dome_days || ''}
                          onChange={(e) => setProcedure({ ...procedure, humidity_dome_days: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Concurrent with other stages (not calculated in total days).</p>
                      </div>
                    )}
                    {procedure.humidity_dome_enabled && !isEditing && (
                      <p className="ml-7 text-sm text-gray-700">{procedure.humidity_dome_days} days (concurrent)</p>
                    )}
                  </div>

                  {/* Lights Stage */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={procedure.light_enabled !== false}
                        onChange={(e) => setProcedure({ 
                          ...procedure, 
                          light_enabled: e.target.checked,
                          light_days: e.target.checked ? (procedure.light_days || 7) : undefined 
                        })}
                        disabled={!isEditing}
                        className="w-4 h-4"
                      />
                      <span className="text-lg">💡</span>
                      <span className="font-semibold text-gray-900 flex-1">Lights Stage</span>
                    </label>
                    {(procedure.light_enabled !== false) && isEditing && (
                      <div className="ml-7">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Duration (Days)</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Days"
                          value={procedure.light_days || ''}
                          onChange={(e) => setProcedure({ ...procedure, light_days: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Main lights growth stage. Calculated in total growth days.</p>
                      </div>
                    )}
                    {(procedure.light_enabled !== false) && !isEditing && (
                      <p className="ml-7 text-sm text-gray-700">{procedure.light_days} days (adds to total growth)</p>
                    )}
                  </div>

                  {/* Harvest */}
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🌾</span>
                      <span className="font-semibold text-gray-900">Harvest</span>
                      <span className="text-xs text-gray-600">(End of cycle)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SIZES & PRICES TAB */}
              {activeTab === 'sizes' && (
                <div className="space-y-6 max-w-2xl">
                  {/* Current sizes table */}
                  {variants.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Current Sizes</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="p-2 text-left text-xs font-semibold text-gray-600">Size</th>
                              <th className="p-2 text-left text-xs font-semibold text-gray-600">Grams</th>
                              <th className="p-2 text-left text-xs font-semibold text-gray-600">Price (€)</th>
                              <th className="p-2 text-left text-xs font-semibold text-gray-600">Container</th>
                              <th className="p-2 text-left text-xs font-semibold text-gray-600">Qty</th>
                              {isEditing && <th className="p-2 text-center text-xs font-semibold text-gray-600">Action</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {variants.map((variant, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                {editingVariantIdx === idx ? (
                                  <>
                                    <td className="p-1">
                                      <input
                                        type="text"
                                        value={editingVariant.size_name}
                                        onChange={(e) => setEditingVariant({ ...editingVariant, size_name: e.target.value })}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                                      />
                                    </td>
                                    <td className="p-1">
                                      <input
                                        type="number"
                                        value={editingVariant.size_grams}
                                        onChange={(e) => setEditingVariant({ ...editingVariant, size_grams: e.target.value })}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                                      />
                                    </td>
                                    <td className="p-1">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={editingVariant.price_eur}
                                        onChange={(e) => setEditingVariant({ ...editingVariant, price_eur: e.target.value })}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                                      />
                                    </td>
                                    <td className="p-1">
                                      <select
                                        value={editingVariant.container_size}
                                        onChange={(e) => setEditingVariant({ ...editingVariant, container_size: e.target.value })}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                                      >
                                        <option value="">— None —</option>
                                        {packagingSizes.map(ps => (
                                          <option key={ps.id} value={ps.size_name}>{ps.size_name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="p-1">
                                      <input
                                        type="number"
                                        min="1"
                                        value={editingVariant.container_qty}
                                        onChange={(e) => setEditingVariant({ ...editingVariant, container_qty: e.target.value })}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                                      />
                                    </td>
                                    <td className="p-1 text-center whitespace-nowrap">
                                      <button
                                        onClick={() => handleSaveEditVariant(idx)}
                                        className="text-green-600 hover:text-green-700 text-xs font-medium mr-2"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingVariantIdx(null)}
                                        className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                                      >
                                        Cancel
                                      </button>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="p-2">{variant.size_name}</td>
                                    <td className="p-2 text-gray-600">{variant.size_grams}g</td>
                                    <td className="p-2">{variant.price_eur ? '€' + variant.price_eur.toFixed(2) : '—'}</td>
                                    <td className="p-2 text-gray-600">{variant.container_size || '—'}</td>
                                    <td className="p-2 text-gray-600">{variant.container_qty ?? 1}</td>
                                    {isEditing && (
                                      <td className="p-2 text-center whitespace-nowrap">
                                        <button
                                          onClick={() => handleStartEditVariant(idx)}
                                          className="text-green-600 hover:text-green-700 text-xs font-medium mr-2"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleRemoveVariant(idx)}
                                          className="text-red-600 hover:text-red-700 text-xs font-medium"
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    )}
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Add new size */}
                  {isEditing && (
                    showAddVariantForm ? (
                      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-sm font-semibold text-gray-900">Add New Size</h3>
                          <button
                            onClick={() => { setShowAddVariantForm(false); setNewVariant({ size_name: '', size_grams: '', price_eur: '', container_size: '', container_qty: '1' }); }}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Size Name</label>
                            <input
                              type="text"
                              placeholder="e.g., 600g"
                              value={newVariant.size_name}
                              onChange={(e) => setNewVariant({ ...newVariant, size_name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Grams (Internal)</label>
                            <input
                              type="number"
                              placeholder="e.g., 600"
                              value={newVariant.size_grams}
                              onChange={(e) => setNewVariant({ ...newVariant, size_grams: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Price (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="e.g., 18.50"
                              value={newVariant.price_eur}
                              onChange={(e) => setNewVariant({ ...newVariant, price_eur: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Container Size</label>
                            <select
                              value={newVariant.container_size}
                              onChange={(e) => setNewVariant({ ...newVariant, container_size: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                            >
                              <option value="">— None —</option>
                              {packagingSizes.map(ps => (
                                <option key={ps.id} value={ps.size_name}>{ps.size_name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Containers per Order</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="1"
                              value={newVariant.container_qty}
                              onChange={(e) => setNewVariant({ ...newVariant, container_qty: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                          <button
                            onClick={() => { handleAddVariant(); setShowAddVariantForm(false); }}
                            className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition"
                          >
                            Add Size
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddVariantForm(true)}
                        className="w-full border-2 border-dashed border-gray-300 hover:border-green-500 text-gray-500 hover:text-green-600 py-2 rounded-lg text-sm font-medium transition"
                      >
                        + Add New Size
                      </button>
                    )
                  )}

                  {variants.length === 0 && !isEditing && (
                    <p className="text-sm text-gray-600">No sizes defined yet</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              {isEditing || isNewCrop ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setShowAddVariantForm(false);
                      setEditingVariantIdx(null);
                      if (isNewCrop) {
                        setIsNewCrop(false);
                        setSelectedCropId(null);
                      } else {
                        loadCropData(selectedCropId!);
                      }
                    }}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-6 py-2 rounded-lg font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 flex items-center justify-center text-gray-500">
            Select a crop to view details
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Crop</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete <strong>{selectedCrop?.name_en}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 px-6 py-3 rounded-lg text-white font-medium ${
          toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}
