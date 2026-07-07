import { NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const rows = await fetchFromSupabase('/gmail_tokens?email=eq.hello%40belarro.com&select=email,expires_at');
    const connected = rows && rows.length > 0;
    return NextResponse.json({ connected });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
