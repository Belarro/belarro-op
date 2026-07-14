'use client';

import React, { Suspense, useEffect, useState } from 'react';

function SettingsContent() {
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/send-followup-email/status')
      .then(r => r.json())
      .then(d => setEmailConfigured(d.configured))
      .catch(() => setEmailConfigured(false));
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-xl">📧</div>
        <div>
          <h2 className="font-bold text-gray-900">Email — hello@belarro.com</h2>
          <p className="text-sm text-gray-500">Sends follow-up emails with the flyer attached, via SMTP + App Password</p>
        </div>
      </div>

      <div className="border-t pt-4">
        {emailConfigured === null ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
            Checking...
          </div>
        ) : emailConfigured ? (
          <div className="flex items-center gap-2 text-sm text-green-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Configured — sending is active
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-red-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Not configured — set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD in Vercel env vars
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
        <p><strong>What this does:</strong> When you click the Email button on a follow-up card, the email sends instantly from hello@belarro.com with the correct flyer (EN or DE) attached. The stage is automatically logged as sent.</p>
        <p><strong>No reconnecting, ever.</strong> This uses a Gmail App Password (SMTP), not OAuth — nothing expires, nothing to reconnect.</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Integrations and configuration</p>
      </div>
      <Suspense fallback={<div className="animate-pulse h-40 bg-gray-100 rounded-xl" />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
