import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  // No auth check here — this is the OAuth callback from Google
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/admin/settings?gmail=error&reason=${error || 'no_code'}`);
  }

  const clientId = process.env.GMAIL_CLIENT_ID!;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/auth/gmail/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('Gmail token exchange failed:', err);
    const reason = encodeURIComponent(err.slice(0, 200));
    return NextResponse.redirect(`${appUrl}/admin/settings?gmail=error&reason=${reason}`);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Store in Supabase — upsert by email (hello@belarro.com)
  await fetchFromSupabase('/gmail_tokens?email=eq.hello%40belarro.com', {
    method: 'DELETE',
  }).catch(() => {}); // ignore if not exists

  await fetchFromSupabase('/gmail_tokens', {
    method: 'POST',
    body: JSON.stringify({
      email: 'hello@belarro.com',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    }),
    headers: { 'Prefer': 'return=minimal' },
  });

  return NextResponse.redirect(`${appUrl}/admin/settings?gmail=connected`);
}
