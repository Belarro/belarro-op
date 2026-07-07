import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';

/**
 * Call at the top of every protected API route:
 *
 *   const auth = await requireAuth();
 *   if (!auth.ok) return auth.response;
 *
 * `auth.user` is the authenticated Supabase user when ok === true.
 */
export async function requireAuth() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }
  return { ok: true as const, user };
}
