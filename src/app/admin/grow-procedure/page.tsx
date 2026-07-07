'use client';

import React, { useEffect, useState } from 'react';

interface Crop {
  id: string;
  name_en: string;
  name_de: string;
  status: string;
}

interface Procedure {
  id?: string;
  crop_id?: string;
  soak_enabled: boolean;
  soak_hours: number | null;
  soak_notes: string | null;
  cover_soil_enabled: boolean;
  cover_soil_notes: string | null;
  stack_enabled: boolean;
  stack_days: number | null;
  stack_notes: string | null;
  blackout_enabled: boolean;
  blackout_days: number | null;
  blackout_notes: string | null;
  light_enabled: boolean;
  light_days: number | null;
  light_notes: string | null;
  humidity_dome_enabled: boolean;
  humidity_dome_days: number | null;
  humidity_dome_notes: string | null;
}

interface Row {
  crop: Crop;
  procedure: Procedure | null;
}

const EMPTY: Procedure = {
  soak_enabled: false, soak_hours: null, soak_notes: '',
  cover_soil_enabled: false, cover_soil_notes: '',
  stack_enabled: false, stack_days: null, stack_notes: '',
  blackout_enabled: false, blackout_days: null, blackout_notes: '',
  light_enabled: true, light_days: null, light_notes: '',
  humidity_dome_enabled: false, humidity_dome_days: null, humidity_dome_notes: '',
};

export default function GrowProcedurePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Crop | null>(null);
  const [form, setForm] = useState<Procedure>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/growth-steps');
      const json = await res.json();
      if (json.success) setRows(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openEdit = (row: Row) => {
    setEditing(row.crop);
    setForm({ ...EMPTY, ...(row.procedure || {}) });
  };

  const num = (v: string) => (v === '' ? null : Number(v));

  const handleSave = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      const res = await fetch('/api/growth-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop_id: editing.id, ...form }),
      });
      const json = await res.json();
      if (json.success) {
        setToast(`Saved growth steps for ${editing.name_en}`);
        setEditing(null);
        fetchData();
        setTimeout(() => setToast(null), 3000);
      } else {
        setToast(`Error: ${json.error}`);
        setTimeout(() => setToast(null), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const summary = (p: Procedure | null) => {
    if (!p) return 'No procedure set';
    const parts: string[] = [];
    if (p.soak_enabled) parts.push(`Soak ${p.soak_hours ?? '?'}h`);
    if (p.cover_soil_enabled) parts.push('Cover soil');
    if (p.stack_enabled) parts.push(`Stack ${p.stack_days ?? '?'}d`);
    if (p.blackout_enabled) parts.push(`Blackout ${p.blackout_days ?? '?'}d`);
    if (p.light_enabled) parts.push(`Light ${p.light_days ?? '?'}d`);
    if (p.humidity_dome_enabled) parts.push(`Dome ${p.humidity_dome_days ?? '?'}d`);
    return parts.length ? parts.join(' → ') : 'No steps enabled';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Grow Procedure</h1>
        <p className="text-sm text-gray-500 mt-1">View and edit the growth steps for each crop</p>
      </div>

      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          No crops found. Add crops first.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {rows.map((row) => (
            <div key={row.crop.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{row.crop.name_en}</h3>
                  <p className="text-xs text-gray-500">{row.crop.name_de}</p>
                </div>
                <button
                  onClick={() => openEdit(row)}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  Edit
                </button>
              </div>
              <p className="mt-4 text-sm text-gray-600">{summary(row.procedure)}</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Steps — {editing.name_en}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <StepRow label="Soak" enabled={form.soak_enabled}
                onToggle={(v) => setForm({ ...form, soak_enabled: v })}
                numLabel="Hours" numValue={form.soak_hours}
                onNum={(v) => setForm({ ...form, soak_hours: num(v) })}
                notes={form.soak_notes || ''} onNotes={(v) => setForm({ ...form, soak_notes: v })} />

              <StepRow label="Cover Soil" enabled={form.cover_soil_enabled}
                onToggle={(v) => setForm({ ...form, cover_soil_enabled: v })}
                notes={form.cover_soil_notes || ''} onNotes={(v) => setForm({ ...form, cover_soil_notes: v })} />

              <StepRow label="Stack" enabled={form.stack_enabled}
                onToggle={(v) => setForm({ ...form, stack_enabled: v })}
                numLabel="Days" numValue={form.stack_days}
                onNum={(v) => setForm({ ...form, stack_days: num(v) })}
                notes={form.stack_notes || ''} onNotes={(v) => setForm({ ...form, stack_notes: v })} />

              <StepRow label="Blackout" enabled={form.blackout_enabled}
                onToggle={(v) => setForm({ ...form, blackout_enabled: v })}
                numLabel="Days" numValue={form.blackout_days}
                onNum={(v) => setForm({ ...form, blackout_days: num(v) })}
                notes={form.blackout_notes || ''} onNotes={(v) => setForm({ ...form, blackout_notes: v })} />

              <StepRow label="Light" enabled={form.light_enabled}
                onToggle={(v) => setForm({ ...form, light_enabled: v })}
                numLabel="Days" numValue={form.light_days}
                onNum={(v) => setForm({ ...form, light_days: num(v) })}
                notes={form.light_notes || ''} onNotes={(v) => setForm({ ...form, light_notes: v })} />

              <StepRow label="Humidity Dome" enabled={form.humidity_dome_enabled}
                onToggle={(v) => setForm({ ...form, humidity_dome_enabled: v })}
                numLabel="Days" numValue={form.humidity_dome_days}
                onNum={(v) => setForm({ ...form, humidity_dome_days: num(v) })}
                notes={form.humidity_dome_notes || ''} onNotes={(v) => setForm({ ...form, humidity_dome_notes: v })} />
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm shadow focus:outline-none focus:ring-2 focus:ring-green-400">
                {saving ? 'Saving...' : 'Save Steps'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepRow(props: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  numLabel?: string;
  numValue?: number | null;
  onNum?: (v: string) => void;
  notes: string;
  onNotes: (v: string) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={props.enabled}
          onChange={(e) => props.onToggle(e.target.checked)}
          className="h-4 w-4 text-green-600 focus:ring-green-500 rounded" />
        <span className="text-sm font-semibold text-gray-800">{props.label}</span>
      </label>
      {props.enabled && (
        <div className="mt-3 space-y-2">
          {props.numLabel && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{props.numLabel}</label>
              <input type="number" min={0} value={props.numValue ?? ''}
                onChange={(e) => props.onNum?.(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <input type="text" value={props.notes}
              onChange={(e) => props.onNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
          </div>
        </div>
      )}
    </div>
  );
}
