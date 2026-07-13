'use client';

import React from 'react';
import Link from 'next/link';

export default function JoinRequestsInfoPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">User Join Requests</h1>
        <p className="text-sm text-gray-500 mt-1">How the approval workflow works</p>
      </div>

      {/* Step 1 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-600">1</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">User Requests Access</h2>
            <p className="text-sm text-gray-600 mt-1">
              Users visit <code className="bg-gray-100 px-2 py-1 rounded text-xs">/join</code> and submit their email + name
            </p>
            <p className="text-sm text-gray-500 mt-2">User sees: "Request submitted. Admin will review shortly."</p>
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-600">2</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">Admin Reviews on Dashboard</h2>
            <p className="text-sm text-gray-600 mt-1">
              Go to <Link href="/admin" className="text-blue-600 hover:underline">/admin</Link> dashboard
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Look for blue <strong>"Join Requests"</strong> card at the top
            </p>
            <p className="text-sm text-gray-500 mt-2">Shows: Email, Name, Time Requested</p>
          </div>
        </div>
      </div>

      {/* Step 3 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-lg font-bold text-green-600">3</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">Admin Approves Request</h2>
            <p className="text-sm text-gray-600 mt-1">
              Click the <strong>[Approve]</strong> button
            </p>
            <p className="text-sm text-gray-600 mt-2">System generates:</p>
            <ul className="text-sm text-gray-600 mt-1 space-y-1 ml-4 list-disc">
              <li>24-hour approval token</li>
              <li>Setup link with email in query param</li>
            </ul>
            <p className="text-sm text-gray-500 mt-2">A blue box appears with the setup link</p>
          </div>
        </div>
      </div>

      {/* Step 4 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-lg font-bold text-amber-600">4</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">Admin Sends Link to User</h2>
            <p className="text-sm text-gray-600 mt-1">
              Click <strong>[Copy]</strong> button in the blue box
            </p>
            <p className="text-sm text-gray-600 mt-2">
              Send the link to user via:
            </p>
            <ul className="text-sm text-gray-600 mt-1 space-y-1 ml-4 list-disc">
              <li>Email</li>
              <li>WhatsApp / Telegram</li>
              <li>Any messaging app</li>
            </ul>
            <p className="text-sm text-gray-500 mt-2">Link format: <code className="bg-gray-100 px-1 text-xs">/set-password?token=XXX&email=user@example.com</code></p>
          </div>
        </div>
      </div>

      {/* Step 5 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-lg font-bold text-purple-600">5</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">User Clicks Link & Sets Password</h2>
            <p className="text-sm text-gray-600 mt-1">
              User receives link and clicks it
            </p>
            <p className="text-sm text-gray-600 mt-2">
              They see <code className="bg-gray-100 px-2 py-1 rounded text-xs">/set-password</code> page with:
            </p>
            <ul className="text-sm text-gray-600 mt-1 space-y-1 ml-4 list-disc">
              <li>Email (pre-filled, read-only)</li>
              <li>Password field</li>
              <li>Confirm Password field</li>
            </ul>
            <p className="text-sm text-gray-500 mt-2">Password must be 8+ characters</p>
          </div>
        </div>
      </div>

      {/* Step 6 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-lg font-bold text-green-600">6</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">User Logs In</h2>
            <p className="text-sm text-gray-600 mt-1">
              After setting password, user goes to <code className="bg-gray-100 px-2 py-1 rounded text-xs">/login</code>
            </p>
            <p className="text-sm text-gray-600 mt-2">
              Logs in with:
            </p>
            <ul className="text-sm text-gray-600 mt-1 space-y-1 ml-4 list-disc">
              <li>Email (the one they requested with)</li>
              <li>Password (the one they just set)</li>
            </ul>
            <p className="text-sm text-gray-500 mt-2">✅ User gains access to dashboard</p>
          </div>
        </div>
      </div>

      {/* Quick Reference */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-3">
        <h3 className="font-bold text-blue-900">⚡ Quick Reference</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-semibold text-blue-900">Links Users Need:</p>
            <ul className="text-blue-800 mt-2 space-y-1">
              <li>• Join page: <code className="bg-white px-1 text-xs">/join</code></li>
              <li>• Set password: <code className="bg-white px-1 text-xs">/set-password</code></li>
              <li>• Login: <code className="bg-white px-1 text-xs">/login</code></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-blue-900">Admin Actions:</p>
            <ul className="text-blue-800 mt-2 space-y-1">
              <li>• View requests: Dashboard widget</li>
              <li>• Approve: Click [Approve]</li>
              <li>• Send link: Click [Copy] button</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-800">
          <strong>⏰ Important:</strong> Setup links expire after 24 hours. If a user's link expires, they can request access again at <code className="bg-white px-1">/join</code>
        </p>
      </div>
    </div>
  );
}
