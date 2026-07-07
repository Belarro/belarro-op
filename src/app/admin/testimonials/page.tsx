'use client';

import React, { useEffect, useState } from 'react';

interface Testimonial {
  id: string;
  chef_name: string;
  restaurant: string;
  quote: string;
  visible: boolean;
  sort_order: number;
  created_at: string;
}

const EMPTY: Partial<Testimonial> = { chef_name: '', restaurant: '', quote: '', visible: true, sort_order: 0 };

export default function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Testimonial> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Testimonial | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/testimonials');
      const json = await res.json();
      if (json.success) setTestimonials(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch_(); }, []);

  const toggleVisible = async (t: Testimonial) => {
    const updated = !t.visible;
    setTestimonials(prev => prev.map(x => x.id === t.id ? { ...x, visible: updated } : x));
    await fetch(`/api/testimonials/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: updated }) });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        const { id, created_at, ...body } = editing as Testimonial;
        await fetch(`/api/testimonials/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        const res = await fetch('/api/testimonials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
        const json = await res.json();
        if (json.success) {
          setTestimonials(prev => [...prev, json.data]);
          setEditing(null);
          setSaving(false);
          return;
        }
      }
      await fetch_();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`/api/testimonials/${deleteTarget.id}`, { method: 'DELETE' });
    setTestimonials(prev => prev.filter(t => t.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Testimonials</h1>
          <p className="text-sm text-gray-500 mt-1">{testimonials.length} chef quotes</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY })}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition">
          + Add Testimonial
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
      ) : testimonials.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
          No testimonials yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 w-12">#</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Chef</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Restaurant</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Quote</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 w-20">Visible</th>
                <th className="w-24 px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {testimonials.map((t, i) => (
                <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 transition ${i === testimonials.length - 1 ? 'border-0' : ''}`}>
                  <td className="px-5 py-4 text-gray-400 text-xs">{t.sort_order}</td>
                  <td className="px-5 py-4 font-semibold text-gray-900 whitespace-nowrap">{t.chef_name}</td>
                  <td className="px-5 py-4 text-gray-600 whitespace-nowrap">{t.restaurant}</td>
                  <td className="px-5 py-4 text-gray-500 max-w-xs">
                    <span className="line-clamp-2 leading-relaxed">"{t.quote}"</span>
                  </td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggleVisible(t)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${t.visible ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${t.visible ? 'left-5' : 'left-1'}`} />
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => setEditing({ ...t })}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition">
                        Edit
                      </button>
                      <button onClick={() => setDeleteTarget(t)}
                        className="px-3 py-1.5 text-xs font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition">
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editing.id ? 'Edit Testimonial' : 'Add Testimonial'}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Chef Name</label>
                <input value={editing.chef_name || ''} onChange={e => setEditing(p => ({ ...p, chef_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Restaurant</label>
                <input value={editing.restaurant || ''} onChange={e => setEditing(p => ({ ...p, restaurant: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quote</label>
                <textarea value={editing.quote || ''} onChange={e => setEditing(p => ({ ...p, quote: e.target.value }))} rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Sort Order</label>
                  <input type="number" value={editing.sort_order ?? 0} onChange={e => setEditing(p => ({ ...p, sort_order: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editing.visible ?? true} onChange={e => setEditing(p => ({ ...p, visible: e.target.checked }))} className="w-4 h-4 rounded accent-green-600" />
                    <span className="text-sm text-gray-700">Visible on website</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={save} disabled={saving || !editing.chef_name || !editing.quote}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Testimonial?</h2>
            <p className="text-sm text-gray-500 mb-6">
              Delete quote from <span className="font-semibold text-gray-700">{deleteTarget.chef_name}</span> ({deleteTarget.restaurant})? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
