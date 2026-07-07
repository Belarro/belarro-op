import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

// One-time migration: creates gmail_tokens table via Supabase Management API
// Requires SUPABASE_MANAGEMENT_TOKEN env var (Supabase personal access token)
export async function POST() {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;

  const projectRef = 'wbqzlxdyjdmbzifhsyil';
  const managementToken = process.env.SUPABASE_MANAGEMENT_TOKEN;

  if (!managementToken) {
    return NextResponse.json({
      error: 'Set SUPABASE_MANAGEMENT_TOKEN in env vars. Get it from supabase.com/dashboard/account/tokens',
    }, { status: 400 });
  }

  const sql = `
    CREATE TABLE IF NOT EXISTS gmail_tokens (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      email text NOT NULL UNIQUE,
      access_token text NOT NULL,
      refresh_token text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `;

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${managementToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'gmail_tokens table created' });
}
