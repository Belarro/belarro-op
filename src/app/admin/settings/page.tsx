'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function SettingsContent() {
  const searchParams = useSearchParams();
  const gmailStatus = searchParams.get('gmail');

  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/gmail/status')
      .then(r => r.json())
      .then(d => setGmailConnected(d.connected))
      .catch(() => setGmailConnected(false))
      .finally(() => setChecking(false));
  }, [gmailStatus]);

  return (
    <>
      {gmailStatus === 'connected' && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm font-semibold">
          Gmail connected successfully. Follow-up emails will now be sent automatically with the flyer attached.
        </div>
      )}
      {gmailStatus === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-800 text-sm font-semibold">
          Gmail connection failed: {searchParams.get('reason') || 'unknown error'}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-xl">📧</div>
          <div>
            <h2 className="font-bold text-gray-900">Gmail — hello@belarro.com</h2>
            <p className="text-sm text-gray-500">Send follow-up emails directly with the flyer attached</p>
          </div>
        </div>

        <div className="border-t pt-4">
          {checking ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
              Checking connection...
            </div>
          ) : gmailConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Connected — hello@belarro.com
              </div>
              <a href="/api/auth/gmail" className="text-xs text-gray-500 hover:text-gray-700 underline">
                Reconnect
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                Not connected
              </div>
              <a
                href="/api/auth/gmail"
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
              >
                Connect Gmail
              </a>
            </div>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p><strong>What this does:</strong> When you click the Email button on a follow-up card, the email sends instantly from hello@belarro.com with the correct flyer (EN or DE) attached. The stage is automatically logged as sent.</p>
          <p><strong>You only need to connect once.</strong> The connection stays active.</p>
        </div>
      </div>
    </>
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
