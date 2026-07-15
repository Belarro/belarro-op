'use client';

import React, { useCallback, useEffect, useState } from 'react';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'field' | 'farm';
  last_login_at: string | null;
  created_at: string;
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin — everything',
  field: 'Field — visits, deliveries, follow-ups',
  farm: 'Farm — production & inventory',
};

function fmtLastLogin(s: string | null) {
  if (!s) return 'never';
  return new Date(s).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'field' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      const json = await res.json();
      if (json.success) setUsers(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Failed'); return; }
      setShowAdd(false);
      setForm({ email: '', name: '', password: '', role: 'field' });
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (id: string, role: string) => {
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        alert(json?.error || `Role change failed (${res.status})`);
      }
    } catch {
      alert('Network error — role change failed');
    } finally {
      load();
    }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`Remove ${u.email}? They will no longer be able to log in.`)) return;
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error || 'Failed');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-400">Who can log in, and what they can see.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow"
        >
          + Add user
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <div className="font-semibold text-gray-900 text-sm">{u.name || u.email}</div>
                <div className="text-xs text-gray-400">{u.email} · last login {fmtLastLogin(u.last_login_at)}</div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={u.role || 'admin'}
                  onChange={e => handleRoleChange(u.id, e.target.value)}
                  className="text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="admin">Admin</option>
                  <option value="field">Field</option>
                  <option value="farm">Farm</option>
                </select>
                <button onClick={() => handleDelete(u)} className="text-red-400 hover:text-red-600 text-xs font-bold px-2">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        {Object.entries(ROLE_LABEL).map(([k, v]) => <div key={k}><strong className="text-gray-700">{k}</strong>: {v}</div>)}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAdd} className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Add user</h2>
            <input
              type="email" required placeholder="Email"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="text" placeholder="Name (optional)"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="password" required minLength={8} placeholder="Password (min 8 chars)"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
            <select
              value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="field">Field — visits, deliveries, follow-ups</option>
              <option value="farm">Farm — production & inventory</option>
              <option value="admin">Admin — everything</option>
            </select>
            {error && <div className="text-red-500 text-xs font-semibold">{error}</div>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowAdd(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={submitting}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-lg text-sm shadow disabled:opacity-50">
                {submitting ? 'Adding…' : 'Add user'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
