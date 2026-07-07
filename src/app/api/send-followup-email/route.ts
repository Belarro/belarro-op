import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
}
const FLYER_EN = `${SUPABASE_URL}/storage/v1/object/public/assets/flyers/flyer-en.png`;
const FLYER_DE = `${SUPABASE_URL}/storage/v1/object/public/assets/flyers/flyer-de.png`;

async function getValidAccessToken(): Promise<string> {
  const rows = await fetchFromSupabase('/gmail_tokens?email=eq.hello%40belarro.com&select=*');
  if (!rows || rows.length === 0) throw new Error('Gmail not connected. Go to Settings to connect.');

  const token = rows[0];
  const now = new Date();
  const expiresAt = new Date(token.expires_at);

  // Refresh if expired (with 60s buffer)
  if (expiresAt.getTime() - now.getTime() < 60000) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    if (!refreshRes.ok) throw new Error('Failed to refresh Gmail token. Reconnect in Settings.');
    const refreshed = await refreshRes.json();
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await fetchFromSupabase(`/gmail_tokens?id=eq.${token.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ access_token: refreshed.access_token, expires_at: newExpiry, updated_at: new Date().toISOString() }),
    });
    return refreshed.access_token;
  }

  return token.access_token;
}

function buildMimeEmail({
  to, subject, body, flyerUrl,
}: {
  to: string; subject: string; body: string; language: string; flyerUrl: string;
}): string {
  const boundary = `boundary_${Date.now()}`;

  const htmlBody = body
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;color:#222;">${line}</p>`)
    .join('\n');

  const html = [
    `<html><body style="max-width:600px;margin:0 auto;padding:20px;">`,
    htmlBody,
    `<br>`,
    `<img src="${flyerUrl}" alt="Belarro Microgreens" style="width:100%;max-width:600px;display:block;border:0;" />`,
    `</body></html>`,
  ].join('\n');

  const lines = [
    `From: Belarro Microgreens <hello@belarro.com>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ];
  return lines.join('\r\n');
}

export async function POST(request: NextRequest) {
  // CORS: only allow specific origins
  const origin = request.headers.get('origin') || '';
  const ALLOWED_ORIGINS = [
    'https://belarro.de',
    'https://www.belarro.de',
    process.env.SALETRACKER_URL || 'https://sales.belarro.com',
  ];

  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Auth: admin session cookie (web UI) OR shared secret (SalesTracker app).
    // This endpoint sends email from Ron's Gmail — it must never be open.
    const cookieToken = request.cookies.get('belarro_session')?.value;
    const session = cookieToken ? await verifySession(cookieToken) : null;
    const syncSecret = process.env.SALETRACKER_SYNC_SECRET || '';
    const headerSecret = request.headers.get('x-sync-secret');
    if (!session && (!syncSecret || headerSecret !== syncSecret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { followup_id, to, subject, body, language } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
    }

    // Fetch flyer as base64
    const flyerUrl = (language || '').toUpperCase() === 'EN' ? FLYER_EN : FLYER_DE; // default DE

    // Build MIME email — image linked directly from Supabase (no base64, no attachment)
    const raw = buildMimeEmail({ to, subject, body, language, flyerUrl });

    // Base64url encode
    const encodedEmail = Buffer.from(raw).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Get valid access token
    const accessToken = await getValidAccessToken();

    // Send via Gmail API
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      console.error('Gmail send failed:', err);
      throw new Error(`Gmail send failed: ${sendRes.status}`);
    }

    // Do NOT auto-log — user may still want to send WhatsApp too.
    // They click "Done — move to next stage" manually after sending all channels.

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('Send email error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
