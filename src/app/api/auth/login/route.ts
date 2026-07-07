'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcrypt';
import { fetchFromSupabase } from '@/lib/supabase';
import { signSession } from '@/lib/session';

const PASSWORD_HASH_UPGRADE_ENABLED = true;

// Best-effort in-memory brute-force limiter (resets on cold start).
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_ATTEMPTS) {
    attempts.set(ip, arr);
    return true;
  }
  arr.push(now);
  attempts.set(ip, arr);
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip') || 'unknown';
    if (rateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password required' },
        { status: 400 }
      );
    }

    const users = await fetchFromSupabase(
      `/admin_users?email=eq.${encodeURIComponent(email)}&select=id,email,password_hash,role,deleted_at`
    );

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = users[0];
    if (user.deleted_at) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }
    const storedHash = user.password_hash;
    let isValid = false;

    // Try bcrypt first (if hash starts with $2)
    if (storedHash?.startsWith('$2')) {
      try {
        isValid = await bcrypt.compare(password, storedHash);
      } catch (err) {
        isValid = false;
      }
    } else {
      // Legacy row: password stored as plaintext — plain equality only.
      // On success the hash is upgraded to bcrypt below.
      isValid = typeof storedHash === 'string' && storedHash.length > 0 && storedHash === password;
    }

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Auto-upgrade legacy hash if not bcrypt
    if (PASSWORD_HASH_UPGRADE_ENABLED && !storedHash?.startsWith('$2')) {
      const newHash = await bcrypt.hash(password, 10);
      await fetchFromSupabase(
        `/admin_users?id=eq.${user.id}`,
        { method: 'PATCH', body: JSON.stringify({ password_hash: newHash }) }
      ).catch(() => {}); // Silent fail, don't block login
    }

    const role = (user.role === 'field' || user.role === 'farm') ? user.role : 'admin';
    // Track last login (best effort; the column may not exist pre-migration)
    fetchFromSupabase(`/admin_users?id=eq.${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_login_at: new Date().toISOString() }),
    }).catch(() => {});

    const token = await signSession({ email, role, exp: Math.floor(Date.now() / 1000) + 86400 * 7 });
    const response = NextResponse.json({ success: true, user: { email, role } });

    response.cookies.set('belarro_session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    );
  }
}
