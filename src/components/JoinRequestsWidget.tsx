'use client';

import { useEffect, useState } from 'react';

interface JoinRequest {
  id: string;
  email: string;
  name: string | null;
  requested_at: string;
}

export function JoinRequestsWidget() {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [setPasswordLink, setSetPasswordLink] = useState('');
  const [showCopyNotice, setShowCopyNotice] = useState(false);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 30000); // Refresh every 30 sec
    return () => clearInterval(interval);
  }, []);

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/auth/join-requests', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setRequests(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch join requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setApproving(id);
    setError('');
    try {
      const res = await fetch('/api/auth/join-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to approve request');
        return;
      }

      setSetPasswordLink(data.data.setPasswordLink);
      setShowCopyNotice(true);
      setTimeout(() => setShowCopyNotice(false), 3000);
      fetchRequests();
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('Are you sure you want to reject this request?')) return;

    try {
      const res = await fetch('/api/auth/join-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject' }),
      });

      if (res.ok) {
        fetchRequests();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to reject request');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setShowCopyNotice(true);
    setTimeout(() => setShowCopyNotice(false), 2000);
  };

  if (loading) {
    return (
      <div className="animate-pulse h-24 bg-gray-100 rounded-xl" />
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-2 border-blue-300 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-xl">👥</div>
        <div>
          <h2 className="font-bold text-gray-900">Join Requests</h2>
          <p className="text-sm text-gray-500">{requests.length} pending approval</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {setPasswordLink && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
          <p className="text-green-800 font-semibold text-sm">✓ Approved! Share this link:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={setPasswordLink}
              readOnly
              className="flex-1 px-3 py-2 text-xs bg-white border border-green-300 rounded font-mono overflow-hidden"
            />
            <button
              onClick={() => copyToClipboard(setPasswordLink)}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded transition"
            >
              Copy
            </button>
          </div>
          {showCopyNotice && <p className="text-xs text-green-700">✓ Copied to clipboard</p>}
        </div>
      )}

      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.id} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{req.name || 'No name'}</p>
              <p className="text-sm text-gray-500 truncate">{req.email}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(req.requested_at).toLocaleDateString('de-DE', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => handleApprove(req.id)}
                disabled={approving === req.id}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded transition"
              >
                {approving === req.id ? '...' : 'Approve'}
              </button>
              <button
                onClick={() => handleReject(req.id)}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-semibold rounded transition"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
