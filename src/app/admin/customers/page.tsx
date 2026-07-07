'use client';

import React, { useEffect, useState } from 'react';

interface Customer {
  id: string;
  _source?: 'belarro' | 'saletracker';
  name: string;
  restaurant_name?: string;
  contact_person?: string;
  contact_title?: string;
  tax_number?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  status: 'prospect' | 'active' | 'paused' | 'inactive';
  net_days: number;
  pause_reason?: string | null;
  interest_level?: string | null;
  visit_notes?: string | null;
  sales_rep?: string | null;
  visited_at?: string | null;
  first_contact_date: string;
  created_at: string;
}

interface WebsiteLead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  restaurant_name?: string;
  message?: string;
  source: string;
  status: 'new' | 'contacted' | 'converted' | 'archived';
  converted_customer_id?: string | null;
  created_at: string;
}

type CustomerTab = 'prospect' | 'active' | 'paused' | 'inactive';
type Tab = CustomerTab | 'leads';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<WebsiteLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [toast, setToast] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    restaurant_name: '',
    contact_person: '',
    contact_title: 'owner' as 'owner' | 'executive_chef' | 'chef' | 'sous_chef' | 'manager',
    tax_number: '',
    email: '',
    phone: '',
    whatsapp: '',
    address: '',
    city: '',
    net_days: '30',
    status: 'prospect' as 'prospect' | 'active' | 'paused' | 'inactive',
    pause_reason: ''
  });

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customers');
      const json = await res.json();
      if (json.success) {
        setCustomers(json.data || []);
      }
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/website-leads');
      const json = await res.json();
      if (json.success) setLeads(json.data || []);
    } catch (error) {
      console.error('Failed to load website leads:', error);
    }
  };

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const convertLead = async (lead: WebsiteLead) => {
    if (!confirm(`Convert "${lead.name}" into a customer?`)) return;
    try {
      const res = await fetch('/api/website-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'convert', id: lead.id }),
      });
      const json = await res.json();
      if (json.success) { flash('Lead converted to customer'); fetchLeads(); fetchCustomers(); }
      else flash(`Error: ${json.error}`);
    } catch (error) { console.error(error); }
  };

  const setLeadStatus = async (lead: WebsiteLead, status: WebsiteLead['status']) => {
    try {
      const res = await fetch('/api/website-leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status }),
      });
      const json = await res.json();
      if (json.success) fetchLeads();
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    fetchCustomers();
    fetchLeads();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formData.name) {
        alert('Name is required');
        return;
      }

      const payload = {
        ...formData,
        net_days: parseInt(formData.net_days) || 30
      };

      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers';
      const method = editingCustomer ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        setShowModal(false);
        resetForm();
        fetchCustomers();
      } else {
        alert(`Error: ${json.error}`);
      }
    } catch (error) {
      alert(`Failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      restaurant_name: '',
      contact_person: '',
      contact_title: 'owner',
      tax_number: '',
      email: '',
      phone: '',
      whatsapp: '',
      address: '',
      city: '',
      net_days: '30',
      status: 'prospect',
      pause_reason: ''
    });
    setEditingCustomer(null);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setFormData({
      name: c.name,
      restaurant_name: c.restaurant_name || '',
      contact_person: c.contact_person || '',
      contact_title: (c.contact_title as any) || 'owner',
      tax_number: c.tax_number || '',
      email: c.email || '',
      phone: c.phone || '',
      whatsapp: c.whatsapp || '',
      address: c.address || '',
      city: c.city || '',
      net_days: c.net_days.toString(),
      status: c.status,
      pause_reason: c.pause_reason || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this customer? This will delete all their orders and follow-ups.')) {
      try {
        const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) {
          fetchCustomers();
        }
      } catch (error) {
        console.error('Failed to delete customer:', error);
      }
    }
  };

  const handleStatusToggle = async (c: Customer) => {
    const nextStatus = c.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/customers/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const json = await res.json();
      if (json.success) {
        fetchCustomers();
      }
    } catch (error) {
      console.error('Failed to toggle customer status:', error);
    }
  };

  const filteredCustomers = customers.filter(c => c.status === activeTab);
  const statusCounts = {
    prospect: customers.filter(c => c.status === 'prospect').length,
    active: customers.filter(c => c.status === 'active').length,
    paused: customers.filter(c => c.status === 'paused').length,
    inactive: customers.filter(c => c.status === 'inactive').length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Customer Relationship Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage leads, chefs, and restaurant accounts</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2.5 rounded-lg shadow transition"
        >
          + New Customer
        </button>
      </div>

      {toast && <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['active', 'prospect', 'paused', 'inactive'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-semibold border-b-2 capitalize transition ${
              activeTab === tab
                ? 'border-green-600 text-green-700 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab === 'prospect' ? 'Leads' : tab.charAt(0).toUpperCase() + tab.slice(1) + 's'} ({statusCounts[tab]})
          </button>
        ))}
        <button
          onClick={() => setActiveTab('leads')}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'leads'
              ? 'border-green-600 text-green-700 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          Website Leads ({leads.filter(l => l.status !== 'converted' && l.status !== 'archived').length})
        </button>
      </div>

      {/* Website Leads tab */}
      {activeTab === 'leads' ? (
        leads.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            No website leads yet. Leads from the belarro.de contact form appear here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leads.map(lead => (
              <div key={lead.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-bold text-gray-900">{lead.name}</h3>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded border capitalize ${
                      lead.status === 'converted' ? 'bg-green-50 text-green-700 border-green-200'
                      : lead.status === 'archived' ? 'bg-gray-100 text-gray-500 border-gray-200'
                      : lead.status === 'contacted' ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>{lead.status}</span>
                  </div>
                  {lead.restaurant_name && <p className="text-xs text-gray-500 font-medium">{lead.restaurant_name}</p>}
                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-500">
                    {lead.email && <div className="truncate">📧 {lead.email}</div>}
                    {lead.phone && <div>📞 {lead.phone}</div>}
                    {lead.message && <div className="text-gray-600 italic mt-2">"{lead.message}"</div>}
                  </div>
                  <p className="mt-3 text-[10px] text-gray-400">Received: {new Date(lead.created_at).toLocaleDateString()} · via {lead.source}</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => convertLead(lead)}
                    disabled={lead.status === 'converted'}
                    className="bg-green-50 hover:bg-green-100 disabled:opacity-40 text-green-700 py-1.5 rounded-lg border border-green-200 font-semibold text-xs"
                  >
                    {lead.status === 'converted' ? 'Converted' : 'Convert'}
                  </button>
                  <button
                    onClick={() => setLeadStatus(lead, 'contacted')}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700 py-1.5 rounded-lg border border-gray-200 font-semibold text-xs"
                  >
                    Contacted
                  </button>
                  <button
                    onClick={() => setLeadStatus(lead, 'archived')}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-500 py-1.5 rounded-lg border border-gray-200 font-semibold text-xs"
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          No {activeTab} customers found. Click "+ New Customer" to add one!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map(c => (
            <div key={c.id} className={`bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between ${c._source === 'saletracker' ? 'border-blue-100' : 'border-gray-200'}`}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-gray-900">{c.name}</h3>
                  {c._source === 'saletracker' && (
                    <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">Visited</span>
                  )}
                </div>
                {c.contact_person && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
                    <span>👤</span>
                    <span>{c.contact_title ? c.contact_title.replace('_', ' ') + ': ' : ''}{c.contact_person}</span>
                  </div>
                )}

                {/* Contact info */}
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-500">
                  {c.email && <div className="truncate">📧 {c.email}</div>}
                  {c.phone && <div>📞 {c.phone}</div>}
                  {c.whatsapp && <div>💬 WhatsApp: {c.whatsapp}</div>}
                  {c.city && <div>📍 {c.address ? c.address + ', ' : ''}{c.city}</div>}
                  {c.visited_at && (
                    <div>📅 Visited: {new Date(c.visited_at).toLocaleDateString('en-DE', { day: 'numeric', month: 'short', year: 'numeric' })}{c.sales_rep ? ` — ${c.sales_rep}` : ''}</div>
                  )}
                  {c.interest_level && (
                    <div>⭐ Interest: <span className={`font-semibold capitalize ${c.interest_level === 'high' ? 'text-green-600' : c.interest_level === 'medium' ? 'text-amber-600' : 'text-gray-500'}`}>{c.interest_level}</span></div>
                  )}
                  {c.status === 'paused' && c.pause_reason && (
                    <div className="text-amber-600 font-semibold">⏸️ Paused: {c.pause_reason}</div>
                  )}
                  {c.visit_notes && (
                    <div className="italic text-gray-400 line-clamp-2">"{c.visit_notes}"</div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                {c._source === 'belarro' ? (
                  <span>Terms: <strong>{c.net_days} Net Days</strong></span>
                ) : (
                  <span className="text-gray-400">SalesTracker lead</span>
                )}
                <span className="text-[10px] text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
              </div>

              {/* Action buttons — only for Belarro customers */}
              {c._source === 'belarro' && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => openEditModal(c)}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700 py-1.5 rounded-lg border border-gray-200 font-semibold text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleStatusToggle(c)}
                    className={`py-1.5 rounded-lg border font-semibold text-xs ${
                      c.status === 'active'
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                        : 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200'
                    }`}
                  >
                    {c.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="bg-red-50 hover:bg-red-100 text-red-700 py-1.5 rounded-lg border border-red-200 font-semibold text-xs"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCustomer ? 'Edit Customer Account' : 'Register New Customer'}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Company/Client Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g., Altes Zollhaus"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Restaurant Name</label>
                  <input
                    type="text"
                    value={formData.restaurant_name}
                    onChange={e => setFormData({ ...formData, restaurant_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g., Zollhaus Bistro"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Person Name</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={e => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g., Pierre Granger"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
                  <select
                    value={formData.contact_title}
                    onChange={e => setFormData({ ...formData, contact_title: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  >
                    <option value="owner">Owner</option>
                    <option value="executive_chef">Executive Chef</option>
                    <option value="chef">Chef</option>
                    <option value="sous_chef">Sous Chef</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g., chef@zollhaus.de"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g., +49 1520 ..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">WhatsApp Number (or copy from phone)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.whatsapp}
                    onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g., 491520123456"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.phone) {
                        setFormData({ ...formData, whatsapp: formData.phone });
                      }
                    }}
                    disabled={!formData.phone}
                    className="px-3 py-2 bg-green-50 hover:bg-green-100 disabled:opacity-40 text-green-700 border border-green-200 rounded-lg text-sm font-semibold"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Street Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tax Number (Steuernummer)</label>
                <input
                  type="text"
                  value={formData.tax_number}
                  onChange={e => setFormData({ ...formData, tax_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  placeholder="e.g., 30/123/12345"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Initial Funnel Stage</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                >
                  <option value="prospect">🔵 Lead — Restaurant you're chasing, not closed yet</option>
                  <option value="active">🟢 Active — Paying customer, orders ongoing</option>
                  <option value="paused">🟡 Paused — Temporarily not ordering, can resume</option>
                  <option value="inactive">⚫ Inactive — Lost customer or rejected</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Funnel Stage tracks the customer's buying status throughout their lifecycle.</p>
              </div>

              {formData.status === 'paused' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Pause Reason</label>
                  <input
                    type="text"
                    value={formData.pause_reason}
                    onChange={e => setFormData({ ...formData, pause_reason: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g., Kitchen renovation, Seasonal closure, Budget constraints"
                  />
                </div>
              )}

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-lg text-sm shadow"
                >
                  {editingCustomer ? 'Save Changes' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
