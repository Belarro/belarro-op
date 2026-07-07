'use client';

import React, { useState } from 'react';

interface SyncResult {
  created: number;
  skipped: number;
}

interface ParsedRow {
  restaurant_name: string;
  address: string;
  contact_person: string;
  contact_title: string;
  phone: string;
  email: string;
  business_type: string;
  interest_level: string;
  visit_notes: string;
  visited_at: string;
  whatsapp: string;
  language: string;
  sample_given: boolean;
}

interface ImportResult {
  success: number;
  skipped: number;
  errors: string[];
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const col = (row: string[], name: string): string => {
    const variants: Record<string, string[]> = {
      restaurant_name: ['location name', 'restaurant name', 'business name', 'name'],
      address: ['business address', 'address'],
      contact_person: ['contact person', 'contact name'],
      contact_title: ['contact title', 'title'],
      phone: ['direct phone', 'phone', 'mobile'],
      business_phone: ['business phone'],
      email: ['direct email', 'email'],
      business_type: ['business type', 'type'],
      interest_level: ['interest level', 'interest'],
      visit_notes: ['visit notes', 'notes'],
      visited_at: ['timestamp', 'visit date', 'date'],
      whatsapp: ['whatsapp', 'whatsapp number'],
      language: ['language'],
      sample_given: ['sample given', 'samples given', 'materials sent'],
    };
    const keys = variants[name] || [name];
    for (const k of keys) {
      const idx = headers.indexOf(k);
      if (idx !== -1) return (row[idx] || '').trim().replace(/^"|"$/g, '');
    }
    return '';
  };

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { row.push(current); current = ''; }
      else { current += char; }
    }
    row.push(current);

    const phone = col(row, 'phone') || col(row, 'business_phone');
    const sampleVal = col(row, 'sample_given').toLowerCase();

    return {
      restaurant_name: col(row, 'restaurant_name'),
      address: col(row, 'address'),
      contact_person: col(row, 'contact_person'),
      contact_title: col(row, 'contact_title'),
      phone,
      email: col(row, 'email'),
      business_type: col(row, 'business_type'),
      interest_level: col(row, 'interest_level'),
      visit_notes: col(row, 'visit_notes'),
      visited_at: col(row, 'visited_at'),
      whatsapp: col(row, 'whatsapp') || phone,
      language: col(row, 'language') || 'en',
      sample_given: sampleVal === 'yes' || sampleVal === 'true' || sampleVal === '1',
    };
  }).filter(r => r.restaurant_name.length > 0);
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/locations/seed-followups', { method: 'POST' });
      const json = await res.json();
      if (json.success) setSyncResult(json.result);
      else alert('Sync failed: ' + json.error);
    } finally {
      setSyncing(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setPreview(rows);
      setStep('preview');
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (importing || preview.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/import/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.result);
        setStep('done');
      } else {
        alert('Import failed: ' + json.error);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Leads & Follow-ups Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Sync your SalesTracker visits into the follow-up system</p>
      </div>

      {/* Primary: Sync from SalesTracker */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Sync from SalesTracker</h2>
          <p className="text-sm text-gray-500 mt-1">Reads all places you visited from SalesTracker and creates follow-up sequences for each one. Already-synced locations are skipped.</p>
        </div>
        {syncResult ? (
          <div className="flex items-center gap-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-extrabold text-green-600">{syncResult.created}</div>
              <div className="text-xs text-gray-500">Follow-up sequences created</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold text-gray-400">{syncResult.skipped}</div>
              <div className="text-xs text-gray-500">Already synced</div>
            </div>
            <a href="/admin/follow-ups" className="ml-auto bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-lg text-sm">
              Go to Follow-ups →
            </a>
          </div>
        ) : (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            {syncing ? 'Syncing...' : '🔄 Sync SalesTracker Locations'}
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-400 font-semibold">OR — manual CSV import</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {step === 'upload' && (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-green-500 transition">
          <div className="text-4xl mb-4">📄</div>
          <p className="text-gray-700 font-semibold mb-2">Drop your CSV file here or click to browse</p>
          <p className="text-xs text-gray-400 mb-6">Export from Google Sheets: File → Download → CSV</p>
          <label className="cursor-pointer bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition">
            Choose CSV File
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        </div>
      )}

      {step === 'preview' && preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{preview.length} leads found in CSV</p>
              <p className="text-xs text-gray-500">Review below — duplicates will be skipped automatically</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep('upload'); setPreview([]); setFile(null); }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm">
                Cancel
              </button>
              <button onClick={handleImport} disabled={importing}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg text-sm shadow">
                {importing ? 'Importing...' : `Import ${preview.length} Leads`}
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    <th className="p-3 text-left">Restaurant</th>
                    <th className="p-3 text-left">Contact</th>
                    <th className="p-3 text-left">Phone / WhatsApp</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Sample</th>
                    <th className="p-3 text-left">Visit Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-900">{row.restaurant_name}</td>
                      <td className="p-3 text-gray-600">{row.contact_person || '—'}<br/><span className="text-xs text-gray-400">{row.contact_title}</span></td>
                      <td className="p-3 text-gray-600">{row.whatsapp || row.phone || '—'}</td>
                      <td className="p-3 text-gray-600 text-xs">{row.email || '—'}</td>
                      <td className="p-3 text-gray-500 text-xs">{row.business_type || '—'}</td>
                      <td className="p-3 text-center">{row.sample_given ? '✅' : '—'}</td>
                      <td className="p-3 text-gray-500 text-xs">{row.visited_at ? new Date(row.visited_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-2xl font-bold text-gray-900">Import Complete</h2>
          <div className="flex justify-center gap-8 text-sm">
            <div>
              <div className="text-3xl font-extrabold text-green-600">{result.success}</div>
              <div className="text-gray-500">Leads imported</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-gray-400">{result.skipped}</div>
              <div className="text-gray-500">Skipped (already exist)</div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="text-left bg-red-50 border border-red-200 rounded-lg p-4 text-xs text-red-700">
              <p className="font-semibold mb-1">Errors:</p>
              {result.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <p className="text-sm text-gray-500">Follow-ups have been auto-scheduled for all imported leads. Go to <strong>Follow-ups → Today</strong> to see who to contact.</p>
          <a href="/admin/follow-ups"
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded-lg text-sm mt-2">
            Go to Follow-ups →
          </a>
        </div>
      )}
    </div>
  );
}
